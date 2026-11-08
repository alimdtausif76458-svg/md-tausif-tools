const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const crypto = require("crypto");

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const app = express();
const execFileAsync = promisify(execFile);

const PORT = process.env.PORT || 3000;

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY
);

// =====================================
// SUPABASE AUTHENTICATION
// =====================================

async function verifyUser(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                error: "Authentication required. Please login."
            });
        }

        const token = authHeader.split(" ")[1];

        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data.user) {
            return res.status(401).json({
                error: "Invalid or expired login session."
            });
        }

        req.user = data.user;
        next();

    } catch (error) {
        console.error("Authentication error:", error.message);

        return res.status(401).json({
            error: "Authentication failed."
        });
    }
}

// =====================================
// GHOSTSCRIPT CONFIGURATION
// =====================================

const GS_PATH = process.env.GS_PATH || (
    process.platform === "win32"
        ? "C:\\Program Files (x86)\\gs\\gs10.08.0\\bin\\gswin32c.exe"
        : "gs"
);

const UPLOAD_DIR = path.join(__dirname, "uploads");

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// =====================================
// CORS CONFIGURATION
// =====================================

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (
            !origin ||
            allowedOrigins.includes("*") ||
            allowedOrigins.includes(origin)
        ) {
            return callback(null, true);
        }

        return callback(
            new Error("Origin not allowed by CORS: " + origin)
        );
    },

    exposedHeaders: [
        "X-Output-Size-KB",
        "X-Compression-Percent",
        "X-Target-Reached"
    ],

    // FIXED: Authorization header added
    allowedHeaders: [
        "Content-Type",
        "X-Job-Id",
        "Authorization"
    ]
}));

app.use(express.json());

// =====================================
// HEALTH CHECK
// =====================================

app.get("/", (req, res) => {
    res.json({
        status: "ok",
        service: "MD Tausif Tools PDF Compressor API"
    });
});

// =====================================
// PROGRESS STORAGE
// =====================================

const progressJobs = new Map();

function setProgress(jobId, percent, message, status = "processing") {

    if (!jobId) return;

    const currentJob = progressJobs.get(jobId) || {
        history: [],
        ownerUserId: null
    };

    const update = {
        percent: Math.min(100, Math.max(0, Math.floor(percent))),
        message,
        status,
        time: Date.now()
    };

    currentJob.percent = update.percent;
    currentJob.message = message;
    currentJob.status = status;

    currentJob.history.push(update);

    progressJobs.set(jobId, currentJob);
}

// =====================================
// PROGRESS API
// =====================================

app.get("/progress/:jobId", verifyUser, (req, res) => {

    const job = progressJobs.get(req.params.jobId);

    if (!job || job.ownerUserId !== req.user.id) {
        return res.status(404).json({
            error: "Progress job not found"
        });
    }

    res.json({
        percent: job.percent,
        message: job.message,
        status: job.status,
        updates: job.history
    });
});

// =====================================
// MULTER CONFIGURATION
// =====================================

const storage = multer.diskStorage({

    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },

    filename: (req, file, cb) => {
        const uniqueName =
            Date.now() + "-" + crypto.randomUUID() + ".pdf";

        cb(null, uniqueName);
    }

});

