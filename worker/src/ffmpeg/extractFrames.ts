/**
 * FFmpeg Frame Extraction - 動画からキーフレームを抽出
 */

import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";

export interface ExtractedFrame {
  path: string;
  timestamp: number;
  index: number;
}

export interface ExtractFramesOptions {
  /** Frames per second to extract (default: 1) */
  fps?: number;
  /** Maximum number of frames to extract */
  maxFrames?: number;
  /** Output format (jpg, png) */
  format?: "jpg" | "png";
  /** Quality (1-31 for jpg, lower is better) */
  quality?: number;
  /** Extract keyframes only */
  keyframesOnly?: boolean;
}

/**
 * Extract frames from a video file
 */
export async function extractFrames(
  videoPath: string,
  outputDir: string,
  options: ExtractFramesOptions = {}
): Promise<ExtractedFrame[]> {
  const {
    fps = 1,
    maxFrames,
    format = "jpg",
    quality = 2,
    keyframesOnly = false,
  } = options;

  // Create output directory
  await fs.mkdir(outputDir, { recursive: true });

  const outputPattern = path.join(outputDir, `frame_%04d.${format}`);

  // Build ffmpeg arguments
  const args: string[] = ["-i", videoPath];

  if (keyframesOnly) {
    // Extract only keyframes (I-frames)
    args.push("-vf", `select='eq(pict_type\\,I)'`);
    args.push("-vsync", "vfr");
  } else {
    // Extract at specified fps
    args.push("-vf", `fps=${fps}`);
  }

  if (maxFrames) {
    args.push("-vframes", maxFrames.toString());
  }

  // Quality settings
  if (format === "jpg") {
    args.push("-q:v", quality.toString());
  }

  args.push("-y", outputPattern);

  await runFfmpeg(args);

  // List extracted frames
  const files = await fs.readdir(outputDir);
  const frameFiles = files
    .filter((f) => f.startsWith("frame_") && f.endsWith(`.${format}`))
    .sort();

  // Build frame metadata
  const frames: ExtractedFrame[] = frameFiles.map((file, index) => {
    const timestamp = index / fps;
    return {
      path: path.join(outputDir, file),
      timestamp,
      index,
    };
  });

  console.log(`[ExtractFrames] Extracted ${frames.length} frames from ${videoPath}`);
  return frames;
}

/**
 * Extract frames at specific timestamps
 */
export async function extractFramesAtTimestamps(
  videoPath: string,
  outputDir: string,
  timestamps: number[],
  options: { format?: "jpg" | "png"; quality?: number } = {}
): Promise<ExtractedFrame[]> {
  const { format = "jpg", quality = 2 } = options;

  await fs.mkdir(outputDir, { recursive: true });

  const frames: ExtractedFrame[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i];
    const outputPath = path.join(outputDir, `frame_${i.toString().padStart(4, "0")}.${format}`);

    const args = [
      "-ss", timestamp.toString(),
      "-i", videoPath,
      "-vframes", "1",
      "-q:v", quality.toString(),
      "-y",
      outputPath,
    ];

    await runFfmpeg(args);

    frames.push({
      path: outputPath,
      timestamp,
      index: i,
    });
  }

  console.log(`[ExtractFrames] Extracted ${frames.length} frames at specific timestamps`);
  return frames;
}

/**
 * Get video duration in seconds
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      "-i", videoPath,
      "-show_entries", "format=duration",
      "-v", "quiet",
      "-of", "csv=p=0",
    ];

    const process = spawn("ffprobe", args);
    let output = "";

    process.stdout.on("data", (data) => {
      output += data.toString();
    });

    process.on("close", (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        resolve(isNaN(duration) ? 0 : duration);
      } else {
        reject(new Error(`ffprobe failed with code ${code}`));
      }
    });

    process.on("error", reject);
  });
}

/**
 * Extract frames evenly distributed across the video
 */
export async function extractEvenlyDistributedFrames(
  videoPath: string,
  outputDir: string,
  frameCount: number,
  options: { format?: "jpg" | "png"; quality?: number } = {}
): Promise<ExtractedFrame[]> {
  const duration = await getVideoDuration(videoPath);

  if (duration <= 0) {
    console.warn("[ExtractFrames] Could not determine video duration");
    return [];
  }

  const interval = duration / (frameCount + 1);
  const timestamps = Array.from({ length: frameCount }, (_, i) => interval * (i + 1));

  return extractFramesAtTimestamps(videoPath, outputDir, timestamps, options);
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn("ffmpeg", args);

    let stderr = "";

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-300)}`));
      }
    });

    process.on("error", (err) => {
      reject(new Error(`ffmpeg failed to start: ${err.message}`));
    });
  });
}
