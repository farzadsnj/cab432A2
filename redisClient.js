// redisClient.js
const redis = require('redis');
const { loadConfig } = require('./config'); // Load configuration with secrets

let redisClient;

// Function to initialize Redis client
const initializeRedisClient = async () => {
    if (redisClient && redisClient.isOpen) {
        return redisClient;
    }

    try {
        const config = await loadConfig();
        const redisUrl = process.env.NODE_ENV === 'production' ? process.env.REDIS_URL_CLOUD : process.env.REDIS_URL_LOCAL;

        redisClient = redis.createClient({
            url: redisUrl,
            socket: {
                connectTimeout: 800000,
            }
        });

        redisClient.on('error', (err) => {
            console.error('Redis connection error:', err);
        });

        await redisClient.connect();
        console.log('Connected to Redis');
        return redisClient;
    } catch (err) {
        console.error('Error initializing Redis client:', err);
        throw err;
    }
};

// Function to cache progress in Redis
const cacheProgress = async (progressId, progressData) => {
    try {
        const client = await initializeRedisClient();
        await client.setEx(progressId, 3600, JSON.stringify(progressData)); // 1-hour expiration
        console.log(`Progress for ${progressId} cached successfully.`);
    } catch (err) {
        console.error(`Error caching progress for ${progressId}:`, err);
    }
};

// Function to retrieve cached progress from Redis
const getCachedProgress = async (progressId) => {
    try {
        const client = await initializeRedisClient();
        const progress = await client.get(progressId);
        return progress ? JSON.parse(progress) : null;
    } catch (err) {
        console.error(`Error retrieving cached progress for ${progressId}:`, err);
        return null;
    }
};

// Function to cache file metadata in Redis
const cacheFileMetadata = async (username, metadata) => {
    const key = `${username}_files`;
    try {
        const client = await initializeRedisClient();
        await client.setEx(key, 3600, JSON.stringify(metadata)); // 1-hour expiration
        console.log(`File metadata for ${username} cached successfully.`);
    } catch (err) {
        console.error(`Error caching file metadata for ${username}:`, err);
    }
};

// Function to retrieve cached file metadata from Redis
const getCachedFileMetadata = async (username) => {
    const key = `${username}_files`;
    try {
        const client = await initializeRedisClient();
        const metadata = await client.get(key);
        return metadata ? JSON.parse(metadata) : null;
    } catch (err) {
        console.error(`Error retrieving cached file metadata for ${username}:`, err);
        return null;
    }
};

module.exports = {
    cacheProgress,
    getCachedProgress,
    cacheFileMetadata,
    getCachedFileMetadata,
    initializeRedisClient,
};
