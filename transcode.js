const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const os = require("os");
const { saveProgress, getProgress, updateProgress } = require("./db/database"); // Updated to include updateProgress
const redisClient = require("./redisClient"); // Include Redis Client

// Function to transcode video with progress tracking stored in DynamoDB and Redis
const transcodeVideoWithProgress = async (fileName, progressId, username) => {
  return new Promise(async (resolve, reject) => {
    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, fileName);

    // Start CPU usage logging at regular intervals
    const cpuLoggingInterval = setInterval(() => {
      logCpuUsage();
    }, 2000); // Logs every 2 seconds

    try {
      // Download file from S3
      await downloadFileFromS3(fileName, username, inputPath);

      // Set output file name and path
      const outputFileName = `${path.parse(fileName).name}_transcoded.mp4`;
      const outputPath = path.join(tempDir, outputFileName);

      // Start transcoding
      ffmpeg(inputPath)
        .videoCodec("libx265") // More CPU-intensive codec
        .size("3840x2160") // 4K resolution
        .audioBitrate("320k")
        .videoBitrate("8000k") // Higher bitrate
        .addOption("-preset", "slow") // Slower preset for better compression but higher CPU usage
        .addOption("-crf", "18") // Higher quality
        .addOption('-threads', '0')
        .on("progress", (progress) => {
          const percentage = Math.round(progress.percent);
          console.log(`Processing: ${percentage}% done`);
          saveProgress(progressId, percentage, "transcoding");
        })
        .on("end", async () => {
          console.log(`Finished transcoding: ${outputFileName}`);

          // Stop CPU logging
          clearInterval(cpuLoggingInterval);

          // Upload transcoded file back to S3
          await uploadToS3(outputPath, username);

          // Clean up temporary files
          fs.unlinkSync(inputPath);
          fs.unlinkSync(outputPath);

          resolve();
        })
        .on("error", (err) => {
          console.error("Error during transcoding:", err);

          // Stop CPU logging
          clearInterval(cpuLoggingInterval);

          saveProgress(progressId, 0, "error");
          reject(err);
        })
        .save(outputPath);
    } catch (err) {
      console.error("Error during transcoding process:", err);

      // Stop CPU logging
      clearInterval(cpuLoggingInterval);

      saveProgress(progressId, 0, "error");
      reject(err);
    }
  });
};

const downloadFileFromS3 = async (fileName, username, downloadPath) => {
  const data = await getObjectFromS3(fileName, username);
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(downloadPath);
    data.Body.pipe(writeStream).on("error", reject).on("close", resolve);
  });
};

// Calculate the start time for ffmpeg seeking based on progress percentage
function calculateStartTimeFromProgress(percent, duration) {
  return ((duration * percent) / 100).toFixed(2);
}

// Function to get video duration in seconds
function getVideoDurationInSeconds(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        console.error("Error getting video duration:", err);
        return reject(err);
      }
      const duration = metadata.format.duration;
      resolve(duration);
    });
  });
}

// Cache progress in Redis
const cacheProgress = async (progressId, progress) => {
  redisClient.setex(progressId, 3600, progress.toString()); // Set the progress in Redis with 1-hour expiration
};

// Get cached progress from Redis
const getCachedProgress = async (progressId) => {
  return new Promise((resolve, reject) => {
    redisClient.get(progressId, (err, progress) => {
      if (err) reject(err);
      resolve(progress ? { percentage: parseFloat(progress) } : null);
    });
  });
};

// Helper function to log CPU usage during transcoding
const logCpuUsage = () => {
  const cpus = os.cpus();
  let totalUsage = 0;

  cpus.forEach((cpu, i) => {
    const total = Object.values(cpu.times).reduce((acc, time) => acc + time, 0);
    const idle = cpu.times.idle;
    const usage = 100 - Math.round((idle / total) * 100);
    totalUsage += usage;
    console.log(`CPU ${i}: ${usage}% used`);
  });

  const averageUsage = (totalUsage / cpus.length).toFixed(2);
  const memoryUsage = process.memoryUsage();
  console.log(`Average CPU Usage: ${averageUsage}%`);
  console.log(
    `Memory Usage: RSS = ${(memoryUsage.rss / 1024 / 1024).toFixed(
      2
    )} MB, Heap Used = ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`
  );
};

module.exports = { transcodeVideoWithProgress, logCpuUsage };
