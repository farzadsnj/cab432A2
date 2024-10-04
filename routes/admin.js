const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getUserList } = require('../db/database.js');
const { authenticateToken, authorizeAdmin } = require('../auth.js');
const { getAllFiles, deleteFile } = require('../db/database.js');
const { deleteFileFromS3 } = require('./s3_upload.js');

// GET /admin/files route to list all uploaded files (admin only)
router.get('/files', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
      // Fetch all files from the database
      const files = await getAllFiles(); // Ensure this function is correctly implemented in your database.js
      
      // Add presigned URL for each file from S3
      for (let file of files) {
          file.presignedUrl = await generatePresignedDownloadUrl(file.fileName, file.user);
      }

      res.status(200).json({
          message: 'Files listed successfully',
          files
      });
  } catch (error) {
      console.error('Error fetching files:', error);
      res.status(500).json({ error: 'An internal error occurred while fetching files.' });
  }
});

// GET /admin/users route to list all users (admin only)
router.get('/users', authenticateToken, authorizeAdmin, (req, res) => {
    getUserList((err, users) => {
        if (err) {
            return res.status(500).json({ error: "Unable to fetch user list" });
        }

        res.status(200).json({
            message: 'Users listed successfully',
            users
        });
    });
});

router.post('/delete-file', authenticateToken, authorizeAdmin, async (req, res) => {
    const { username, fileName } = req.body;

    if (!username || !fileName) {
        return res.status(400).json({ error: 'Username and file name are required.' });
    }

    try {
        // Delete file from S3
        await deleteFileFromS3(fileName, username);

        // Delete file metadata from database
        await deleteFile(username, fileName);

        res.status(200).json({
            message: 'File deleted successfully.',
        });
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({
            error: 'An internal error occurred while deleting the file.',
        });
    }
});

router.get('/disk-space', authenticateToken, authorizeAdmin, (req, res) => {
    const diskSpace = os.totalmem(); // Total system memory in bytes
    res.status(200).json({
      message: 'Current disk space fetched successfully',
      diskSpace: diskSpace,
    });
  });

router.get('/memory-usage', authenticateToken, authorizeAdmin, (req, res) => {
    const totalMemory = os.totalmem(); // Total system memory in bytes
    const freeMemory = os.freemem(); // Free system memory in bytes
    const usedMemory = totalMemory - freeMemory;

    res.status(200).json({
      message: 'Current memory usage fetched successfully',
      totalMemory: totalMemory,
      freeMemory: freeMemory,
      usedMemory: usedMemory,
    });
  });

  router.get('/cpu-info', authenticateToken, authorizeAdmin, (req, res) => {
    const cpuInfo = os.cpus(); // Information about each CPU core

    res.status(200).json({
      message: 'CPU information fetched successfully',
      cpuInfo: cpuInfo,
    });
  });

router.get('/cpu-load', authenticateToken, authorizeAdmin, (req, res) => {
    const cpuLoad = os.loadavg()[0]; // 1-minute load average
    res.status(200).json({
      message: 'Current CPU load fetched successfully',
      cpuLoad: cpuLoad,
    });
  });

module.exports = router;
