/**
 * ComfyUI Pipeline - AI生成パイプライン
 *
 * 動画生成のためのAI画像/動画生成を統合管理
 */

import { Storage } from "@google-cloud/storage";
import * as fs from "fs";
import * as path from "path";
import {
  ComfyUIClient,
  getComfyUIClient,
  GenerationResult,
  TextToImageRequest,
  ImageToImageRequest,
  VideoGenerationRequest,
} from "../../providers/comfyui/client";
import {
  WorkflowTemplate,
  getWorkflowTemplate,
  applyInputsToWorkflow,
  listWorkflowTemplates,
} from "../../providers/comfyui/workflows";

const storage = new Storage();

export interface ComfyUITask {
  id: string;
  type: "text-to-image" | "image-to-image" | "image-to-video" | "workflow";
  status: "pending" | "running" | "completed" | "failed";
  request: any;
  result?: GenerationResult;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface BatchGenerationRequest {
  tasks: Array<{
    type: "text-to-image" | "image-to-image" | "image-to-video" | "workflow";
    request: TextToImageRequest | ImageToImageRequest | VideoGenerationRequest | WorkflowRequest;
  }>;
  outputBucket?: string;
  outputPrefix?: string;
  concurrency?: number;
}

export interface WorkflowRequest {
  workflowName: string;
  inputs: Record<string, any>;
}

export interface BatchGenerationResult {
  success: boolean;
  tasks: ComfyUITask[];
  outputUris: string[];
  totalTime: number;
  failedCount: number;
}

export interface PlaceholderGenerationRequest {
  placeholders: Array<{
    id: string;
    type: "image" | "video";
    prompt: string;
    negativePrompt?: string;
    referenceImage?: string;
    style?: string;
    width?: number;
    height?: number;
  }>;
  stylePrefix?: string;
  outputBucket: string;
  outputPrefix: string;
}

export interface PlaceholderGenerationResult {
  success: boolean;
  results: Array<{
    placeholderId: string;
    gcsUri: string;
    type: "image" | "video";
    error?: string;
  }>;
}

export class ComfyUIPipeline {
  private client: ComfyUIClient;
  private bucket: string;

  constructor(client?: ComfyUIClient) {
    this.client = client || getComfyUIClient();
    this.bucket = process.env.GCS_BUCKET || "videojson-artifacts";
  }

  /**
   * Generate single image from text
   */
  async generateImage(request: TextToImageRequest): Promise<GenerationResult> {
    console.log("[ComfyUI Pipeline] Generating image from text: " + request.prompt.slice(0, 50) + "...");
    return this.client.textToImage(request);
  }

  /**
   * Transform image with AI
   */
  async transformImage(request: ImageToImageRequest): Promise<GenerationResult> {
    console.log("[ComfyUI Pipeline] Transforming image with prompt: " + request.prompt.slice(0, 50) + "...");
    return this.client.imageToImage(request);
  }

  /**
   * Generate video from image
   */
  async generateVideo(request: VideoGenerationRequest): Promise<GenerationResult> {
    console.log("[ComfyUI Pipeline] Generating video from image");
    return this.client.imageToVideo(request);
  }

  /**
   * Execute named workflow
   */
  async executeWorkflow(workflowName: string, inputs: Record<string, any>): Promise<GenerationResult> {
    const template = getWorkflowTemplate(workflowName);
    if (!template) {
      throw new Error("Unknown workflow: " + workflowName);
    }

    console.log("[ComfyUI Pipeline] Executing workflow: " + workflowName);
    const workflow = applyInputsToWorkflow(template, inputs);
    const outputNodeId = template.outputs[0]?.nodeId;

    return this.client.executeWorkflow({ workflow, outputNodeId });
  }

