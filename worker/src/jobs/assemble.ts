import { prisma } from "../db";
import { updateProgress, setWaitingExternal, resumeFromWaiting } from "../tasks/progress";
import { burnSubtitles } from "../ffmpeg/burnSubtitles";
import { mixAudio } from "../ffmpeg/mixAudio";
import { concat, concatWithTransition } from "../ffmpeg/concat";
import { transcode } from "../ffmpeg/transcode";
import { generateAssFromAuthoring } from "../ffmpeg/generateAss";
import { generateStateJson } from "../services/state-json";
import { downloadFile, uploadFile, downloadJSON, getDefaultBucket, buildGcsUri } from "../utils/gcs";
import { InsightFaceClient } from "../providers/embedding/insightface";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { spawn } from "child_process";

export interface AssemblePayload {
  /** Enable Face Swap on final output */
  faceSwap?: {
    enabled: boolean;
    targetFaceUri: string;
    restoreFace?: boolean;
  };
  /** Transition settings between clips */
  transition?: {
    enabled: boolean;
    type?: "fade" | "dissolve" | "wipe";
    duration?: number;
  };
  /** Output format settings */
  outputs?: Array<{
    resolution: "1080p" | "720p" | "480p" | "shorts";
    quality?: "draft" | "standard" | "high";
  }>;
}

