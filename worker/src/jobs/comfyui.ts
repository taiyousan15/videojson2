/**
 * ComfyUI Job - AI画像/動画生成ジョブ
 *
 * ComfyUIを使用してAI生成を実行
 */

import { prisma } from "../db";
import { updateProgress, setWaitingExternal, resumeFromWaiting } from "../tasks/progress";
import { getComfyUIPipeline, PlaceholderGenerationRequest } from "../pipelines/comfyui";
import { TextToImageRequest, ImageToImageRequest, VideoGenerationRequest } from "../providers/comfyui/client";
import { WorkflowRequest } from "../pipelines/comfyui";

export interface ComfyUIJobPayload {
  type: "text-to-image" | "image-to-image" | "image-to-video" | "workflow" | "batch" | "placeholder";
  request: TextToImageRequest | ImageToImageRequest | VideoGenerationRequest | WorkflowRequest | BatchRequest | PlaceholderRequest;
  outputBucket?: string;
  outputPrefix?: string;
}

interface BatchRequest {
  tasks: Array<{
    type: "text-to-image" | "image-to-image" | "image-to-video" | "workflow";
    request: any;
  }>;
  concurrency?: number;
}

interface PlaceholderRequest {
  placeholders: PlaceholderGenerationRequest["placeholders"];
  stylePrefix?: string;
}

export async function runComfyUI(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { video: true },
  });

  if (!job) throw new Error("Job not found: " + jobId);

  console.log("[ComfyUI] Starting job " + jobId);

  const payload = job.payload as unknown as ComfyUIJobPayload;
  const pipeline = getComfyUIPipeline();
  const bucket = payload.outputBucket || process.env.GCS_BUCKET || "videojson-artifacts";
  const prefix = payload.outputPrefix || "comfyui/" + jobId;

  await updateProgress(jobId, 5, "initializing");

  try {
    // Check ComfyUI connection
    const status = await pipeline.getStatus();
    if (!status.connected) {
      throw new Error("ComfyUI server is not connected");
    }

    await setWaitingExternal(jobId, "comfyui_generation");
    await updateProgress(jobId, 10, "generating");

    let result: any;
    let outputUris: string[] = [];

    switch (payload.type) {
      case "text-to-image": {
        const genResult = await pipeline.generateImage(payload.request as TextToImageRequest);
        if (!genResult.success) throw new Error(genResult.error || "Generation failed");
        outputUris = await uploadResults(genResult.images, bucket, prefix);
        result = { type: "text-to-image", images: outputUris };
        break;
      }

      case "image-to-image": {
        const genResult = await pipeline.transformImage(payload.request as ImageToImageRequest);
        if (!genResult.success) throw new Error(genResult.error || "Generation failed");
        outputUris = await uploadResults(genResult.images, bucket, prefix);
        result = { type: "image-to-image", images: outputUris };
        break;
      }

      case "image-to-video": {
        const genResult = await pipeline.generateVideo(payload.request as VideoGenerationRequest);
        if (!genResult.success) throw new Error(genResult.error || "Generation failed");
        outputUris = await uploadResults(genResult.images, bucket, prefix);
        result = { type: "image-to-video", videos: outputUris };
        break;
      }

      case "workflow": {
        const wfReq = payload.request as WorkflowRequest;
        const genResult = await pipeline.executeWorkflow(wfReq.workflowName, wfReq.inputs);
        if (!genResult.success) throw new Error(genResult.error || "Generation failed");
        outputUris = await uploadResults(genResult.images, bucket, prefix);
        result = { type: "workflow", workflow: wfReq.workflowName, outputs: outputUris };
        break;
      }

      case "batch": {
        const batchReq = payload.request as BatchRequest;
        await updateProgress(jobId, 15, "batch_processing");

        const batchResult = await pipeline.batchGenerate({
          tasks: batchReq.tasks,
          outputBucket: bucket,
          outputPrefix: prefix,
          concurrency: batchReq.concurrency || 1,
        });

        if (!batchResult.success) {
          console.warn("[ComfyUI] Batch had " + batchResult.failedCount + " failures");
        }

        result = {
          type: "batch",
          success: batchResult.success,
          totalTasks: batchResult.tasks.length,
          failedTasks: batchResult.failedCount,
          outputs: batchResult.outputUris,
          totalTime: batchResult.totalTime,
        };
        outputUris = batchResult.outputUris;
        break;
      }

      case "placeholder": {
        const placeholderReq = payload.request as PlaceholderRequest;
        await updateProgress(jobId, 15, "generating_placeholders");

        const placeholderResult = await pipeline.generatePlaceholderAssets({
          placeholders: placeholderReq.placeholders,
          stylePrefix: placeholderReq.stylePrefix,
          outputBucket: bucket,
          outputPrefix: prefix,
        });

        result = {
          type: "placeholder",
          success: placeholderResult.success,
          results: placeholderResult.results,
        };
        outputUris = placeholderResult.results.filter(r => r.gcsUri).map(r => r.gcsUri);
        break;
      }

      default:
        throw new Error("Unknown ComfyUI job type: " + payload.type);
    }

    await resumeFromWaiting(jobId);
    await updateProgress(jobId, 90, "saving_artifacts");

    // Save artifacts
    for (const uri of outputUris) {
      const isVideo = uri.endsWith(".mp4") || uri.endsWith(".webm");
      await prisma.artifact.create({
        data: {
          jobId,
          videoId: job.videoId,
          type: "GENERATED_ASSETS",
          gcsUri: uri,
          metadata: {
            generationType: payload.type,
            isVideo,
          },
        },
      });
    }

    // Update job result
    await prisma.job.update({
      where: { id: jobId },
      data: {
        result: {
          success: true,
          ...result,
          outputCount: outputUris.length,
        },
      },
    });

    await updateProgress(jobId, 100, "completed");
    console.log("[ComfyUI] Job " + jobId + " completed with " + outputUris.length + " outputs");
  } catch (error: any) {
    await resumeFromWaiting(jobId);
    console.error("[ComfyUI] Job " + jobId + " failed:", error.message);

    await prisma.job.update({
      where: { id: jobId },
      data: {
        result: {
          success: false,
          error: error.message,
        },
      },
    });

    throw error;
  }
}

/**
 * Create ComfyUI job
 */
export async function createComfyUIJob(
  videoId: string,
  type: ComfyUIJobPayload["type"],
  request: ComfyUIJobPayload["request"],
  options?: {
    outputBucket?: string;
    outputPrefix?: string;
  }
): Promise<string> {
  const job = await prisma.job.create({
    data: {
      videoId,
      type: "COMFYUI" as any,
      status: "QUEUED",
      payload: {
        type,
        request: JSON.parse(JSON.stringify(request)),
        outputBucket: options?.outputBucket,
        outputPrefix: options?.outputPrefix,
      } as any,
    },
  });

  return job.id;
}

/**
 * Upload generation results to GCS
 */
async function uploadResults(
  images: Array<{ filename: string; localPath?: string }>,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const { Storage } = await import("@google-cloud/storage");
  const storage = new Storage();
  const fs = await import("fs");
  const uris: string[] = [];

  for (const image of images) {
    if (image.localPath && fs.existsSync(image.localPath)) {
      const gcsPath = prefix + "/" + image.filename;
      const contentType = image.filename.endsWith(".mp4") ? "video/mp4" : "image/png";

      await storage.bucket(bucket).upload(image.localPath, {
        destination: gcsPath,
        metadata: { contentType },
      });

      uris.push("gs://" + bucket + "/" + gcsPath);

      // Cleanup local file
      fs.unlinkSync(image.localPath);
    }
  }

  return uris;
}
