// upload.js
const express = require('express');
const router = express.Router();
const auth = require('../auth.js');
const { saveUserActivity, saveFileMetadata, saveProgress } = require('../db/database.js');
const { transcodeVideoWithProgress } = require('../transcode');

router.post('/', auth.authenticateToken, async (req, res) => {
  const { fileName } = req.body;
  const username = req.user.username;

  if (!fileName) {
    return res.status(400).json({ error: 'File name is required.' });
  }

  const progressId = `${username}_${Date.now()}`;

  try {
    // Save user activity
    await saveUserActivity(
      username,
      `Started processing file: ${fileName}`
    );

    // Save file metadata
    const fileMetadata = {
      fileName: fileName,
      size: null, // Size is unknown at this point
      uploadTime: new Date().toISOString(),
      user: username,
      progressId: progressId,
      status: 'uploaded',
    };
    await saveFileMetadata(fileMetadata);

    // Initialize progress to 0%
    await saveProgress(progressId, 0, 'started');

    // Start the transcoding process
    transcodeVideoWithProgress(fileName, progressId, username)
      .then(() => {
        saveProgress(progressId, 100, 'completed');
        saveUserActivity(
          username,
          `Transcoding completed for file: ${fileName}`
        );
        console.log(`Transcoding completed for ${fileName}`);
      })
      .catch((err) => {
        console.error(`Transcoding failed for ${fileName}:`, err);
        saveProgress(progressId, 0, 'error');
        saveUserActivity(
          username,
          `Transcoding failed for file: ${fileName}`
        );
      });

    res.status(201).json({
      message:
        'File metadata saved. Transcoding has started.',
      fileName: fileName,
      progressId: progressId,
    });
  } catch (err) {
    console.error('Error handling upload:', err);
    res.status(500).json({ error: 'Failed to handle upload.' });
  }
});

module.exports = router;
