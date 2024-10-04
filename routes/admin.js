const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getUserList } = require('../db/database.js');
const { authenticateToken, authorizeAdmin } = require('../auth.js');
const { getAllFiles, deleteFile } = require('../db/database.js');
const { deleteFileFromS3 } = require('./s3_upload.js');

router.get('/files', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
      const files = await getAllFiles();

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
        await deleteFileFromS3(fileName, username);
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
    const diskSpace = os.totalmem(); 
    res.status(200).json({
      message: 'Current disk space fetched successfully',
      diskSpace: diskSpace,
    });
  });

router.get('/memory-usage', authenticateToken, authorizeAdmin, (req, res) => {
    const totalMemory = os.totalmem(); 
    const freeMemory = os.freemem(); 
    const usedMemory = totalMemory - freeMemory;

    res.status(200).json({
      message: 'Current memory usage fetched successfully',
      totalMemory: totalMemory,
      freeMemory: freeMemory,
      usedMemory: usedMemory,
    });
  });

  router.get('/cpu-info', authenticateToken, authorizeAdmin, (req, res) => {
    const cpuInfo = os.cpus(); 

    res.status(200).json({
      message: 'CPU information fetched successfully',
      cpuInfo: cpuInfo,
    });
  });

router.get('/cpu-load', authenticateToken, authorizeAdmin, (req, res) => {
    const cpuLoad = os.loadavg()[0]; 
    res.status(200).json({
      message: 'Current CPU load fetched successfully',
      cpuLoad: cpuLoad,
    });
  });

module.exports = router;
