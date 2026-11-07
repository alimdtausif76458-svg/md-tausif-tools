


/*const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");

const app = express();
const execFileAsync = promisify(execFile);

app.use(cors({
    exposedHeaders: [
        "X-Output-Size-KB",
        "X-Compression-Percent",
        "X-Target-Reached"
    ]
}));

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
    dest: uploadDir,
    limits: {
        fileSize: 50 * 1024 * 1024
    }
});

// GHOSTSCRIPT PATH
const gs = "C:\\Program Files (x86)\\gs\\gs10.08.0\\bin\\gswin32c.exe";


app.get("/", (req, res) => {
    res.send("PDF Compressor Backend Running");
});


// PDF COMPRESSION
app.post("/compress", upload.single("pdf"), async (req, res) => {

    let inputFile;
    let finalFile;

    const tempFiles = [];

    try {

        if (!req.file) {
            throw new Error("Please select PDF");
        }

        inputFile = req.file.path;

        const extension = path.extname(
            req.file.originalname
        ).toLowerCase();

        if (extension !== ".pdf") {
            throw new Error("Only PDF files allowed");
        }

        if (!fs.existsSync(gs)) {
            throw new Error("Ghostscript not found. Check Ghostscript path.");
        }


        // COMPRESSION LEVEL
        const level = req.body.compressionLevel || "recommended";


        // FOUR COMPRESSION SETTINGS
        const settings = {

            extreme: {
                preset: "/screen",
                resolutions: [36, 50, 60, 72, 85, 100, 120, 150, 180, 220, 300],
                strategy: "smallest"
            },

            recommended: {
                preset: "/ebook",
                resolutions: [50, 72, 90, 110, 130, 150, 180, 220, 260, 300],
                strategy: "balanced"
            },

            less: {
                preset: "/printer",
                resolutions: [72, 90, 110, 130, 150, 180, 220, 260, 300],
                strategy: "highest"
            },

            target: {
                preset: "/ebook",
                resolutions: [36, 50, 60, 72, 85, 100, 120, 150, 180, 220, 260, 300],
                strategy: "target"
            }

        };


        const selected = settings[level];

        if (!selected) {
            throw new Error("Invalid compression level");
        }


        // TARGET SIZE VALIDATION ONLY FOR OPTION FOUR
        let targetSize = null;

        if (level === "target") {

            targetSize = Number(req.body.targetSize);

            if (!Number.isFinite(targetSize) || targetSize <= 0) {
                throw new Error("Enter valid target size in KB");
            }

            if (targetSize > 50000) {
                throw new Error("Target size must be 50000 KB or less");
            }

        }


        const id = Date.now() + "-" + Math.random().toString(36).slice(2, 8);

        finalFile = path.join(
            uploadDir,
            id + "-compressed.pdf"
        );


        const originalSize = fs.statSync(inputFile).size;

        const targetBytes = targetSize ? targetSize * 1024 : null;


        // ORIGINAL PDF CANDIDATE
        const results = [{
            name: "Original",
            file: inputFile,
            size: originalSize,
            resolution: 0
        }];


        // GENERATE DIFFERENT PDF VERSIONS
        for (let i = 0; i < selected.resolutions.length; i++) {

            const resolution = selected.resolutions[i];

            const output = path.join(
                uploadDir,
                id + "-option-" + i + ".pdf"
            );

            tempFiles.push(output);


            const args = [

                "-sDEVICE=pdfwrite",

                "-dCompatibilityLevel=1.4",

                `-dPDFSETTINGS=${selected.preset}`,

                "-dNOPAUSE",
                "-dBATCH",
                "-dQUIET",
                "-dSAFER",

                "-dDetectDuplicateImages=true",
                "-dCompressFonts=true",
                "-dSubsetFonts=true",

                "-dDownsampleColorImages=true",
                "-dDownsampleGrayImages=true",
                "-dDownsampleMonoImages=true",

                "-dColorImageDownsampleType=/Bicubic",
                "-dGrayImageDownsampleType=/Bicubic",

                "-dColorImageDownsampleThreshold=1.0",
                "-dGrayImageDownsampleThreshold=1.0",

                `-dColorImageResolution=${resolution}`,
                `-dGrayImageResolution=${resolution}`,
                `-dMonoImageResolution=${resolution}`,

                "-dAutoRotatePages=/None",

                `-sOutputFile=${output}`,

                inputFile

            ];


            await execFileAsync(gs, args, {
                windowsHide: true,
                timeout: 120000,
                maxBuffer: 10 * 1024 * 1024
            });


            if (fs.existsSync(output)) {

                const size = fs.statSync(output).size;

                // Never select a larger PDF than original
                if (size > 0 && size <= originalSize) {

                    results.push({
                        name: resolution + " DPI",
                        file: output,
                        size: size,
                        resolution: resolution
                    });

                }

            }

        }


        // SELECT BEST PDF ACCORDING TO USER OPTION
        let best = results[0];


        if (selected.strategy === "smallest") {

            // OPTION 1: EXTREME COMPRESSION
            best = results.reduce((a, b) =>
                b.size < a.size ? b : a
            );

        }


        else if (selected.strategy === "balanced") {

            // OPTION 2: RECOMMENDED COMPRESSION
            // Select candidate closest to 150 DPI

            const candidates = results.filter(
                item => item.resolution > 0
            );

            if (candidates.length > 0) {

                best = candidates.reduce((a, b) =>
                    Math.abs(b.resolution - 150) <
                    Math.abs(a.resolution - 150) ? b : a
                );

            }

        }


        else if (selected.strategy === "highest") {

            // OPTION 3: LESS COMPRESSION
            // Select highest available resolution

            const candidates = results.filter(
                item => item.resolution > 0
            );

            if (candidates.length > 0) {

                best = candidates.reduce((a, b) =>
                    b.resolution > a.resolution ? b : a
                );

            }

        }


        else if (selected.strategy === "target") {

            // OPTION 4: TARGET SIZE

            best = results.reduce((a, b) => {

                const differenceA = Math.abs(
                    a.size - targetBytes
                );

                const differenceB = Math.abs(
                    b.size - targetBytes
                );

                return differenceB < differenceA ? b : a;

            });

        }


        // SAVE FINAL PDF
        fs.copyFileSync(best.file, finalFile);


        const compressedSize = fs.statSync(finalFile).size;

        const actualKB = compressedSize / 1024;

        const percentage = (
            ((originalSize - compressedSize) / originalSize) * 100
        ).toFixed(2);


        // TARGET REACHED STATUS
        let targetReached = "not-applicable";

        if (level === "target") {

            targetReached = actualKB <= targetSize
                ? "true"
                : "false";

        }


        // RESPONSE HEADERS
        res.setHeader(
            "X-Output-Size-KB",
            actualKB.toFixed(2)
        );

        res.setHeader(
            "X-Compression-Percent",
            percentage
        );

        res.setHeader(
            "X-Target-Reached",
            targetReached
        );


        // DOWNLOAD PDF
        res.download(
            finalFile,
            "compressed.pdf",
            (err) => {

                if (inputFile && fs.existsSync(inputFile)) {
                    fs.unlinkSync(inputFile);
                }

                for (const file of tempFiles) {

                    if (fs.existsSync(file)) {
                        fs.unlinkSync(file);
                    }

                }

                if (finalFile && fs.existsSync(finalFile)) {
                    fs.unlinkSync(finalFile);
                }

                if (err) {
                    console.log("Download Error:", err);
                }

            }
        );


        // SERVER LOG
        console.log("--------------------------------");
        console.log("PDF COMPRESSION SUCCESS");
        console.log("Mode:", level);
        console.log("Original:", (originalSize / 1024).toFixed(2), "KB");

        if (level === "target") {
            console.log("Target:", targetSize, "KB");
        }

        console.log("Output:", actualKB.toFixed(2), "KB");
        console.log("Saved:", percentage + "%");
        console.log("Selected:", best.name);
        console.log("--------------------------------");


    }

    catch (error) {

        console.log("Compression Error:", error);

        if (inputFile && fs.existsSync(inputFile)) {
            fs.unlinkSync(inputFile);
        }

        for (const file of tempFiles) {

            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }

        }

        if (finalFile && fs.existsSync(finalFile)) {
            fs.unlinkSync(finalFile);
        }

        if (!res.headersSent) {

            res.status(500).json({
                error: error.message
            });

        }

    }

});

// START SERVER
const PORT = 3000;

const server = app.listen(PORT, "0.0.0.0", () => {
    console.log("================================");
    console.log("PDF COMPRESSOR BACKEND STARTED");
    console.log("Server: http://localhost:3000");
    console.log("================================");
});

server.on("error", (err) => {
    console.error("SERVER ERROR:", err.message);
});*/











