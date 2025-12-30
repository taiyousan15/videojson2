/**
 * Render Job - FFmpegレンダリングジョブ
 *
 * RenderScriptから最終動画を生成
 */

import { prisma } from "../db";
import { updateProgress, setWaitingExternal, resumeFromWaiting } from "../tasks/progress";
import { getFFmpegRenderer, RenderScript, RenderOptions, RenderProgress } from "../pipelines/ffmpeg";
import { Storage } from "@google-cloud/storage";
import { downloadJSON } from "../utils/gcs";
import { notifyRenderCompleted } from "../services/webhook";

const storage = new Storage();

export interface RenderJobPayload {
  renderScriptUri?: string;
  highlightPlanUri?: string;
  outputOptions?: RenderOptions;
  generateThumbnail?: boolean;
  thumbnailTimestamp?: number;
}

export async function runRender(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { video: true },
  });

  if (!job) throw new Error("Job not found: " + jobId);

  console.log("[Render] Starting render for job " + jobId);

  const payload = job.payload as unknown as RenderJobPayload;

  if (!payload) {
    throw new Error("Job payload is missing. Ensure RENDER job is created with proper payload.");
  }

  await updateProgress(jobId, 5, "loading_script");

  let renderScript: RenderScript;

  if (payload.renderScriptUri) {
    // Use provided render script
    renderScript = await downloadJSON(payload.renderScriptUri) as RenderScript;
    console.log("[Render] Script loaded: " + renderScript.duration + "s, " + renderScript.tracks.length + " tracks");
  } else if (payload.highlightPlanUri) {
    // Generate render script from highlight plan
    console.log("[Render] Loading highlight plan from: " + payload.highlightPlanUri);
    const highlightPlan = await downloadJSON(payload.highlightPlanUri) as any;
    renderScript = await generateRenderScriptFromHighlightPlan(job.videoId, highlightPlan);
    console.log("[Render] Generated render script: " + renderScript.duration + "s, " + renderScript.tracks.length + " tracks");
  } else {
    throw new Error("Either renderScriptUri or highlightPlanUri must be provided in payload");
  }

  await updateProgress(jobId, 10, "initializing_ffmpeg");

  const renderer = getFFmpegRenderer();
  const bucket = process.env.GCS_BUCKET || "videojson-artifacts";
  const outputFormat = payload.outputOptions?.outputFormat || "mp4";
  const outputPath = "outputs/" + jobId + "/video." + outputFormat;

  await setWaitingExternal(jobId, "ffmpeg_render");

  // Render video
  await updateProgress(jobId, 15, "rendering");

  let lastProgress = 0;
  const result = await renderer.renderToGCS(
    renderScript,
    bucket,
    outputPath,
    payload.outputOptions || { quality: "standard" },
    (progress: RenderProgress) => {
      const newProgress = 15 + Math.floor(progress.percent * 0.7);
      if (newProgress > lastProgress) {
        lastProgress = newProgress;
        console.log("[Render] Progress: " + progress.percent.toFixed(1) + "% (" + progress.time + ", " + progress.speed + ")");
      }
    }
  );

  await resumeFromWaiting(jobId);
  await updateProgress(jobId, 85, "saving_output");

  // Save output artifact
  const outputUri = "gs://" + bucket + "/" + outputPath;
  await prisma.artifact.create({
    data: {
      jobId,
      videoId: job.videoId,
      type: "OUTPUT_VIDEO",
      gcsUri: outputUri,
      metadata: {
        duration: result.duration,
        fileSize: result.fileSize,
        format: result.format,
        resolution: result.resolution,
      },
    },
  });

  // Generate thumbnail if requested
  if (payload.generateThumbnail) {
    await updateProgress(jobId, 90, "generating_thumbnail");

    const thumbnailPath = "outputs/" + jobId + "/thumbnail.jpg";
    const tempVideoPath = "/tmp/render-" + jobId + "." + outputFormat;
    const tempThumbPath = "/tmp/thumb-" + jobId + ".jpg";

    try {
      // Download rendered video for thumbnail
      await storage.bucket(bucket).file(outputPath).download({ destination: tempVideoPath });

      // Generate thumbnail
      const timestamp = payload.thumbnailTimestamp || renderScript.duration / 2;
      await renderer.generateThumbnail(tempVideoPath, tempThumbPath, timestamp);

      // Upload thumbnail
      await storage.bucket(bucket).upload(tempThumbPath, {
        destination: thumbnailPath,
        metadata: { contentType: "image/jpeg" },
      });

      await prisma.artifact.create({
        data: {
          jobId,
          videoId: job.videoId,
          type: "THUMBNAIL",
          gcsUri: "gs://" + bucket + "/" + thumbnailPath,
          metadata: { timestamp },
        },
      });

      // Cleanup
      const fs = require("fs");
      if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
      if (fs.existsSync(tempThumbPath)) fs.unlinkSync(tempThumbPath);
    } catch (error) {
      console.warn("[Render] Thumbnail generation failed:", error);
    }
  }

  // Update job result
  await prisma.job.update({
    where: { id: jobId },
    data: {
      result: {
        success: true,
        outputUri,
        renderDuration: result.duration,
        fileSize: result.fileSize,
        format: result.format,
        resolution: result.resolution,
      },
    },
  });

  await updateProgress(jobId, 100, "completed");
  console.log("[Render] Job " + jobId + " completed in " + result.duration.toFixed(1) + "s");
}

/**
 * Create render job from render script
 */
export async function createRenderJob(
  videoId: string,
  renderScriptUri: string,
  options?: RenderOptions,
  generateThumbnail: boolean = true
): Promise<string> {
  const job = await prisma.job.create({
    data: {
      videoId,
      type: "RENDER",
      status: "QUEUED",
      payload: {
        renderScriptUri,
        outputOptions: options ? JSON.parse(JSON.stringify(options)) : undefined,
        generateThumbnail,
      } as any,
    },
  });

  return job.id;
}

/**
 * Generate a RenderScript from a highlight plan
 */
async function generateRenderScriptFromHighlightPlan(
  videoId: string,
  highlightPlan: any
): Promise<RenderScript> {
  // Get the normalized video artifact
  const videoArtifact = await prisma.artifact.findFirst({
    where: { videoId, type: "NORMALIZED_VIDEO" },
    orderBy: { createdAt: "desc" },
  });

  if (!videoArtifact) {
    throw new Error("NORMALIZED_VIDEO artifact not found");
  }

  // Get selected segments from highlight plan
  const selectedCandidates = highlightPlan.candidates?.filter(
    (c: any) => c.selected
  ) || [];

  // If no segments selected, use top 3 by score
  const segments = selectedCandidates.length > 0
    ? selectedCandidates
    : (highlightPlan.candidates || [])
        .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
        .slice(0, 3);

  if (segments.length === 0) {
    throw new Error("No segments available for rendering");
  }

  // Calculate total duration
  const totalDuration = segments.reduce(
    (sum: number, seg: any) => sum + (seg.end - seg.start),
    0
  );

  // Build render script
  const renderScript: RenderScript = {
    version: "1.0",
    duration: totalDuration,
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [
      {
        id: "main_video",
        type: "video",
        clips: segments.map((seg: any, index: number) => {
          const prevDuration = segments
            .slice(0, index)
            .reduce((sum: number, s: any) => sum + (s.end - s.start), 0);
          const clipDuration = seg.end - seg.start;
          return {
            id: `clip_${index}`,
            source: videoArtifact.gcsUri,
            startTime: prevDuration,
            endTime: prevDuration + clipDuration,
          };
        }),
      },
    ],
  };

  return renderScript;
}