export async function runAssemble(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { video: true },
  });

  if (!job) throw new Error(`Job not found: ${jobId}`);

  const payload = (job.payload as unknown as AssemblePayload) || {};
  const workDir = `/tmp/assemble_${jobId}`;
  await fs.mkdir(workDir, { recursive: true });

  try {
    await updateProgress(jobId, 5, "loading_artifacts");

    // Load render results
    const renderJob = await prisma.job.findFirst({
      where: { videoId: job.videoId, type: "RENDER", status: "SUCCEEDED" },
      orderBy: { completedAt: "desc" },
    });

    if (!renderJob) throw new Error("No successful render job found");

    const renderResult = renderJob.result as any;
    const clipUris: string[] = renderResult?.clips || [];

    if (clipUris.length === 0) {
      throw new Error("No clips found in render result");
    }

    await updateProgress(jobId, 10, "downloading_clips");

    // Download all clips
    const localClips: string[] = [];
    for (let i = 0; i < clipUris.length; i++) {
      const clipUri = clipUris[i];
      const localPath = path.join(workDir, `clip_${i}.mp4`);
      await downloadFile(clipUri, localPath);
      localClips.push(localPath);
      await updateProgress(jobId, 10 + Math.floor((i / clipUris.length) * 10), "downloading_clips");
    }

    await updateProgress(jobId, 20, "concatenating");

    // Concatenate clips (with optional transitions)
    let concatPath: string;
    if (payload.transition?.enabled) {
      console.log(`[Assemble] Using transitions: ${payload.transition.type || "fade"}`);
      concatPath = await concatWithTransition(localClips, {
        transitionDuration: payload.transition.duration || 0.5,
        transitionType: payload.transition.type || "fade",
      });
    } else {
      concatPath = await concat(localClips, { reencode: true });
    }

    await updateProgress(jobId, 40, "generating_subtitles");

    // Generate ASS subtitles from authoring JSON
    const authoringArtifact = await prisma.artifact.findFirst({
      where: { videoId: job.videoId, type: "AUTHORING_JSON" },
      orderBy: { createdAt: "desc" },
    });

    let currentVideoPath = concatPath;

    // Burn subtitles if authoring JSON exists
    if (authoringArtifact?.gcsUri) {
      const authoring = await downloadJSON(authoringArtifact.gcsUri);
      const assPath = path.join(workDir, "subtitles.ass");
      await generateAssFromAuthoring(authoring, assPath);

      await updateProgress(jobId, 60, "burning_subtitles");
      currentVideoPath = await burnSubtitles(concatPath, assPath);
    } else {
      await updateProgress(jobId, 60, "skipping_subtitles");
    }

    await updateProgress(jobId, 70, "mixing_audio");

    // Mix BGM if specified in plan
    const planArtifact = await prisma.artifact.findFirst({
      where: { videoId: job.videoId, type: "PLAN_JSON" },
      orderBy: { createdAt: "desc" },
    });

    let finalPath = currentVideoPath;

    if (planArtifact?.gcsUri) {
      const plan = await downloadJSON(planArtifact.gcsUri);
      if (plan?.bgm?.gcsUri) {
        // Download BGM file
        const bgmLocalPath = path.join(workDir, "bgm.mp3");
        await downloadFile(plan.bgm.gcsUri, bgmLocalPath);
        finalPath = await mixAudio(currentVideoPath, bgmLocalPath, plan.bgm.volume || 0.3);
      }
    }

    // Face Swap integration (optional)
    if (payload.faceSwap?.enabled && payload.faceSwap.targetFaceUri) {
      await updateProgress(jobId, 75, "applying_face_swap");
      console.log(`[Assemble] Applying Face Swap with target: ${payload.faceSwap.targetFaceUri}`);

      const insightface = new InsightFaceClient();
      const isAvailable = await insightface.isAvailable();

      if (isAvailable) {
        await setWaitingExternal(jobId, "insightface_swap");

        const faceSwapResult = await applyFaceSwapToVideo(
          finalPath,
          payload.faceSwap.targetFaceUri,
          workDir,
          payload.faceSwap.restoreFace || false,
          insightface
        );

        await resumeFromWaiting(jobId);

        if (faceSwapResult.success) {
          finalPath = faceSwapResult.outputPath;
          console.log(`[Assemble] Face Swap applied: ${faceSwapResult.facesSwapped} faces swapped`);
        } else {
          console.warn(`[Assemble] Face Swap failed: ${faceSwapResult.error}`);
        }
      } else {
        console.warn("[Assemble] InsightFace server not available, skipping Face Swap");
      }
    }

    await updateProgress(jobId, 85, "uploading");

    const bucket = getDefaultBucket();
    const timestamp = Date.now();

    // Generate multiple output resolutions if specified
    const outputConfigs = payload.outputs || [{ resolution: "1080p" as const, quality: "standard" as const }];
    const outputUris: string[] = [];

    for (const outputConfig of outputConfigs) {
      const { resolution, quality = "standard" } = outputConfig;
      const resolutionPath = await transcodeToResolution(finalPath, resolution, quality, workDir);

      const outputGcsPath = `outputs/${job.videoId}/final_${resolution}_${timestamp}.mp4`;
      const outputGcsUri = buildGcsUri(bucket, outputGcsPath);

      await uploadFile(resolutionPath, outputGcsUri, { contentType: "video/mp4" });
      outputUris.push(outputGcsUri);

      console.log(`[Assemble] Uploaded ${resolution} output: ${outputGcsUri}`);
    }

    // Primary output is the first one
    const primaryOutputUri = outputUris[0];

    await updateProgress(jobId, 90, "creating_records");

    // Create Run record
    const run = await prisma.run.create({
      data: {
        videoId: job.videoId,
        stateJsonUri: "", // Will be updated after State JSON generation
        config: job.config || {},
      },
    });

    // Create Output records for all resolutions
    for (let i = 0; i < outputUris.length; i++) {
      const outputConfig = outputConfigs[i];
      await prisma.output.create({
        data: {
          videoId: job.videoId,
          runId: run.id,
          name: `Final Output (${outputConfig.resolution})`,
          gcsUri: outputUris[i],
          format: "mp4",
        },
      });
    }

    // Create OUTPUT_VIDEO artifact (primary resolution)
    await prisma.artifact.create({
      data: {
        jobId,
        videoId: job.videoId,
        type: "OUTPUT_VIDEO",
        gcsUri: primaryOutputUri,
        metadata: {
          resolutions: outputConfigs.map((c) => c.resolution),
          allOutputs: outputUris,
        },
      },
    });

    // Upload ASS subtitle artifact if generated
    if (authoringArtifact?.gcsUri) {
      const assLocalPath = path.join(workDir, "subtitles.ass");
      const assGcsPath = `outputs/${job.videoId}/subtitles_${Date.now()}.ass`;
      const assGcsUri = buildGcsUri(bucket, assGcsPath);

      await uploadFile(assLocalPath, assGcsUri, { contentType: "text/x-ssa" });

      await prisma.artifact.create({
        data: {
          jobId,
          videoId: job.videoId,
          type: "ASS_SUBTITLE",
          gcsUri: assGcsUri,
        },
      });
    }

    await updateProgress(jobId, 95, "generating_state_json");

    // Generate State JSON for reproducibility (P1, P7)
    try {
      const { gcsUri: stateJsonUri } = await generateStateJson(
        run.id,
        job.videoId,
        job.config as Record<string, any> || {}
      );
      console.log(`[Assemble] State JSON generated: ${stateJsonUri}`);
    } catch (error) {
      console.error("[Assemble] Failed to generate State JSON:", error);
      // Continue even if State JSON generation fails
    }

    await updateProgress(jobId, 100, "completed");
  } finally {
    // Cleanup work directory
    await fs.rm(workDir, { recursive: true, force: true }).catch((err) => {
      console.error(`[Assemble] Failed to cleanup work directory: ${err}`);
    });
  }
}

/**
 * Apply Face Swap to a video using InsightFace
 */
