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

initializeRedis().catch((err) => {
    console.error('Failed to initialize Redis:', err);
});

const initializeDynamoDB = async () => {
    try {
        const config = await loadConfig();

        const credentials = {
            accessKeyId: config.awsAccessKeyId,
            secretAccessKey: config.awsSecretAccessKey,
        };

        if (config.awsSessionToken) {
            credentials.sessionToken = config.awsSessionToken;
        }

        dynamodb = new DynamoDBClient({
            region: config.awsRegion,
            credentials: credentials,
        });

        dynamoDbDocumentClient = DynamoDBDocumentClient.from(dynamodb);

        console.log('DynamoDB client initialized successfully');
    } catch (err) {
        console.error('Error initializing DynamoDB client:', err);
        throw new Error('Failed to initialize DynamoDB client.');
    }
};

initializeDynamoDB().catch((err) => {
    console.error('Failed to initialize DynamoDB:', err);
});

const saveUser = async (username, password, role, callback) => {
    const params = {
        TableName: TABLE_NAME,
        Item: marshall({
            "user": username,                     
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


const saveUserActivity = async (username, activity) => {
    const params = {
        TableName: TABLE_NAME,
        Item: marshall({
            "user": username,                      
            "activityId": `ACTIVITY#${Date.now()}`, 
            "activity": activity,
            "timestamp": new Date().toISOString()
        })
    };

    try {
        await dynamodb.send(new PutItemCommand(params));
        console.log(`User activity saved: ${activity} for user ${username}`);
    } catch (err) {
        console.error("Error saving user activity:", err.stack || err);
        
    }
};


const getFileMetadata = async (username) => {
    const cachedMetadata = await getCachedFileMetadata(username);
    if (cachedMetadata) {
        console.log("Returning cached file metadata for", username);
        return cachedMetadata;
    }

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

        const files = data.Items
            .map(item => unmarshall(item))
            .filter(item => item.fileName);

        if (files.length > 0) {
            await cacheFileMetadata(username, files);
        }

        return files;
    } catch (err) {
        console.error("Error fetching file metadata:", err.stack || err);

        return [];
    }
};


const saveFileMetadata = async (fileMetadata) => {
    const params = {
        TableName: TABLE_NAME,
        Item: marshall({
            "user": fileMetadata.user,                    
            "fileName": fileMetadata.fileName,    
            "size": fileMetadata.size,
            "format": fileMetadata.format || null,
            "resolution": fileMetadata.resolution || null,
            "uploadTime": fileMetadata.uploadTime || new Date().toISOString()
        })
    };

    try {
        await dynamodb.send(new PutItemCommand(params));
        console.log("File metadata saved to DynamoDB");


        let existingMetadata = await getCachedFileMetadata(fileMetadata.user);
        if (!existingMetadata) existingMetadata = [];
        existingMetadata.push(fileMetadata);
        await cacheFileMetadata(fileMetadata.user, existingMetadata);

        console.log("File metadata cached in Redis");
    } catch (err) {
        console.error("Error saving file metadata:", err.stack || err);

    }
};

const saveProgress = async (username, fileName, progressData) => {
    const cacheKey = `progress:${username}:${fileName}`;
    try {
        const params = {
            TableName: TABLE_NAME,
            Item: marshall({
                user: username,                   
                fileName: fileName, 
                progress: progressData,
                lastUpdated: new Date().toISOString(),
            }),
        };

        await dynamodb.send(new PutItemCommand(params));

        // Update the cache
        await redisClient.set(cacheKey, JSON.stringify(progressData), {
            EX: 60, 
        });

        console.log(`Progress data saved for ${username} - ${fileName}`);
    } catch (err) {
        console.error('Error saving progress:', err.stack || err);
    }
};


const getProgress = async (username, fileName) => {
    const cacheKey = `progress:${username}:${fileName}`;
    try {
        // Try to get the progress data from Redis cache first
        const cachedProgress = await redisClient.get(cacheKey);
        if (cachedProgress) {
            console.log(`Returning cached progress for ${username} - ${fileName}`);
            return JSON.parse(cachedProgress);
        }

        const params = {
            TableName: TABLE_NAME,
            Key: {
                user: username,    
            },
        };

        const { Item } = await dynamoDbDocumentClient.send(new GetCommand(params));

        if (Item) {
            await redisClient.set(cacheKey, JSON.stringify(Item), {
                EX: 60, 
            });

            console.log(`Returning progress data for ${username} - ${fileName}`);

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


const getAllFiles = async () => {
    const params = {
        TableName: TABLE_NAME,
        FilterExpression: 'attribute_exists(fileName)',
    };

    try {
        const data = await dynamodb.send(new ScanCommand(params));

        if (!data.Items || data.Items.length === 0) {
            console.log('No files found in DynamoDB.');
            return [];
        }

        const files = data.Items.map(item => unmarshall(item));

        const cleanedFiles = files.map(file => {
            if (file.fileName && file.fileName.startsWith('FILE#')) {
                file.fileName = file.fileName.substring(5); 
            }

            if (!file.fileName) {
                console.error('Error: Missing fileName in one of the records', file);
                file.fileName = 'Unknown file';  
            }

            return file;
        });

        return cleanedFiles;

    } catch (err) {
        console.error('Error fetching files from DynamoDB:', err.stack || err);
        return [];
    }
};


  const deleteFile = async (username, fileName) => {
    const params = {
      TableName: TABLE_NAME,
      Key: marshall({
        'user': username,                      
        'fileName': `FILE#${fileName}`,       
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
  
      const users = data.Items.map(item => unmarshall(item));
  
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
