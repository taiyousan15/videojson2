/**
 * Face Swap Job - 顔入れ替えジョブ
 *
 * 動画内の顔を別の顔に置き換える
 * InsightFace + inswapper モデルを使用
 */

import { prisma } from "../db";
import { updateProgress, setWaitingExternal, resumeFromWaiting } from "../tasks/progress";
import { downloadFile, uploadFile, getDefaultBucket, buildGcsUri } from "../utils/gcs";
import { InsightFaceClient } from "../providers/embedding/insightface";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface FaceSwapPayload {
  // Target face image URI (GCS or URL)
  targetFaceUri: string;
  // Optional: Source video URI (defaults to NORMALIZED_VIDEO artifact)
  sourceVideoUri?: string;
  // Optional: Specific face ID to replace (from EMBED job)
  sourceFaceId?: string;
  // Optional: Maximum number of frames to process (for testing)
  maxFrames?: number;
  // Optional: Apply GFPGAN face restoration after swap
  restoreFace?: boolean;
  // Output options
  outputOptions?: {
    quality?: "draft" | "standard" | "high";
    preserveAudio?: boolean;
  };
}

export async function runFaceSwap(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { video: true },
  });

  if (!job) throw new Error(`Job not found: ${jobId}`);

  const payload = job.payload as unknown as FaceSwapPayload;
  if (!payload?.targetFaceUri) {
    throw new Error("targetFaceUri is required in job payload");
  }

  console.log(`[FaceSwap] Starting face swap for job ${jobId}`);

  // Create temp directory
  const tempDir = path.join(os.tmpdir(), `faceswap-${jobId}`);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    await updateProgress(jobId, 5, "checking_insightface");

    // Check InsightFace availability
    const insightface = new InsightFaceClient();
    const isAvailable = await insightface.isAvailable();

    if (!isAvailable) {
      throw new Error(
        "InsightFace server is not available. Please start the InsightFace server at " +
        (process.env.INSIGHTFACE_ENDPOINT || "http://localhost:8001")
      );
    }

    await updateProgress(jobId, 10, "loading_assets");

    // Get source video
    let sourceVideoUri = payload.sourceVideoUri;
    if (!sourceVideoUri) {
      const videoArtifact = await prisma.artifact.findFirst({
        where: { videoId: job.videoId, type: "NORMALIZED_VIDEO" },
        orderBy: { createdAt: "desc" },
      });
      if (!videoArtifact) {
        throw new Error("NORMALIZED_VIDEO artifact not found");
      }
      sourceVideoUri = videoArtifact.gcsUri;
    }

    // Download source video
    const sourceVideoPath = path.join(tempDir, "source.mp4");
    console.log(`[FaceSwap] Downloading source video from ${sourceVideoUri}`);
    await downloadFile(sourceVideoUri, sourceVideoPath);

    // Download target face
    const targetFacePath = path.join(tempDir, "target_face.jpg");
    console.log(`[FaceSwap] Downloading target face from ${payload.targetFaceUri}`);
    await downloadFile(payload.targetFaceUri, targetFacePath);

    await updateProgress(jobId, 20, "extracting_frames");

    // Extract frames from video
    const framesDir = path.join(tempDir, "frames");
    fs.mkdirSync(framesDir, { recursive: true });

    const fps = await extractFrames(sourceVideoPath, framesDir);
    let framePaths = fs.readdirSync(framesDir)
      .filter((f) => f.endsWith(".jpg"))
      .sort()
      .map((f) => path.join(framesDir, f));

    // Limit frames if maxFrames is specified
    if (payload.maxFrames && payload.maxFrames > 0 && framePaths.length > payload.maxFrames) {
      console.log(`[FaceSwap] Limiting to ${payload.maxFrames} frames (original: ${framePaths.length})`);
      framePaths = framePaths.slice(0, payload.maxFrames);
    }

    console.log(`[FaceSwap] Processing ${framePaths.length} frames at ${fps} fps`);

    await updateProgress(jobId, 30, "swapping_faces");
    await setWaitingExternal(jobId, "insightface_swap");

    // Swap faces in all frames
    const swappedDir = path.join(tempDir, "swapped");
    fs.mkdirSync(swappedDir, { recursive: true });

    let lastProgress = 30;
    const restoreFace = payload.restoreFace === true;
    if (restoreFace) {
      console.log(`[FaceSwap] GFPGAN face restoration enabled`);
    }
    const batchResult = await insightface.swapFacesBatch(
      framePaths,
      targetFacePath,
      swappedDir,
      (current, total) => {
        const newProgress = 30 + Math.floor((current / total) * 50);
        if (newProgress > lastProgress) {
          lastProgress = newProgress;
          console.log(`[FaceSwap] Progress: ${current}/${total} frames`);
        }
      },
      restoreFace
    );

    await resumeFromWaiting(jobId);

    if (!batchResult.success) {
      throw new Error("Face swap failed - no frames were processed successfully");
    }

    console.log(`[FaceSwap] Swapped ${batchResult.totalFacesSwapped} faces in ${batchResult.processedFrames} frames`);

    await updateProgress(jobId, 80, "reassembling_video");

    // Get audio from source video
    const audioPath = path.join(tempDir, "audio.aac");
    const preserveAudio = payload.outputOptions?.preserveAudio !== false;
    let hasAudio = false;

    if (preserveAudio) {
      hasAudio = await extractAudio(sourceVideoPath, audioPath);
    }

    // Reassemble video from swapped frames
    const outputPath = path.join(tempDir, "output.mp4");
    const quality = payload.outputOptions?.quality || "standard";

    await assembleVideo(swappedDir, audioPath, outputPath, fps, quality, hasAudio);

    await updateProgress(jobId, 90, "uploading");

    // Upload to GCS
    const bucket = getDefaultBucket();
    const outputGcsPath = `artifacts/${job.videoId}/face_swapped_${Date.now()}.mp4`;
    const outputGcsUri = buildGcsUri(bucket, outputGcsPath);

    await uploadFile(outputPath, outputGcsUri, { contentType: "video/mp4" });

    // Get file size
    const stats = fs.statSync(outputPath);

    // Create artifact
    await prisma.artifact.create({
      data: {
        jobId,
        videoId: job.videoId,
        type: "FACE_SWAPPED_VIDEO",
        gcsUri: outputGcsUri,
        metadata: {
          framesProcessed: batchResult.processedFrames,
          totalFrames: batchResult.totalFrames,
          facesSwapped: batchResult.totalFacesSwapped,
          targetFaceUri: payload.targetFaceUri,
          fileSize: stats.size,
          quality,
        },
      },
    });

    // Update job result
    await prisma.job.update({
      where: { id: jobId },
      data: {
        result: {
          success: true,
          outputUri: outputGcsUri,
          framesProcessed: batchResult.processedFrames,
          totalFrames: batchResult.totalFrames,
          facesSwapped: batchResult.totalFacesSwapped,
        },
      },
    });

    await updateProgress(jobId, 100, "completed");
    console.log(`[FaceSwap] Job ${jobId} completed successfully`);

  } finally {
    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.warn(`[FaceSwap] Failed to cleanup temp dir: ${e}`);
    }
  }
}

