const express = require("express");
const router = express.Router();
const auth = require("../auth.js");
const path = require("path");

router.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/index.html"));
});

router.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/register.html"));
});

router.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/login.html"));
});

router.get("/logout", (req, res) => {
    res.clearCookie("token");
    res.clearCookie("username");
    res.redirect("/login"); 
});

router.use(async (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        return res.redirect("/login?redirected=true");
    }

    req.headers.authorization = `Bearer ${token}`; 
    auth.authenticateToken(req, res, (err) => {
        if (err) {
            res.clearCookie("token");
            res.clearCookie("username");
            return res.redirect("/login?redirected=true");
        }
        next(); 
    });
});

router.get("/upload", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/upload.html"));
});

router.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/admin.html"));
});

router.use(express.static(path.join(__dirname, "../public")));

module.exports = router;
