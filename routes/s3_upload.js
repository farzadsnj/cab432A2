// s3_upload.js
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { loadConfig } = require('../config.js');
const fs = require('fs');
const path = require('path');

let s3Client;
let bucketName;

// Initialize S3 client and bucket name
const initializeS3 = async () => {
  try {
    const config = await loadConfig();
    s3Client = new S3Client({
      region: config.awsRegion,
      credentials: {
        accessKeyId: config.awsAccessKeyId,
        secretAccessKey: config.awsSecretAccessKey,
        sessionToken: config.awsSessionToken,
      },
    });
    bucketName = config.s3BucketName;
    console.log('S3 client initialized successfully.');
  } catch (err) {
    console.error('Error initializing S3 client:', err);
    throw err;
  }
};

// Call the initialization function
initializeS3();

// Upload a file to S3
const uploadToS3 = async (filePath, username) => {
  let s3Key;
  try {
    console.log('uploadToS3 called with filePath:', filePath);

    // Normalize and verify the file path
    const normalizedFilePath = path.normalize(filePath);
    console.log('Normalized file path:', normalizedFilePath);

    if (!fs.existsSync(normalizedFilePath)) {
      throw new Error('File path is invalid or file does not exist');
    }

    // Read file content
    const fileContent = fs.readFileSync(normalizedFilePath);
    const fileName = path.basename(normalizedFilePath);
    s3Key = `${username}/${fileName}`;

    console.log('Uploading file to S3 with key:', s3Key);

    // Upload parameters
    const uploadParams = {
      Bucket: bucketName,
      Key: s3Key,
      Body: fileContent,
    };

    // Upload to S3
    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    console.log(`File uploaded to S3 successfully: ${s3Key}`);

    return fileName;
  } catch (err) {
    console.error('Error uploading to S3:', err);
    if (s3Key) {
      await cleanUpFailedUpload(s3Key);
    }
    throw new Error('Upload to S3 failed');
  }
};

// Clean up partially uploaded file in case of failure
const cleanUpFailedUpload = async (s3Key) => {
  try {
    const deleteParams = {
      Bucket: bucketName,
      Key: s3Key,
    };
    const command = new DeleteObjectCommand(deleteParams);
    await s3Client.send(command);
    console.log(`Partially uploaded file ${s3Key} deleted from S3.`);
  } catch (err) {
    console.error(
      `Failed to clean up failed upload for file ${s3Key}:`,
      err
    );
  }
};

// Generate a pre-signed URL for uploading a file
const generatePresignedUploadUrl = async (fileName, username) => {
  try {
    const s3Key = `${username}/${fileName}`;
    const uploadParams = {
      Bucket: bucketName,
      Key: s3Key,
      ContentType: 'application/octet-stream', // Modify as needed
    };
    const command = new PutObjectCommand(uploadParams);
    const url = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    }); // Expires in 1 hour
    return url;
  } catch (err) {
    console.error('Error generating presigned upload URL:', err);
    throw new Error('Failed to generate upload URL');
  }
};

// Generate a pre-signed URL for downloading a file
const generatePresignedDownloadUrl = async (fileName, username) => {
  try {
    const s3Key = `${username}/${fileName}`;
    const downloadParams = {
      Bucket: bucketName,
      Key: s3Key,
    };
    const command = new GetObjectCommand(downloadParams);
    const url = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    }); // Expires in 1 hour
    return url;
  } catch (err) {
    console.error('Error generating presigned download URL:', err);
    throw new Error('Failed to generate download URL');
  }
};

// Function to retrieve a file from S3 and send it in the response
const getFileFromS3 = async (fileName, username, res) => {
  try {
    const s3Key = `${username}/${fileName}`;
    const downloadParams = {
      Bucket: bucketName,
      Key: s3Key,
    };
    const command = new GetObjectCommand(downloadParams);
    const s3Response = await s3Client.send(command);

    res.setHeader(
      'Content-Type',
      s3Response.ContentType || 'application/octet-stream'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`
    );

    s3Response.Body.pipe(res);
  } catch (err) {
    console.error(`Error retrieving file ${fileName} from S3:`, err);
    throw new Error('Failed to retrieve file from S3');
  }
};

// Delete a file from S3
const deleteFileFromS3 = async (fileName, username) => {
  try {
    const s3Key = `${username}/${fileName}`;
    const deleteParams = {
      Bucket: bucketName,
      Key: s3Key,
    };
    const command = new DeleteObjectCommand(deleteParams);
    await s3Client.send(command);
    console.log(`File deleted from S3: ${s3Key}`);
  } catch (err) {
    console.error('Error deleting file from S3:', err);
    throw err;
  }
};

module.exports = {
  uploadToS3,
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  getFileFromS3,
  deleteFileFromS3
};