/**
 * Extract frames from video using FFmpeg
 */
async function extractFrames(videoPath: string, outputDir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    // First, get video FPS
    const probe = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=r_frame_rate",
      "-of", "csv=p=0",
      videoPath,
    ]);

    let fpsOutput = "";
    probe.stdout.on("data", (data) => {
      fpsOutput += data.toString();
    });

    probe.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("Failed to probe video"));
        return;
      }

      // Parse FPS (format: "30/1" or "30000/1001")
      const [num, den] = fpsOutput.trim().split("/").map(Number);
      const fps = Math.round(num / (den || 1));

      // Extract frames
      const ffmpeg = spawn("ffmpeg", [
        "-i", videoPath,
        "-vf", `fps=${fps}`,
        "-q:v", "2",
        path.join(outputDir, "frame_%06d.jpg"),
      ]);

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve(fps);
        } else {
          reject(new Error(`FFmpeg frame extraction failed with code ${code}`));
        }
      });

      ffmpeg.on("error", reject);
    });

    probe.on("error", reject);
  });
}

/**
 * Extract audio from video
 */
async function extractAudio(videoPath: string, audioPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i", videoPath,
      "-vn",
      "-acodec", "aac",
      "-y",
      audioPath,
    ]);

    ffmpeg.on("close", (code) => {
      resolve(code === 0 && fs.existsSync(audioPath));
    });

    ffmpeg.on("error", () => {
      resolve(false);
    });
  });
}

/**
 * Assemble video from frames
 */
async function assembleVideo(
  framesDir: string,
  audioPath: string,
  outputPath: string,
  fps: number,
  quality: string,
  hasAudio: boolean
): Promise<void> {
  return new Promise((resolve, reject) => {
    const qualityPresets: Record<string, { crf: number; preset: string }> = {
      draft: { crf: 28, preset: "ultrafast" },
      standard: { crf: 23, preset: "medium" },
      high: { crf: 18, preset: "slow" },
    };

    const { crf, preset } = qualityPresets[quality] || qualityPresets.standard;

    const args = [
      "-framerate", fps.toString(),
      "-i", path.join(framesDir, "frame_%06d.jpg"),
    ];

    if (hasAudio && fs.existsSync(audioPath)) {
      args.push("-i", audioPath);
    }

    args.push(
      "-c:v", "libx264",
      "-crf", crf.toString(),
      "-preset", preset,
      "-pix_fmt", "yuv420p"
    );

    if (hasAudio && fs.existsSync(audioPath)) {
      args.push("-c:a", "aac", "-shortest");
    }

    args.push("-y", outputPath);

    const ffmpeg = spawn("ffmpeg", args);

    ffmpeg.stderr.on("data", (data) => {
      const line = data.toString();
      if (line.includes("frame=")) {
        // Progress logging
      }
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg assembly failed with code ${code}`));
      }
    });

    ffmpeg.on("error", reject);
  });
}
