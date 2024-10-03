// webclient.js
const express = require("express");
const router = express.Router();
const auth = require("../auth.js");
const path = require("path");

// Serve the home page
router.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Serve the registration page
router.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/register.html"));
});

// Serve the login page
router.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/login.html"));
});

// Handle user logout by clearing cookies
router.get("/logout", (req, res) => {
    res.clearCookie("token");
    res.clearCookie("username");
    res.redirect("/login");  // Redirect to login page after logout
});

// Middleware to check token validity for protected routes
router.use(async (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        return res.redirect("/login?redirected=true");
    }

    req.headers.authorization = `Bearer ${token}`;  // Set token in authorization header
    auth.authenticateToken(req, res, (err) => {
        if (err) {
            // Clear cookies and redirect to login if token is invalid or expired
            res.clearCookie("token");
            res.clearCookie("username");
            return res.redirect("/login?redirected=true");
        }
        next();  // Proceed if token is valid
    });
});

// Serve the upload page for authenticated users
router.get("/upload", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/upload.html"));
});

// Serve the admin page for users with 'admin' role
router.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/admin.html"));
});

router.use(express.static(path.join(__dirname, "../public")));

module.exports = router;
