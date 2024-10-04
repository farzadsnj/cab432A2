const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const os = require("os");
const { saveProgress, getProgress, updateProgress } = require("./db/database");
const redisClient = require("./redisClient"); 

const transcodeVideoWithProgress = async (fileName, progressId, username) => {
  return new Promise(async (resolve, reject) => {
    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, fileName);

    const cpuLoggingInterval = setInterval(() => {
      logCpuUsage();
    }, 2000);

    try {
      await downloadFileFromS3(fileName, username, inputPath);
      const outputFileName = `${path.parse(fileName).name}_transcoded.mp4`;
      const outputPath = path.join(tempDir, outputFileName);

      ffmpeg(inputPath)
        .videoCodec("libx265") 
        .size("3840x2160") 
        .audioBitrate("320k")
        .videoBitrate("8000k") 
        .addOption("-preset", "slow") 
        .addOption("-crf", "18") 
        .addOption('-threads', '0')
        .on("progress", (progress) => {
          const percentage = Math.round(progress.percent);
          console.log(`Processing: ${percentage}% done`);
          saveProgress(progressId, percentage, "transcoding");
        })
        .on("end", async () => {
          console.log(`Finished transcoding: ${outputFileName}`);
          clearInterval(cpuLoggingInterval);
          await uploadToS3(outputPath, username);

          fs.unlinkSync(inputPath);
          fs.unlinkSync(outputPath);

          resolve();
        })
        .on("error", (err) => {
          console.error("Error during transcoding:", err);
          clearInterval(cpuLoggingInterval);

          saveProgress(progressId, 0, "error");
          reject(err);
        })
        .save(outputPath);
    } catch (err) {
      console.error("Error during transcoding process:", err);
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
function calculateStartTimeFromProgress(percent, duration) {
  return ((duration * percent) / 100).toFixed(2);
}

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
const cacheProgress = async (progressId, progress) => {
  redisClient.setex(progressId, 3600, progress.toString()); 
};

const getCachedProgress = async (progressId) => {
  return new Promise((resolve, reject) => {
    redisClient.get(progressId, (err, progress) => {
      if (err) reject(err);
      resolve(progress ? { percentage: parseFloat(progress) } : null);
    });
  });
};

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
