// ========================================
// SUPABASE CONFIGURATION
// ========================================

const SUPABASE_URL = "https://pcktxqfinrkhpjdxuqdk.supabase.co";
const SUPABASE_KEY = "sb_publishable_vX5x0k9_W12tGG4FPfOqfg_nsS30fFZ";

const AUTH_STORAGE_KEY = "sb-pcktxqfinrkhpjdxuqdk-auth-token";
const REMEMBER_KEY = "remembered_login_email";
const REMEMBER_SESSION_KEY = "remember_login_session";

const customAuthStorage = {
    getItem(key) {
        return localStorage.getItem(key) || sessionStorage.getItem(key);
    },

    setItem(key, value) {
        if (localStorage.getItem(REMEMBER_SESSION_KEY) === "true") {
            localStorage.setItem(key, value);
        } else {
            sessionStorage.setItem(key, value);
        }
    },

    removeItem(key) {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
    }
};

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
        auth: {
            storage: customAuthStorage,
            storageKey: AUTH_STORAGE_KEY,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    }
);


// ========================================
// COMMON HELPERS
// ========================================

const pagePath = window.location.pathname.replace(/\/+$/, "");
const pageName = pagePath.split("/").pop() || "index";

const currentPage = pageName.includes(".")
    ? pageName
    : pageName + ".html";

const publicPages = [
    "login.html",
    "signup.html",
    "reset-password.html"
];

const isAuthPage = publicPages.includes(currentPage);

function showMessage(message, success = false) {
    const element = document.getElementById("authMessage");

    if (!element) return;

    element.textContent = message;
    element.classList.toggle("success", success);
}

function setButtonLoading(button, loading, originalText) {
    if (!button) return;

    button.disabled = loading;
    button.textContent = loading ? "Please wait..." : originalText;
}


// ========================================
// PAGE AUTHENTICATION
// ========================================

(async function initializeAuth() {

    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
        console.error(error);
    }

    const session = data?.session;









    // Login / Signup pages
    if (currentPage === "login.html" || currentPage === "signup.html") {

        if (session) {
            window.location.replace("index.html");
            return;
        }

    }

    // Reset password page
    if (currentPage === "reset-password.html") {

        const recoveryLink =
            new URLSearchParams(window.location.search).get("type") === "recovery";

        if (!session && !recoveryLink) {
            showMessage("Please request a password reset link first.");
        }

    }

    // Protected pages
    if (!isAuthPage && !session) {
        window.location.replace("login.html");
        return;
    }

    // Show authenticated page
    document.documentElement.classList.remove("auth-pending");

    // Profile and logout
    if (session) {
        setupProfile(session);
    }

    setupLogin();
    setupSignup();
    setupForgotPassword();
    setupResetPassword();

})();


// ========================================
// PROFILE AND LOGOUT
// ========================================

function setupProfile(session) {

    const profileButton = document.getElementById("profileButton");
    const profileDropdown = document.getElementById("profileDropdown");
    const profileEmail = document.getElementById("profileEmail");
    const logoutButton = document.getElementById("logoutButton");

    if (profileEmail) {
        profileEmail.textContent = session.user.email;
    }

    if (profileButton && profileDropdown) {

        profileButton.addEventListener("click", function (event) {
            event.stopPropagation();
            profileDropdown.classList.toggle("show");
        });

        document.addEventListener("click", function (event) {

            if (
                !profileButton.contains(event.target) &&
                !profileDropdown.contains(event.target)
            ) {
                profileDropdown.classList.remove("show");
            }

        });

    }

    if (logoutButton) {

        logoutButton.addEventListener("click", async function () {

            logoutButton.disabled = true;

            await supabaseClient.auth.signOut();

            localStorage.removeItem(AUTH_STORAGE_KEY);
            sessionStorage.removeItem(AUTH_STORAGE_KEY);
            localStorage.removeItem(REMEMBER_SESSION_KEY);

            window.location.replace("login.html");

        });

    }

}


// ========================================
// LOGIN
// ========================================