  /**
   * Batch generate multiple assets
   */
  async batchGenerate(request: BatchGenerationRequest): Promise<BatchGenerationResult> {
    const startTime = Date.now();
    const concurrency = request.concurrency || 1;
    const tasks: ComfyUITask[] = [];
    const outputUris: string[] = [];
    let failedCount = 0;

    // Create task objects
    for (let i = 0; i < request.tasks.length; i++) {
      const task = request.tasks[i];
      tasks.push({
        id: "task-" + Date.now() + "-" + i,
        type: task.type,
        status: "pending",
        request: task.request,
        createdAt: new Date(),
      });
    }

    // Process tasks with concurrency limit
    const processingQueue = [...tasks];
    const activePromises: Promise<void>[] = [];

    const processTask = async (task: ComfyUITask): Promise<void> => {
      task.status = "running";
      console.log("[ComfyUI Pipeline] Processing task " + task.id);

      try {
        let result: GenerationResult;

        switch (task.type) {
          case "text-to-image":
            result = await this.client.textToImage(task.request as TextToImageRequest);
            break;
          case "image-to-image":
            result = await this.client.imageToImage(task.request as ImageToImageRequest);
            break;
          case "image-to-video":
            result = await this.client.imageToVideo(task.request as VideoGenerationRequest);
            break;
          case "workflow":
            const wfReq = task.request as WorkflowRequest;
            result = await this.executeWorkflow(wfReq.workflowName, wfReq.inputs);
            break;
          default:
            throw new Error("Unknown task type: " + task.type);
        }

        task.result = result;
        task.status = result.success ? "completed" : "failed";
        task.error = result.error;
        task.completedAt = new Date();

        // Upload to GCS if bucket specified
        if (result.success && request.outputBucket) {
          const prefix = request.outputPrefix || "comfyui-outputs/" + Date.now();
          const uris = await this.client.uploadResultToGCS(result, request.outputBucket, prefix);
          outputUris.push(...uris);
        }

        if (!result.success) {
          failedCount++;
        }
      } catch (error: any) {
        task.status = "failed";
        task.error = error.message;
        task.completedAt = new Date();
        failedCount++;
        console.error("[ComfyUI Pipeline] Task " + task.id + " failed:", error.message);
      }
    };

    // Process with concurrency
    while (processingQueue.length > 0 || activePromises.length > 0) {
      while (activePromises.length < concurrency && processingQueue.length > 0) {
        const task = processingQueue.shift()!;
        const promise = processTask(task).then(() => {
          const idx = activePromises.indexOf(promise);
          if (idx > -1) activePromises.splice(idx, 1);
        });
        activePromises.push(promise);
      }

      if (activePromises.length > 0) {
        await Promise.race(activePromises);
      }
    }

    return {
      success: failedCount === 0,
      tasks,
      outputUris,
      totalTime: (Date.now() - startTime) / 1000,
      failedCount,
    };
  }

  /**
   * Generate assets for template placeholders
   */
  async generatePlaceholderAssets(request: PlaceholderGenerationRequest): Promise<PlaceholderGenerationResult> {
    const results: PlaceholderGenerationResult["results"] = [];

    for (const placeholder of request.placeholders) {
      console.log("[ComfyUI Pipeline] Generating asset for placeholder: " + placeholder.id);

      try {
        let result: GenerationResult;
        const fullPrompt = request.stylePrefix
          ? request.stylePrefix + ", " + placeholder.prompt
          : placeholder.prompt;

        if (placeholder.type === "video") {
          // Video generation
          if (placeholder.referenceImage) {
            result = await this.client.imageToVideo({
              sourceImage: placeholder.referenceImage,
              prompt: fullPrompt,
              fps: 8,
            });
          } else {
            // Generate image first, then animate
            const imageResult = await this.client.textToImage({
              prompt: fullPrompt,
              negativePrompt: placeholder.negativePrompt,
              width: placeholder.width || 512,
              height: placeholder.height || 512,
            });

            if (!imageResult.success || imageResult.images.length === 0) {
              throw new Error("Failed to generate base image");
            }

            result = await this.client.imageToVideo({
              sourceImage: imageResult.images[0].localPath!,
              prompt: "animate, " + fullPrompt,
            });
          }
        } else {
          // Image generation
          if (placeholder.referenceImage) {
            result = await this.client.imageToImage({
              sourceImage: placeholder.referenceImage,
              prompt: fullPrompt,
              negativePrompt: placeholder.negativePrompt,
              width: placeholder.width,
              height: placeholder.height,
            });
          } else {
            result = await this.client.textToImage({
              prompt: fullPrompt,
              negativePrompt: placeholder.negativePrompt,
              width: placeholder.width || 512,
              height: placeholder.height || 512,
            });
          }
        }

        if (!result.success || result.images.length === 0) {
          throw new Error(result.error || "No output generated");
        }

        // Upload to GCS
        const gcsPath = request.outputPrefix + "/" + placeholder.id + (placeholder.type === "video" ? ".mp4" : ".png");
        const localPath = result.images[0].localPath!;

        await storage.bucket(request.outputBucket).upload(localPath, {
          destination: gcsPath,
          metadata: {
            contentType: placeholder.type === "video" ? "video/mp4" : "image/png",
          },
        });

        // Cleanup local file
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }

        results.push({
          placeholderId: placeholder.id,
          gcsUri: "gs://" + request.outputBucket + "/" + gcsPath,
          type: placeholder.type,
        });
      } catch (error: any) {
        console.error("[ComfyUI Pipeline] Failed to generate placeholder " + placeholder.id + ":", error.message);
        results.push({
          placeholderId: placeholder.id,
          gcsUri: "",
          type: placeholder.type,
          error: error.message,
        });
      }
    }

