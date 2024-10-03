// database.js
const { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand, DeleteItemCommand, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
const {
    cacheFileMetadata,
    getCachedFileMetadata,
    cacheProgress,
    getCachedProgress,
    initializeRedisClient,
} = require('../redisClient');
const { loadConfig } = require("../config.js");
require("dotenv").config();

let dynamodb;
let dynamoDbDocumentClient;
let config;
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "app_data";
let redisClient;

const initializeRedis = async () => {
    redisClient = await initializeRedisClient();
    console.log('Redis client initialized successfully');
};

// Call the initialization function
initializeRedis().catch((err) => {
    console.error('Failed to initialize Redis:', err);
});

// Initialize DynamoDB client with credentials from configuration
const initializeDynamoDB = async () => {
    try {
        const config = await loadConfig();

        // Build credentials object
        const credentials = {
            accessKeyId: config.awsAccessKeyId,
            secretAccessKey: config.awsSecretAccessKey,
        };

        // Include sessionToken if available
        if (config.awsSessionToken) {
            credentials.sessionToken = config.awsSessionToken;
        }

        // Initialize the DynamoDB client
        dynamodb = new DynamoDBClient({
            region: config.awsRegion,
            credentials: credentials,
        });

        // Initialize the DynamoDB Document Client
        dynamoDbDocumentClient = DynamoDBDocumentClient.from(dynamodb);

        console.log('DynamoDB client initialized successfully');
    } catch (err) {
        console.error('Error initializing DynamoDB client:', err);
        throw new Error('Failed to initialize DynamoDB client.');
    }
};

// Call the initialization function on startup
initializeDynamoDB().catch((err) => {
    console.error('Failed to initialize DynamoDB:', err);
});

// Save a new user to DynamoDB
const saveUser = async (username, password, role, callback) => {
    const params = {
        TableName: TABLE_NAME,
        Item: marshall({
            "user": username,                      // Partition Key
            "username": username,
            "password": password,
            "role": role || "user"
        })
    };

    try {
        await dynamodb.send(new PutItemCommand(params));
        console.log("User data saved to DynamoDB");
        if (typeof callback === "function") callback(null);
    } catch (err) {
        console.error("Error saving user data:", err.stack || err);
        if (typeof callback === "function") callback(err);
    }
};

// Save user activity to DynamoDB
const saveUserActivity = async (username, activity) => {
    const params = {
        TableName: TABLE_NAME,
        Item: marshall({
            "user": username,                      // Partition Key
            "activityId": `ACTIVITY#${Date.now()}`, // Unique identifier for activity
            "activity": activity,
            "timestamp": new Date().toISOString()
        })
    };

    try {
        await dynamodb.send(new PutItemCommand(params));
        console.log(`User activity saved: ${activity} for user ${username}`);
    } catch (err) {
        console.error("Error saving user activity:", err.stack || err);
        // Handle error appropriately
    }
};

// Retrieve file metadata from DynamoDB or Redis cache
const getFileMetadata = async (username) => {
    // First, check if the file metadata is cached in Redis
    const cachedMetadata = await getCachedFileMetadata(username);
    if (cachedMetadata) {
        console.log("Returning cached file metadata for", username);
        return cachedMetadata;
    }

    // If not cached, fetch from DynamoDB
    const params = {
        TableName: TABLE_NAME,
        KeyConditionExpression: "#user = :user",
        ExpressionAttributeNames: {
            "#user": "user"
        },
        ExpressionAttributeValues: {
            ":user": { S: username }
        }
    };

    try {
        const data = await dynamodb.send(new QueryCommand(params));

        if (!data.Items || data.Items.length === 0) {
            console.log("No files found for user:", username);
            return [];
        }

        // Filter items that are file metadata
        const files = data.Items
            .map(item => unmarshall(item))
            .filter(item => item.fileName);

        // Cache the result in Redis for faster retrieval next time
        if (files.length > 0) {
            await cacheFileMetadata(username, files);
        }

        return files;
    } catch (err) {
        console.error("Error fetching file metadata:", err.stack || err);
        // Handle error appropriately
        return [];
    }
};

// Save file metadata to DynamoDB with Redis caching
const saveFileMetadata = async (fileMetadata) => {
    const params = {
        TableName: TABLE_NAME,
        Item: marshall({
            "user": fileMetadata.user,                         // Partition Key
            "fileName": `FILE#${fileMetadata.fileName}`,       // Unique file identifier
            "size": fileMetadata.size,
            "format": fileMetadata.format || null,
            "resolution": fileMetadata.resolution || null,
            "uploadTime": fileMetadata.uploadTime || new Date().toISOString()
        })
    };

    try {
        await dynamodb.send(new PutItemCommand(params));
        console.log("File metadata saved to DynamoDB");

        // Update cache
        let existingMetadata = await getCachedFileMetadata(fileMetadata.user);
        if (!existingMetadata) existingMetadata = [];
        existingMetadata.push(fileMetadata);
        await cacheFileMetadata(fileMetadata.user, existingMetadata);

        console.log("File metadata cached in Redis");
    } catch (err) {
        console.error("Error saving file metadata:", err.stack || err);
        // Handle error appropriately
    }
};

// Save progress to DynamoDB and cache in Redis
const saveProgress = async (username, fileName, progressData) => {
    const cacheKey = `progress:${username}:${fileName}`;
    try {
        const params = {
            TableName: TABLE_NAME,
            Item: marshall({
                user: username,                   // Correct Partition Key
                fileName: fileName, // Sort Key
                progress: progressData,
                lastUpdated: new Date().toISOString(),
            }),
        };

        await dynamodb.send(new PutItemCommand(params));

        // Update the cache
        await redisClient.set(cacheKey, JSON.stringify(progressData), {
            EX: 60, // Cache for 60 seconds
        });

        console.log(`Progress data saved for ${username} - ${fileName}`);
    } catch (err) {
        console.error('Error saving progress:', err.stack || err);
    }
};

// Your existing getProgress function
const getProgress = async (username, fileName) => {
    const cacheKey = `progress:${username}:${fileName}`;
    try {
        // Try to get the progress data from Redis cache first
        const cachedProgress = await redisClient.get(cacheKey);
        if (cachedProgress) {
            console.log(`Returning cached progress for ${username} - ${fileName}`);
            return JSON.parse(cachedProgress);
        }

        // If not in cache, get it from DynamoDB using the Document Client
        const params = {
            TableName: TABLE_NAME,
            Key: {
                user: username,     // Partition Key
                fileName: fileName, // Sort Key
            },
        };

        // Use the Document Client to send the GetCommand
        const { Item } = await dynamoDbDocumentClient.send(new GetCommand(params));

        if (Item) {
            // Cache the progress data in Redis for faster subsequent access
            await redisClient.set(cacheKey, JSON.stringify(Item), {
                EX: 60, // Cache for 60 seconds
            });

            console.log(`Returning progress data for ${username} - ${fileName}`);

            // Return the retrieved progress data
            return Item;
        } else {
            console.log(`No progress data found for ${username} - ${fileName}`);
            return null;
        }
    } catch (err) {
        console.error(`Error fetching progress for ${username} - ${fileName}:`, err);
        return null;
    }
};


// Get all files (for admin)
const getAllFiles = async () => {
    const params = {
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(#sortKey, :filePrefix)',
      ExpressionAttributeNames: {
        '#sortKey': 'fileName',
      },
      ExpressionAttributeValues: {
        ':filePrefix': { S: 'FILE#' },
      },
    };
  
    try {
      const data = await dynamodb.send(new ScanCommand(params));
  
      if (!data.Items || data.Items.length === 0) {
        console.log('No files found.');
        return [];
      }
  
      // Unmarshall the items
      const files = data.Items.map(item => unmarshall(item));
  
      // Adjust the fileName to remove 'FILE#' prefix
      files.forEach(file => {
        if (file.fileName.startsWith('FILE#')) {
          file.fileName = file.fileName.substring(5);
        }
      });
  
      return files;
    } catch (err) {
      console.error('Error fetching all files:', err.stack || err);
      return [];
    }
  };
  
  // Delete file metadata from DynamoDB
  const deleteFile = async (username, fileName) => {
    const params = {
      TableName: TABLE_NAME,
      Key: marshall({
        'user': username,                      // Partition Key
        'fileName': `FILE#${fileName}`,        // Sort Key
      }),
    };
  
    try {
      await dynamodb.send(new DeleteItemCommand(params));
      console.log(`File metadata deleted for ${fileName} uploaded by ${username}`);
    } catch (err) {
      console.error('Error deleting file metadata:', err.stack || err);
      throw err;
    }
  };
  
  // Get all users
  const getAllUsers = async () => {
    const params = {
      TableName: TABLE_NAME,
      FilterExpression: 'attribute_exists(username)',
    };
  
    try {
      const data = await dynamodb.send(new ScanCommand(params));
  
      if (!data.Items || data.Items.length === 0) {
        console.log('No users found.');
        return [];
      }
  
      // Unmarshall the items
      const users = data.Items.map(item => unmarshall(item));
  
      // Remove duplicates and unnecessary attributes
      const uniqueUsers = {};
      users.forEach(user => {
        if (user.username) {
          uniqueUsers[user.username] = {
            username: user.username,
            role: user.role || 'user',
          };
        }
      });
  
      return Object.values(uniqueUsers);
    } catch (err) {
      console.error('Error fetching all users:', err.stack || err);
      return [];
    }
  };

module.exports = {
    saveUser,
    saveUserActivity,
    saveFileMetadata,
    saveProgress,
    getFileMetadata,
    getProgress,
    getAllFiles,
    deleteFile,
    getAllUsers,
};
