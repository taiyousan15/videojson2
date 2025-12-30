/**
 * Generate Job - 動画生成ジョブ
 *
 * テンプレートから新しい動画を生成
 */

import { prisma } from "../db";
import {
  updateProgress,
  setWaitingExternal,
  resumeFromWaiting,
} from "../tasks/progress";
import {
  VideoGenerationPipeline,
  getVideoGenerationPipeline,
  VideoGenerationRequest,
  PlaceholderReplacement,
} from "../pipelines/video_generation";
import { Storage } from "@google-cloud/storage";

const storage = new Storage();

export interface GenerateJobPayload {
  templateId: string;
  replacements: Record<string, PlaceholderReplacement>;
  outputOptions?: {
    format?: "mp4" | "webm" | "mov";
    quality?: "draft" | "standard" | "high";
    resolution?: { width: number; height: number };
  };
}

export async function runGenerate(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { video: true },
  });

  if (!job) throw new Error(`Job not found: ${jobId}`);

  console.log(`[Generate] Starting generation for job ${jobId}`);

  const payload = job.payload as unknown as GenerateJobPayload;

  // Get template artifact
  const templateArtifact = await prisma.artifact.findFirst({
    where: {
      OR: [
        { id: payload.templateId },
        { videoId: payload.templateId, type: "TEMPLATE_JSON" },
      ],
    },
  });

  if (!templateArtifact) {
    throw new Error(`Template not found: ${payload.templateId}`);
  }

  await updateProgress(jobId, 5, "loading_template");

  // Download template from GCS
  const template = await downloadTemplate(templateArtifact.gcsUri);
  console.log(`[Generate] Template loaded: ${template.name}`);

  await updateProgress(jobId, 10, "initializing_pipeline");

  // Initialize pipeline
  const pipeline = getVideoGenerationPipeline();

  await setWaitingExternal(jobId, "ai_generation");

  // Run generation
  const result = await pipeline.generate(
    {
      templateId: payload.templateId,
      template,
      replacements: payload.replacements,
      outputOptions: payload.outputOptions,
    },
    (stage, progress, message) => {
      const overallProgress = 10 + progress * 0.8; // 10-90%
      console.log(`[Generate] ${stage}: ${progress}% - ${message}`);
    }
  );

  await resumeFromWaiting(jobId);
  await updateProgress(jobId, 90, "saving_results");

  // Save render script as artifact
  const bucket = process.env.GCS_BUCKET || "videojson-artifacts";
  const basePath = `generations/${jobId}`;

  const renderScriptUri = `gs://${bucket}/${basePath}/render-script.json`;
  await uploadJSON(bucket, `${basePath}/render-script.json`, result.renderScript);

  await prisma.artifact.create({
    data: {
      jobId,
      videoId: job.videoId,
      type: "RENDER_SCRIPT",
      gcsUri: renderScriptUri,
      metadata: {
        duration: result.renderScript.duration,
        resolution: result.renderScript.resolution,
        trackCount: result.renderScript.tracks.length,
      },
    },
  });

  // Save generated assets metadata
  const assetsUri = `gs://${bucket}/${basePath}/assets.json`;
  await uploadJSON(bucket, `${basePath}/assets.json`, {
    assets: result.assets,
    generated: new Date().toISOString(),
  });

  await prisma.artifact.create({
    data: {
      jobId,
      videoId: job.videoId,
      type: "GENERATED_ASSETS",
      gcsUri: assetsUri,
      metadata: {
        assetCount: result.assets.length,
      },
    },
  });

  // Update job result
  await prisma.job.update({
    where: { id: jobId },
    data: {
      result: {
        success: result.success,
        renderScriptUri,
        assetsUri,
        videoUrl: result.videoUrl,
        stats: result.stats,
        errors: result.errors,
      },
    },
  });

  if (!result.success) {
    console.error(`[Generate] Generation completed with errors:`, result.errors);
    await updateProgress(jobId, 100, "completed_with_errors");
    return;
  }

  await updateProgress(jobId, 100, "completed");
  console.log(`[Generate] Job ${jobId} completed successfully`);
}

/**
 * Download template from GCS
 */
async function downloadTemplate(gcsUri: string): Promise<any> {
  const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid GCS URI: ${gcsUri}`);
  }

  const [, bucket, path] = match;
  const file = storage.bucket(bucket).file(path);

  const [content] = await file.download();
  return JSON.parse(content.toString());
}

/**
 * Upload JSON to GCS
 */
async function uploadJSON(bucket: string, path: string, data: object): Promise<void> {
  const file = storage.bucket(bucket).file(path);
  await file.save(JSON.stringify(data, null, 2), {
    contentType: "application/json",
  });
}

/**
 * Create generation job from template
 */
export async function createGenerationJob(
  videoId: string,
  templateId: string,
  replacements: Record<string, PlaceholderReplacement>,
  options?: GenerateJobPayload["outputOptions"]
): Promise<string> {
  const job = await prisma.job.create({
    data: {
      videoId,
      type: "GENERATE",
      status: "QUEUED",
      payload: {
        templateId,
        replacements,
        outputOptions: options,
      },
    },
  });

  return job.id;
}