    return {
      success: results.every((r) => !r.error),
      results,
    };
  }

  /**
   * Upscale image
   */
  async upscaleImage(imageSource: string, scale: number = 4): Promise<GenerationResult> {
    console.log("[ComfyUI Pipeline] Upscaling image " + scale + "x");

    // Download image if needed
    let localPath = imageSource;
    if (imageSource.startsWith("gs://")) {
      localPath = await this.downloadFromGCS(imageSource);
    } else if (imageSource.startsWith("http")) {
      localPath = await this.downloadFromURL(imageSource);
    }

    return this.executeWorkflow("image-upscale-4x", { image: localPath });
  }

  /**
   * Inpaint image region
   */
  async inpaintImage(
    imageSource: string,
    maskSource: string,
    prompt: string,
    negativePrompt?: string
  ): Promise<GenerationResult> {
    console.log("[ComfyUI Pipeline] Inpainting image");

    let imagePath = imageSource;
    let maskPath = maskSource;

    if (imageSource.startsWith("gs://")) {
      imagePath = await this.downloadFromGCS(imageSource);
    }
    if (maskSource.startsWith("gs://")) {
      maskPath = await this.downloadFromGCS(maskSource);
    }

    return this.executeWorkflow("image-inpaint", {
      image: imagePath,
      mask: maskPath,
      prompt,
      negativePrompt: negativePrompt || "",
    });
  }

  /**
   * Face swap between images
   */
  async faceSwap(sourceImage: string, targetImage: string): Promise<GenerationResult> {
    console.log("[ComfyUI Pipeline] Swapping faces");

    let sourcePath = sourceImage;
    let targetPath = targetImage;

    if (sourceImage.startsWith("gs://")) {
      sourcePath = await this.downloadFromGCS(sourceImage);
    }
    if (targetImage.startsWith("gs://")) {
      targetPath = await this.downloadFromGCS(targetImage);
    }

    return this.executeWorkflow("face-swap", {
      sourceImage: sourcePath,
      targetImage: targetPath,
    });
  }

  /**
   * Generate with ControlNet
   */
  async generateWithControlNet(
    controlImage: string,
    prompt: string,
    controlType: "pose" | "canny" | "depth" = "pose",
    strength: number = 1.0
  ): Promise<GenerationResult> {
    console.log("[ComfyUI Pipeline] Generating with ControlNet: " + controlType);

    let imagePath = controlImage;
    if (controlImage.startsWith("gs://")) {
      imagePath = await this.downloadFromGCS(controlImage);
    }

    return this.executeWorkflow("controlnet-pose", {
      poseImage: imagePath,
      prompt,
      controlStrength: strength,
    });
  }

  /**
   * List available workflows
   */
  listWorkflows(): Array<{ name: string; description: string; category: string }> {
    return listWorkflowTemplates();
  }

  /**
   * Get ComfyUI system status
   */
  async getStatus(): Promise<{ connected: boolean; queue: { running: number; pending: number } }> {
    try {
      const stats = await this.client.getSystemStats();
      return { connected: true, ...stats };
    } catch {
      return { connected: false, queue: { running: 0, pending: 0 } };
    }
  }

  /**
   * Get available models
   */
  async getModels(): Promise<string[]> {
    return this.client.getModels();
  }

  /**
   * Download from GCS
   */
  private async downloadFromGCS(gcsUri: string): Promise<string> {
    const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!match) throw new Error("Invalid GCS URI: " + gcsUri);

    const [, bucket, filePath] = match;
    const ext = path.extname(filePath) || ".png";
    const localPath = "/tmp/comfyui-pipeline-" + Date.now() + ext;

    await storage.bucket(bucket).file(filePath).download({ destination: localPath });
    return localPath;
  }

  /**
   * Download from URL
   */
  private async downloadFromURL(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to download: " + url);

    const ext = path.extname(new URL(url).pathname) || ".png";
    const localPath = "/tmp/comfyui-pipeline-" + Date.now() + ext;

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(localPath, buffer);
    return localPath;
  }
}

let pipelineInstance: ComfyUIPipeline | null = null;

export function getComfyUIPipeline(): ComfyUIPipeline {
  if (!pipelineInstance) {
    pipelineInstance = new ComfyUIPipeline();
  }
  return pipelineInstance;
}