const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const crypto = require("crypto");

const app = express();
const execFileAsync = promisify(execFile);

const PORT = process.env.PORT || 3000;

// Set GS_PATH in hosting environment if Ghostscript is not on PATH.
// Windows local development uses the user's installed Ghostscript path;
// Docker/Linux hosting uses the "gs" executable installed by Dockerfile.
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
// CORS
// =====================================

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // No Origin is used by health checks / command-line clients.
        if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error("Origin not allowed by CORS: " + origin));
    },
    exposedHeaders: [
        "X-Output-Size-KB",
        "X-Compression-Percent",
        "X-Target-Reached"
    ],
    allowedHeaders: [
        "Content-Type",
        "X-Job-Id"
    ]
}));

app.use(express.json());

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
        history: []
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

app.get("/progress/:jobId", (req, res) => {

    const job = progressJobs.get(req.params.jobId);

    if (!job) {
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

    (req, res, next) => {

        const jobId =
            req.headers["x-job-id"] || crypto.randomUUID();

        req.jobId = jobId;

        setProgress(
            jobId,
            1,
            "Preparing PDF compression..."
        );

        next();

    },

    upload.single("pdf"),

    async (req, res) => {

        const jobId = req.jobId;

        let inputFile = null;
        let finalFile = null;

        const tempFiles = [];

        try {

            // =====================================
            // CHECK PDF
            // =====================================

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

            // =====================================
            // GET COMPRESSION LEVEL
            // =====================================

            const compressionLevel =
                req.body.compressionLevel || "recommended";

            const settings =
                compressionSettings[compressionLevel];

            if (!settings) {

                throw new Error("Invalid compression level");

            }

            // =====================================
            // TARGET SIZE VALIDATION
            // =====================================

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

            // =====================================
            // CREATE OUTPUT FILE
            // =====================================

            finalFile = path.join(
                UPLOAD_DIR,
                "compressed-" + crypto.randomUUID() + ".pdf"
            );

            // =====================================
            // GENERATE COMPRESSION CANDIDATES
            // =====================================

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
                    "candidate-" +
                    crypto.randomUUID() +
                    ".pdf"
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

                    const outputSize =
                        getFileSize(candidateFile);

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

            // =====================================
            // CHECK CANDIDATES
            // =====================================

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

            // =====================================
            // REMOVE FILES BIGGER THAN ORIGINAL
            // =====================================

            let validCandidates = candidates.filter(
                candidate => candidate.size <= originalSize
            );

            // If every compressed candidate is larger,
            // use original PDF rather than returning a larger file.

            if (validCandidates.length === 0) {

                fs.copyFileSync(inputFile, finalFile);

            } else {

                let bestCandidate = null;

                // =====================================
                // EXTREME: SMALLEST FILE
                // =====================================

                if (settings.strategy === "smallest") {

                    bestCandidate = validCandidates.reduce(
                        (best, current) => {

                            return current.size < best.size
                                ? current
                                : best;

                        }
                    );

                }

                // =====================================
                // RECOMMENDED: BALANCED QUALITY
                // =====================================

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

                // =====================================
                // LESS: HIGHEST AVAILABLE RESOLUTION
                // =====================================

                else if (settings.strategy === "highest") {

                    bestCandidate = validCandidates.reduce(
                        (best, current) => {

                            return current.resolution > best.resolution
                                ? current
                                : best;

                        }
                    );

                }

                // =====================================
                // TARGET: CLOSEST FILE SIZE
                // =====================================

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

            // =====================================
            // FINAL FILE SIZE
            // =====================================

            const finalSize = getFileSize(finalFile);

            const originalKB = originalSize / 1024;

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

            // =====================================
            // RESPONSE HEADERS
            // =====================================

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

            // =====================================
            // DOWNLOAD
            // =====================================

            res.download(
                finalFile,
                "compressed.pdf",
                (error) => {

                    // Cleanup uploaded and temporary files

                    const filesToDelete = [
                        inputFile,
                        finalFile,
                        ...tempFiles
                    ];

                    for (const file of filesToDelete) {

                        if (
                            file &&
                            fs.existsSync(file)
                        ) {

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

                    // Remove progress history after 60 seconds

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

            // Cleanup after error

            const filesToDelete = [
                inputFile,
                finalFile,
                ...tempFiles
            ];

            for (const file of filesToDelete) {

                if (
                    file &&
                    fs.existsSync(file)
                ) {

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