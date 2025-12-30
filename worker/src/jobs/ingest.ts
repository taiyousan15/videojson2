import { prisma } from "../db";
import { updateProgress } from "../tasks/progress";
import { transcode } from "../ffmpeg/transcode";
import { computeHash } from "../utils/hashing";
import { downloadFile, uploadFile, getDefaultBucket, buildGcsUri } from "../utils/gcs";
import * as fs from "fs/promises";
import * as path from "path";
import https from "https";
import http from "http";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function runIngest(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { video: true },
  });

  if (!job) throw new Error(`Job not found: ${jobId}`);

  const workDir = `/tmp/ingest_${jobId}`;
  await fs.mkdir(workDir, { recursive: true });

  try {
    await updateProgress(jobId, 10, "downloading");

    // Download source video
    const sourceUri = job.video.gcsUri || job.video.sourceUrl;
    if (!sourceUri) throw new Error("No source video URI");

    const localSourcePath = path.join(workDir, "source.mp4");
    await downloadSource(sourceUri, localSourcePath);

    await updateProgress(jobId, 30, "transcoding");

    // Transcode to normalized format
    const normalizedPath = await transcode(localSourcePath, {
      codec: "libx264",
      preset: "medium",
      crf: 23,
    });

    await updateProgress(jobId, 70, "hashing");

    // Compute SHA256
    const sha256 = await computeHash(normalizedPath);

    await updateProgress(jobId, 85, "uploading");

    // Upload normalized video to GCS
    const bucket = getDefaultBucket();
    const gcsPath = `videos/${job.videoId}/normalized.mp4`;
    const normalizedGcsUri = buildGcsUri(bucket, gcsPath);

    await uploadFile(normalizedPath, normalizedGcsUri, {
      contentType: "video/mp4",
    });

    await updateProgress(jobId, 95, "finalizing");

    // Update video record
    await prisma.video.update({
      where: { id: job.videoId },
      data: {
        sha256,
        gcsUri: normalizedGcsUri,
        status: "READY",
      },
    });

    // Create artifact
    await prisma.artifact.create({
      data: {
        jobId,
        videoId: job.videoId,
        type: "NORMALIZED_VIDEO",
        gcsUri: normalizedGcsUri,
        metadata: { sha256, originalSource: sourceUri },
      },
    });

    await updateProgress(jobId, 100, "completed");
  } finally {
    // Cleanup work directory
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Check if URL is a YouTube URL
 */
function isYouTubeUrl(url: string): boolean {
  return url.includes("youtube.com") || url.includes("youtu.be");
}

/**
 * Download source from GCS URI or HTTP URL
 */
async function downloadSource(sourceUri: string, destination: string): Promise<void> {
  if (sourceUri.startsWith("gs://")) {
    // GCS download
    await downloadFile(sourceUri, destination);
  } else if (isYouTubeUrl(sourceUri)) {
    // YouTube download via yt-dlp
    await downloadFromYouTube(sourceUri, destination);
  } else if (sourceUri.startsWith("http://") || sourceUri.startsWith("https://")) {
    // HTTP download
    await downloadFromUrl(sourceUri, destination);
  } else {
    throw new Error(`Unsupported source URI scheme: ${sourceUri}`);
  }
}

/**
 * Download video from YouTube using yt-dlp
 */
async function downloadFromYouTube(url: string, destination: string): Promise<void> {
  console.log(`[Ingest] Downloading from YouTube: ${url}`);

  const command = `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${destination}" "${url}"`;

  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 600000 }); // 10 min timeout
    if (stderr) console.log(`[yt-dlp] ${stderr}`);
    console.log(`[Ingest] YouTube download complete: ${destination}`);
  } catch (error: any) {
    throw new Error(`yt-dlp failed: ${error.message}`);
  }
}

/**
 * Download file from HTTP/HTTPS URL
 */
function downloadFromUrl(url: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const file = require("fs").createWriteStream(destination);

    const request = protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirects
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          downloadFromUrl(redirectUrl, destination).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on("finish", () => {
        file.close();
        resolve();
      });
    });

    request.on("error", (err) => {
      file.close();
      fs.unlink(destination).catch(() => {});
      reject(err);
    });

    file.on("error", (err: Error) => {
      file.close();
      fs.unlink(destination).catch(() => {});
      reject(err);
    });
  });
}
