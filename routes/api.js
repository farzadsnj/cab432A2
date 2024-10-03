// api.js
const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../auth.js');
const rateLimit = require('express-rate-limit');
const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const { loadConfig } = require('../config.js');
const {
  getAllUsers,
  getFileMetadata,
  getProgress,
  deleteFile,
  getAllFiles,
} = require('../db/database.js');
const {
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  deleteFileFromS3,
} = require('./s3_upload');
const { getWeatherData } = require('./weather.js');

// Rate limit for login and register routes (prevent brute force attacks)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message:
    'Too many attempts from this IP, please try again after 15 minutes.',
  headers: true,
});

// User Login Route
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  try {
    // Load configuration
    const config = await loadConfig();

    // Initialize Cognito Identity Provider Client
    const cognitoClient = new CognitoIdentityProviderClient({
      region: config.awsRegion,
      credentials: {
        accessKeyId: config.awsAccessKeyId,
        secretAccessKey: config.awsSecretAccessKey,
      },
    });

    // Authenticate user with Cognito
    const params = {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: config.cognitoClientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    };

    const command = new InitiateAuthCommand(params);
    const response = await cognitoClient.send(command);
    const token = response.AuthenticationResult.AccessToken;

    // Set cookies with appropriate attributes
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      // secure: true, // Uncomment if using HTTPS
    });
    res.cookie('username', username, {
      httpOnly: false,
      sameSite: 'Lax',
      path: '/',
      // secure: true, // Uncomment if using HTTPS
    });

    // Return success response
    res.json({ authToken: token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(403).json({ error: 'Invalid login credentials' });
  }
});

// User Registration Route
router.post('/register', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  try {
    // Load configuration
    const config = await loadConfig();

    // Initialize Cognito Identity Provider Client
    const cognitoClient = new CognitoIdentityProviderClient({
      region: config.awsRegion,
      credentials: {
        accessKeyId: config.awsAccessKeyId,
        secretAccessKey: config.awsSecretAccessKey,
      },
    });

    // Register user with Cognito
    const params = {
      ClientId: config.cognitoClientId,
      Username: username,
      Password: password,
    };

    const command = new SignUpCommand(params);
    await cognitoClient.send(command);

    // Return success response
    res.json({
      message:
        'Registration successful. Please check your email for the confirmation code.',
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(400).json({ error: err.message || 'Registration failed' });
  }
});

// Confirmation of User Registration Route
router.post('/confirm', async (req, res) => {
  const { username, confirmationCode } = req.body;

  try {
    // Load configuration
    const config = await loadConfig();

    // Initialize Cognito Identity Provider Client
    const cognitoClient = new CognitoIdentityProviderClient({
      region: config.awsRegion,
      credentials: {
        accessKeyId: config.awsAccessKeyId,
        secretAccessKey: config.awsSecretAccessKey,
      },
    });

    // Confirm user with Cognito
    const params = {
      ClientId: config.cognitoClientId,
      Username: username,
      ConfirmationCode: confirmationCode,
    };

    const command = new ConfirmSignUpCommand(params);
    await cognitoClient.send(command);

    res.status(200).json({
      message: 'Verification successful. You can now log in.',
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(400).json({
      error: 'Verification failed. Please try again.',
    });
  }
});

// Admin routes
router.get('/admin/files', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const files = await getAllFiles();

    res.status(200).json({
      message: 'All files fetched successfully.',
      files: files,
    });
  } catch (error) {
    console.error('Error fetching all files:', error);
    res.status(500).json({
      error: 'An internal error occurred while fetching files.',
    });
  }
});

router.post('/admin/delete-file', authenticateToken, authorizeAdmin, async (req, res) => {
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

router.get('/admin/users', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const users = await getAllUsers();
    res.status(200).json({
      message: 'Users fetched successfully.',
      users: users,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      error: 'An internal error occurred while fetching users.',
    });
  }
});

// File Upload Route (Handled by upload.js)
router.use('/upload', require('./upload.js'));

// Fetch Uploaded Files with DynamoDB Metadata and Progress
router.get('/files', authenticateToken, async (req, res) => {
  try {
    const username = req.user.username;
    const files = await getFileMetadata(username);

    if (!files.length) {
      return res.status(404).json({ message: 'No files found for the user.' });
    }

    // Fetch the progress for each file
    const filesWithProgress = await Promise.all(
      files.map(async (file) => {
        const progressData = await getProgress(username, file.fileName); // Adjusted to pass username and fileName
        const progress = progressData ? parseFloat(progressData.progress) : 100;
        return { ...file, progress };
      })
    );

    res.status(200).json({
      message: 'Files metadata and progress listed successfully.',
      files: filesWithProgress,
      links: {
        upload: '/api/v1/upload',
      },
    });
  } catch (error) {
    console.error('Error fetching file metadata:', error);
    res.status(500).json({
      error: 'An internal error occurred while fetching files metadata.',
    });
  }
});

// Generate Pre-signed URL for file upload
router.get('/upload-url', authenticateToken, async (req, res) => {
  const { fileName } = req.query;
  const username = req.user.username;

  if (!fileName) {
    return res.status(400).json({ error: 'File name is required.' });
  }

  try {
    const presignedUrl = await generatePresignedUploadUrl(
      fileName,
      username
    );
    res.status(200).json({ url: presignedUrl });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL.' });
  }
});

// Generate Pre-signed URL for file download
router.get('/download-url', authenticateToken, async (req, res) => {
  const { fileName } = req.query;
  const username = req.user.username;

  if (!fileName) {
    return res.status(400).json({ error: 'File name is required.' });
  }

  try {
    const presignedUrl = await generatePresignedDownloadUrl(
      fileName,
      username
    );
    res.status(200).json({ url: presignedUrl });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL.' });
  }
});

// Fetch Transcoding Progress
router.get('/progress/:progressId', authenticateToken, async (req, res) => {
  const progressId = req.params.progressId;
  const username = req.user.username;

  try {
    const progressData = await getProgress(username, progressId); // Adjusted to pass username and progressId

    if (!progressData) {
      return res.status(404).json({ error: 'Progress not found.' });
    }

    res.status(200).json({
      progress: parseFloat(progressData.progress) || 0,
      status: progressData.status || 'unknown',
    });
  } catch (error) {
    console.error('Error fetching progress:', error);
    res.status(500).json({ error: 'Failed to fetch progress.' });
  }
});

router.get('/weather', async (req, res) => {
  const city = req.query.city || 'Brisbane'; // Use a default city if none is provided

  try {
    const weatherInfo = await getWeatherData(city);
    res.status(200).json(weatherInfo);
  } catch (error) {
    console.error('Error in /weather route:', error.message);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

module.exports = router;
