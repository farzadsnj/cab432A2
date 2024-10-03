// index.js
const express = require("express");
const cookieParser = require("cookie-parser");
const fileUpload = require("express-fileupload");
const path = require("path");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const apiRoute = require("./routes/api");
require('dotenv').config();

const app = express();
const port = 3000;

// Enable CORS for all routes with specific allowed origin
const corsOptions = {
    origin: 'http://localhost:3000',  // Replace with your frontend's origin
    credentials: true
};

app.use(cors(corsOptions));
app.use(cookieParser());

// File upload middleware
app.use(fileUpload({
    createParentPath: true,
    limits: { fileSize: 50 * 1024 * 1024 }, // Set file size limit
    debug: false
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP
  message: "Too many requests from this IP, please try again later."
});
app.use(limiter);

// Routes
const webclientRoute = require("./routes/webclient.js");
const adminRoute = require("./routes/admin.js");
const uploadRoute = require("./routes/upload.js");

// Serve static files first
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Then define routes
app.use("/api/v1", apiRoute);
app.use("/", webclientRoute);
app.use("/admin", adminRoute);
app.use("/api/v1/upload", uploadRoute);

// Error-handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, '0.0.0.0', () => {
   console.log(`Server listening on port ${port}.`);
});