const upload = multer({

    storage: storage,

    limits: {
        fileSize: 50 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {

        if (
            file.mimetype === "application/pdf" ||
            path.extname(file.originalname).toLowerCase() === ".pdf"
        ) {
            cb(null, true);
        } else {
            cb(new Error("Only PDF files are allowed"));
        }
    }

});

// =====================================
// FILE SIZE FUNCTION
// =====================================

function getFileSize(filePath) {
    return fs.statSync(filePath).size;
}

// =====================================
// GHOSTSCRIPT COMPRESSION
// =====================================

async function compressPDF(
    inputFile,
    outputFile,
    pdfSetting,
    resolution
) {

    const args = [

        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        "-dNOPAUSE",
        "-dBATCH",
        "-dQUIET",
        "-dSAFER",
        "-dDetectDuplicateImages=true",
        "-dCompressFonts=true",
        "-dSubsetFonts=true",
        "-dAutoRotatePages=/None",
        "-dDownsampleColorImages=true",
        "-dDownsampleGrayImages=true",
        "-dDownsampleMonoImages=true",
        "-dColorImageDownsampleType=/Bicubic",
        "-dGrayImageDownsampleType=/Bicubic",
        "-dMonoImageDownsampleType=/Subsample",
        "-dColorImageResolution=" + resolution,
        "-dGrayImageResolution=" + resolution,
        "-dMonoImageResolution=" + resolution,
        "-dColorImageDownsampleThreshold=1.0",
        "-dGrayImageDownsampleThreshold=1.0",
        "-dMonoImageDownsampleThreshold=1.0",
        "-dPDFSETTINGS=" + pdfSetting,
        "-sOutputFile=" + outputFile,
        inputFile

    ];

    await execFileAsync(GS_PATH, args, {
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024
    });
}

// =====================================
// COMPRESSION SETTINGS
// =====================================

const compressionSettings = {

    extreme: {
        name: "Extreme Compression",
        pdfSetting: "/screen",
        resolutions: [
            36, 50, 60, 72, 85, 100,
            120, 150, 180, 220, 300
        ],
        strategy: "smallest"
    },

    recommended: {
        name: "Recommended Compression",
        pdfSetting: "/ebook",
        resolutions: [
            50, 72, 90, 110, 130,
            150, 180, 220, 260, 300
        ],
        strategy: "balanced"
    },

    less: {
        name: "Less Compression",
        pdfSetting: "/printer",
        resolutions: [
            72, 90, 110, 130, 150,
            180, 220, 260, 300
        ],
        strategy: "highest"
    },

    target: {
        name: "Target Size",
        pdfSetting: "/ebook",
        resolutions: [
            36, 50, 60, 72, 85, 100,
            120, 150, 180, 220, 260, 300
        ],
        strategy: "target"
    }

};

// =====================================
// MAIN COMPRESSION API
// =====================================

app.post(
    "/compress",

    verifyUser,

    (req, res, next) => {

        const jobId =
            req.headers["x-job-id"] || crypto.randomUUID();

        req.jobId = jobId;

        setProgress(
            jobId,
            1,
            "Preparing PDF compression..."
        );

        const job = progressJobs.get(jobId);
        job.ownerUserId = req.user.id;

        next();
    },

    upload.single("pdf"),

    async (req, res) => {

        const jobId = req.jobId;

        let inputFile = null;
        let finalFile = null;

        const tempFiles = [];

        try {

            // CHECK PDF

            if (!req.file) {
                throw new Error("Please upload a PDF file");
            }

            inputFile = req.file.path;

            const originalSize = getFileSize(inputFile);

            setProgress(
                jobId,
                3,
                "PDF uploaded successfully"
            );

            // COMPRESSION LEVEL

            const compressionLevel =
                req.body.compressionLevel || "recommended";

            const settings =
                compressionSettings[compressionLevel];

            if (!settings) {
                throw new Error("Invalid compression level");
            }

            // TARGET SIZE VALIDATION

            let targetSize = null;

            if (compressionLevel === "target") {

                targetSize = Number(req.body.targetSize);

                if (
                    !Number.isFinite(targetSize) ||
                    targetSize <= 0 ||
                    targetSize > 50000
                ) {
                    throw new Error(
                        "Target size must be between 1 and 50000 KB"
                    );
                }
            }

            // CREATE OUTPUT FILE

            finalFile = path.join(
                UPLOAD_DIR,
                "compressed-" + crypto.randomUUID() + ".pdf"
            );

            // COMPRESSION CANDIDATES

            const resolutions = settings.resolutions;
            const candidates = [];
            const totalTasks = resolutions.length;

            setProgress(
                jobId,
                4,
                "Starting PDF compression..."
            );

            for (let i = 0; i < resolutions.length; i++) {

                const resolution = resolutions[i];

                const candidateFile = path.join(
                    UPLOAD_DIR,
                    "candidate-" + crypto.randomUUID() + ".pdf"
                );

                tempFiles.push(candidateFile);

                setProgress(
                    jobId,
                    4 + Math.floor((i / totalTasks) * 88),
                    "Compressing PDF: " +
                    resolution +
                    " DPI (" +
                    (i + 1) +
                    "/" +
                    totalTasks +
                    ")"
                );

                try {

                    await compressPDF(
                        inputFile,
                        candidateFile,
                        settings.pdfSetting,
                        resolution
                    );

                    if (!fs.existsSync(candidateFile)) {
                        continue;
                    }

                    const outputSize = getFileSize(candidateFile);

                    if (outputSize > 0) {
                        candidates.push({
                            file: candidateFile,
                            size: outputSize,
                            resolution: resolution
                        });
                    }

                } catch (error) {

                    console.log(
                        "Compression candidate failed:",
                        resolution,
                        error.message
                    );

                }

                const progress =
                    4 + Math.floor(
                        ((i + 1) / totalTasks) * 88
                    );

                setProgress(
                    jobId,
                    progress,
                    "Completed compression: " +
                    resolution +
                    " DPI"
                );
            }

            // CHECK CANDIDATES

            if (candidates.length === 0) {
                throw new Error(
                    "PDF compression failed. Please try another PDF."
                );
            }

            setProgress(
                jobId,
                94,
                "Selecting best compressed PDF..."
            );

            // REMOVE LARGER FILES

            const validCandidates = candidates.filter(
                candidate => candidate.size <= originalSize
            );

            if (validCandidates.length === 0) {

                fs.copyFileSync(inputFile, finalFile);

            } else {

                let bestCandidate = null;

                // EXTREME

                if (settings.strategy === "smallest") {

                    bestCandidate = validCandidates.reduce(
                        (best, current) => {
                            return current.size < best.size
                                ? current
                                : best;
                        }
                    );

                }

                // RECOMMENDED

                else if (settings.strategy === "balanced") {

                    bestCandidate = validCandidates.reduce(
                        (best, current) => {

                            return Math.abs(
                                current.resolution - 150
                            ) < Math.abs(
                                best.resolution - 150
                            )
                                ? current
                                : best;
                        }
                    );

                }

                // LESS COMPRESSION

                else if (settings.strategy === "highest") {

                    bestCandidate = validCandidates.reduce(
                        (best, current) => {
                            return current.resolution > best.resolution
                                ? current
                                : best;
                        }
                    );

                }

                // TARGET SIZE

                else if (settings.strategy === "target") {

                    const targetBytes = targetSize * 1024;

                    bestCandidate = validCandidates.reduce(
                        (best, current) => {

                            return Math.abs(
                                current.size - targetBytes
                            ) < Math.abs(
                                best.size - targetBytes
                            )
                                ? current
                                : best;
                        }
                    );

                }

                if (!bestCandidate) {
                    throw new Error(
                        "Unable to select compressed PDF"
                    );
                }

                fs.copyFileSync(
                    bestCandidate.file,
                    finalFile
                );
            }

            // FINAL FILE SIZE

            const finalSize = getFileSize(finalFile);

            const outputKB = finalSize / 1024;

            const compressionPercent =
                originalSize > 0
                    ? (
                        (originalSize - finalSize) /
                        originalSize
                    ) * 100
                    : 0;

            const targetReached =
                compressionLevel === "target"
                    ? outputKB <= targetSize
                    : false;

            // RESPONSE HEADERS

            res.setHeader(
                "X-Output-Size-KB",
                outputKB.toFixed(2)
            );

            res.setHeader(
                "X-Compression-Percent",
                compressionPercent.toFixed(2)
            );

            res.setHeader(
                "X-Target-Reached",
                String(targetReached)
            );

            setProgress(
                jobId,
                97,
                "Preparing compressed PDF for download..."
            );

            // DOWNLOAD

            res.download(
                finalFile,
                "compressed.pdf",
                (error) => {

                    const filesToDelete = [
                        inputFile,
                        finalFile,
                        ...tempFiles
                    ];

                    for (const file of filesToDelete) {

                        if (file && fs.existsSync(file)) {
                            try {
                                fs.unlinkSync(file);
                            } catch (cleanupError) {
                                console.log(
                                    "Cleanup error:",
                                    cleanupError.message
                                );
                            }
                        }
                    }

                    if (error) {

                        console.log(
                            "Download error:",
                            error.message
                        );

                        setProgress(
                            jobId,
                            100,
                            "Download failed",
                            "error"
                        );

                    } else {

                        setProgress(
                            jobId,
                            100,
                            "Compression completed successfully!",
                            "complete"
                        );

                    }

                    setTimeout(() => {
                        progressJobs.delete(jobId);
                    }, 60000);

                }
            );

        } catch (error) {

            console.log(
                "Compression error:",
                error.message
            );

            const filesToDelete = [
                inputFile,
                finalFile,
                ...tempFiles
            ];

            for (const file of filesToDelete) {

                if (file && fs.existsSync(file)) {
                    try {
                        fs.unlinkSync(file);
                    } catch (cleanupError) {
                        console.log(cleanupError.message);
                    }
                }
            }

            setProgress(
                jobId,
                100,
                error.message,
                "error"
            );

            setTimeout(() => {
                progressJobs.delete(jobId);
            }, 60000);

            if (!res.headersSent) {
                res.status(500).json({
                    error: error.message
                });
            }
        }
    }
);

// =====================================
// MULTER ERROR HANDLER
// =====================================

app.use((error, req, res, next) => {

    console.log("Server error:", error.message);

    if (req.jobId) {

        setProgress(
            req.jobId,
            100,
            error.message,
            "error"
        );

        setTimeout(() => {
            progressJobs.delete(req.jobId);
        }, 60000);
    }

    if (!res.headersSent) {
        res.status(400).json({
            error: error.message
        });
    }
});

// =====================================
// SERVER START
// =====================================

app.listen(PORT, "0.0.0.0", () => {

    console.log("-----------------------------------");
    console.log("PDF COMPRESSOR SERVER RUNNING");
    console.log("Port: " + PORT);
    console.log("Ghostscript executable: " + GS_PATH);
    console.log("-----------------------------------");

});