function setupLogin() {

    const form = document.getElementById("loginForm");

    if (!form) return;

    const button = document.getElementById("loginButton");
    const rememberCheckbox = document.getElementById("remember");

    const emailInput = document.getElementById("email");

    if (localStorage.getItem(REMEMBER_KEY)) {
        emailInput.value = localStorage.getItem(REMEMBER_KEY);
        rememberCheckbox.checked = true;
    }

    form.addEventListener("submit", async function (event) {

        event.preventDefault();

        const email = emailInput.value.trim();
        const password = document.getElementById("password").value;
        const remember = rememberCheckbox.checked;

        if (remember) {
            localStorage.setItem(REMEMBER_KEY, email);
            localStorage.setItem(REMEMBER_SESSION_KEY, "true");
        } else {
            localStorage.removeItem(REMEMBER_KEY);
            localStorage.removeItem(REMEMBER_SESSION_KEY);
            localStorage.removeItem(AUTH_STORAGE_KEY);
        }

        setButtonLoading(button, true, "Login");

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) {

            showMessage(error.message);
            setButtonLoading(button, false, "Login");
            return;

        }

        showMessage("Login successful!", true);

        window.location.replace("index.html");

    });

}


// ========================================
// SIGNUP
// ========================================

function setupSignup() {

    const form = document.getElementById("signupForm");

    if (!form) return;

    const button = document.getElementById("signupButton");

    form.addEventListener("submit", async function (event) {

        event.preventDefault();

        const name = document.getElementById("name").value.trim();
        const email = document.getElementById("signupEmail").value.trim();
        const password = document.getElementById("signupPassword").value;
        const confirmPassword = document.getElementById("confirmPassword").value;

        if (password !== confirmPassword) {
            showMessage("Passwords do not match.");
            return;
        }

        setButtonLoading(button, true, "Sign Up");

        const { data, error } = await supabaseClient.auth.signUp({

            email,
            password,

            options: {
                data: {
                    full_name: name
                }
            }

        });

        if (error) {

            showMessage(error.message);
            setButtonLoading(button, false, "Sign Up");
            return;

        }

        if (data.session) {

            showMessage("Account created successfully!", true);
            window.location.replace("index.html");

        } else {

            showMessage(
                "Account created! Please check your email to confirm your account.",
                true
            );

            setButtonLoading(button, false, "Sign Up");

        }

    });

}


// ========================================
// FORGOT PASSWORD
// ========================================

function setupForgotPassword() {

    const forgotLink = document.getElementById("forgotPassword");

    if (!forgotLink) return;

    forgotLink.addEventListener("click", async function (event) {

        event.preventDefault();

        const email = document.getElementById("email").value.trim();

        if (!email) {
            showMessage("Please enter your email address first.");
            document.getElementById("email").focus();
            return;
        }

        const redirectURL =
            window.location.origin +
            window.location.pathname.replace(/[^/]*$/, "") +
            "reset-password.html?type=recovery";

        const { error } = await supabaseClient.auth.resetPasswordForEmail(
            email,
            {
                redirectTo: redirectURL
            }
        );

        if (error) {
            showMessage(error.message);
            return;
        }

        showMessage("Password reset link has been sent to your email.", true);

    });

}


// ========================================
// RESET PASSWORD
// ========================================

function setupResetPassword() {

    const form = document.getElementById("resetPasswordForm");

    if (!form) return;

    const button = document.getElementById("resetButton");

    form.addEventListener("submit", async function (event) {

        event.preventDefault();

        const password = document.getElementById("newPassword").value;
        const confirmPassword = document.getElementById("confirmNewPassword").value;

        if (password !== confirmPassword) {
            showMessage("Passwords do not match.");
            return;
        }

        if (password.length < 6) {
            showMessage("Password must be at least 6 characters.");
            return;
        }

        setButtonLoading(button, true, "Update Password");

        const { data: sessionData } = await supabaseClient.auth.getSession();

        if (!sessionData.session) {

            showMessage("Password reset session expired. Please request a new link.");
            setButtonLoading(button, false, "Update Password");
            return;

        }

        const { error } = await supabaseClient.auth.updateUser({
            password
        });

        if (error) {

            showMessage(error.message);
            setButtonLoading(button, false, "Update Password");
            return;

        }

        await supabaseClient.auth.signOut();

        localStorage.removeItem(AUTH_STORAGE_KEY);
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
        localStorage.removeItem(REMEMBER_SESSION_KEY);

        showMessage("Password updated successfully! Please login.", true);

        setTimeout(function () {
            window.location.replace("login.html");
        }, 1500);

    });

}