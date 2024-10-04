const redis = require('redis');
const { loadConfig } = require('./config');

let redisClient;

const initializeRedisClient = async () => {
    if (redisClient && redisClient.isOpen) {
        return redisClient;
    }

    try {
        //const config = await loadConfig();
        const redisUrl = 'redis://n11521147-a22-ech.km2jzi.cfg.apse2.cache.amazonaws.com:6379';

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

const cacheProgress = async (progressId, progressData) => {
    try {
        const client = await initializeRedisClient();
        await client.setEx(progressId, 3600, JSON.stringify(progressData));
        console.log(`Progress for ${progressId} cached successfully.`);
    } catch (err) {
        console.error(`Error caching progress for ${progressId}:`, err);
    }
};

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

const cacheFileMetadata = async (username, metadata) => {
    const key = `${username}_files`;
    try {
        const client = await initializeRedisClient();
        await client.setEx(key, 3600, JSON.stringify(metadata)); 
        console.log(`File metadata for ${username} cached successfully.`);
    } catch (err) {
        console.error(`Error caching file metadata for ${username}:`, err);
    }
};

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