async function applyFaceSwapToVideo(
  videoPath: string,
  targetFaceUri: string,
  workDir: string,
  restoreFace: boolean,
  insightface: InsightFaceClient
): Promise<{ success: boolean; outputPath: string; facesSwapped?: number; error?: string }> {
  try {
    // Download target face
    const targetFacePath = path.join(workDir, "target_face.jpg");
    await downloadFile(targetFaceUri, targetFacePath);

    // Extract frames from video
    const framesDir = path.join(workDir, "faceswap_frames");
    await fs.mkdir(framesDir, { recursive: true });

    const fps = await extractVideoFrames(videoPath, framesDir);
    const framePaths = (await fs.readdir(framesDir))
      .filter((f) => f.endsWith(".jpg"))
      .sort()
      .map((f) => path.join(framesDir, f));

    if (framePaths.length === 0) {
      return { success: false, outputPath: "", error: "No frames extracted" };
    }

    console.log(`[Assemble] Face swap: processing ${framePaths.length} frames`);

    // Swap faces in all frames
    const swappedDir = path.join(workDir, "faceswap_swapped");
    await fs.mkdir(swappedDir, { recursive: true });

    const batchResult = await insightface.swapFacesBatch(
      framePaths,
      targetFacePath,
      swappedDir,
      undefined,
      restoreFace
    );

    if (!batchResult.success || batchResult.processedFrames === 0) {
      return { success: false, outputPath: "", error: "Face swap failed" };
    }

    // Reassemble video from swapped frames
    const outputPath = path.join(workDir, "faceswap_output.mp4");
    await assembleFramesToVideo(swappedDir, videoPath, outputPath, fps);

    return {
      success: true,
      outputPath,
      facesSwapped: batchResult.totalFacesSwapped,
    };
  } catch (error) {
    return { success: false, outputPath: "", error: String(error) };
  }
}

/**
 * Extract frames from video for Face Swap processing
 */
async function extractVideoFrames(videoPath: string, outputDir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    // Get video FPS
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
 * Reassemble video from frames, copying audio from original
 */
async function assembleFramesToVideo(
  framesDir: string,
  originalVideoPath: string,
  outputPath: string,
  fps: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-framerate", fps.toString(),
      "-i", path.join(framesDir, "frame_%06d.jpg"),
      "-i", originalVideoPath,
      "-map", "0:v",
      "-map", "1:a?",
      "-c:v", "libx264",
      "-crf", "23",
      "-preset", "medium",
      "-c:a", "aac",
      "-shortest",
      "-y",
      outputPath,
    ];

    const ffmpeg = spawn("ffmpeg", args);

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

/**
 * Transcode video to specific resolution
 */
async function transcodeToResolution(
  inputPath: string,
  resolution: "1080p" | "720p" | "480p" | "shorts",
  quality: "draft" | "standard" | "high",
  workDir: string
): Promise<string> {
  const resolutionMap: Record<string, { width: number; height: number }> = {
    "1080p": { width: 1920, height: 1080 },
    "720p": { width: 1280, height: 720 },
    "480p": { width: 854, height: 480 },
    "shorts": { width: 1080, height: 1920 }, // Vertical for shorts
  };

  const qualityMap: Record<string, { crf: number; preset: string }> = {
    draft: { crf: 28, preset: "ultrafast" },
    standard: { crf: 23, preset: "medium" },
    high: { crf: 18, preset: "slow" },
  };

  const { width, height } = resolutionMap[resolution];
  const { crf, preset } = qualityMap[quality];

  // If 1080p with standard quality and input is already 1080p, just copy
  if (resolution === "1080p" && quality === "standard") {
    // Check if transcode is needed by comparing input resolution
    const inputInfo = await getVideoInfo(inputPath);
    if (inputInfo.width === 1920 && inputInfo.height === 1080) {
      return inputPath; // No transcode needed
    }
  }

  const outputPath = path.join(workDir, `output_${resolution}.mp4`);

  return new Promise((resolve, reject) => {
    const args = [
      "-i", inputPath,
      "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
      "-c:v", "libx264",
      "-crf", crf.toString(),
      "-preset", preset,
      "-c:a", "aac",
      "-b:a", "128k",
      "-y",
      outputPath,
    ];

    const ffmpeg = spawn("ffmpeg", args);

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`Transcode to ${resolution} failed`));
      }
    });

    ffmpeg.on("error", reject);
  });
}

/**
 * Get video information
 */
async function getVideoInfo(videoPath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const probe = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "json",
      videoPath,
    ]);

    let output = "";
    probe.stdout.on("data", (data) => {
      output += data.toString();
    });

    probe.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("Failed to get video info"));
        return;
      }

      try {
        const info = JSON.parse(output);
        const stream = info.streams?.[0] || {};
        resolve({
          width: stream.width || 1920,
          height: stream.height || 1080,
        });
      } catch {
        resolve({ width: 1920, height: 1080 });
      }
    });

    probe.on("error", reject);
  });
}
