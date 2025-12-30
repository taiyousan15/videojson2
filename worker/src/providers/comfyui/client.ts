/**
 * ComfyUI Client - AI画像/動画生成
 *
 * ComfyUI APIと連携してStable Diffusion等のAI生成を実行
 */

import { Storage } from "@google-cloud/storage";
import * as fs from "fs";
import * as path from "path";
import WebSocket from "ws";

const storage = new Storage();

export interface ComfyUIConfig {
  baseUrl: string;
  wsUrl?: string;
  timeout?: number;
}

export interface WorkflowNode {
  class_type: string;
  inputs: Record<string, any>;
}

export interface ComfyWorkflow {
  [nodeId: string]: WorkflowNode;
}

export interface QueuePromptResponse {
  prompt_id: string;
  number: number;
  node_errors: Record<string, any>;
}

export interface HistoryItem {
  prompt: [number, string, ComfyWorkflow, any, string[]];
  outputs: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>;
  status: { status_str: string; completed: boolean; messages: any[] };
}

export interface GenerationRequest {
  workflow: ComfyWorkflow;
  clientId?: string;
  outputNodeId?: string;
}

export interface GenerationResult {
  success: boolean;
  promptId: string;
  images: Array<{
    filename: string;
    url: string;
    localPath?: string;
  }>;
  error?: string;
  executionTime?: number;
}

export interface ImageToImageRequest {
  sourceImage: string;
  prompt: string;
  negativePrompt?: string;
  strength?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  width?: number;
  height?: number;
}

export interface TextToImageRequest {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  model?: string;
  sampler?: string;
  scheduler?: string;
}

export interface VideoGenerationRequest {
  sourceImage: string;
  prompt?: string;
  frames?: number;
  fps?: number;
  motionStrength?: number;
}

export class ComfyUIClient {
  private config: ComfyUIConfig;
  private clientId: string;

  constructor(config?: Partial<ComfyUIConfig>) {
    this.config = {
      baseUrl: config?.baseUrl || process.env.COMFYUI_URL || "http://localhost:8188",
      wsUrl: config?.wsUrl || process.env.COMFYUI_WS_URL,
      timeout: config?.timeout || 300000,
    };
    this.clientId = "videojson-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  }

  /**
   * Queue a workflow for execution
   */
  async queuePrompt(workflow: ComfyWorkflow): Promise<QueuePromptResponse> {
    const response = await fetch(this.config.baseUrl + "/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: workflow,
        client_id: this.clientId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error("Failed to queue prompt: " + error);
    }

    return await response.json() as QueuePromptResponse;
  }

  /**
   * Queue workflow by name (legacy support)
   */
  async queuePromptByName(workflowName: string, inputs: Record<string, any>): Promise<string> {
    const workflow = await this.loadWorkflow(workflowName);
    const prompt = this.injectInputs(workflow, inputs);
    const result = await this.queuePrompt(prompt);
    return result.prompt_id;
  }

  /**
   * Get execution history
   */
  async getHistory(promptId?: string): Promise<Record<string, HistoryItem>> {
    const url = promptId
      ? this.config.baseUrl + "/history/" + promptId
      : this.config.baseUrl + "/history";

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to get history");
    }

    return await response.json() as Record<string, HistoryItem>;
  }

  /**
   * Upload an image to ComfyUI
   */
  async uploadImage(imagePath: string, subfolder?: string): Promise<{ name: string; subfolder: string; type: string }> {
    const formData = new FormData();
    const imageBuffer = fs.readFileSync(imagePath);
    const blob = new Blob([imageBuffer]);
    formData.append("image", blob, path.basename(imagePath));
    if (subfolder) {
      formData.append("subfolder", subfolder);
    }

    const response = await fetch(this.config.baseUrl + "/upload/image", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Failed to upload image");
    }

    return await response.json() as { name: string; subfolder: string; type: string };
  }

  /**
   * Download generated image
   */
  async downloadImage(filename: string, subfolder: string = "", type: string = "output"): Promise<Buffer> {
    const params = new URLSearchParams({ filename, subfolder, type });
    const response = await fetch(this.config.baseUrl + "/view?" + params.toString());

    if (!response.ok) {
      throw new Error("Failed to download image: " + filename);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * Get output (legacy alias)
   */
  async getOutput(promptId: string, filename: string): Promise<Buffer> {
    return this.downloadImage(filename, "", "output");
  }

  /**
   * Execute workflow and wait for completion
   */
  async executeWorkflow(request: GenerationRequest): Promise<GenerationResult> {
    const startTime = Date.now();

    const queueResult = await this.queuePrompt(request.workflow);
    console.log("[ComfyUI] Queued prompt: " + queueResult.prompt_id);

    if (Object.keys(queueResult.node_errors).length > 0) {
      return {
        success: false,
        promptId: queueResult.prompt_id,
        images: [],
        error: "Node errors: " + JSON.stringify(queueResult.node_errors),
      };
    }

    const wsUrl = this.config.wsUrl || this.config.baseUrl.replace("http", "ws") + "/ws?clientId=" + this.clientId;

    try {
      await this.waitForCompletionWs(queueResult.prompt_id, wsUrl);
    } catch (error) {
      console.log("[ComfyUI] WebSocket failed, falling back to polling");
      await this.pollForCompletion(queueResult.prompt_id);
    }

    const history = await this.getHistory(queueResult.prompt_id);
    const result = history[queueResult.prompt_id];

    if (!result) {
      return {
        success: false,
        promptId: queueResult.prompt_id,
        images: [],
        error: "No result found in history",
      };
    }

    const images: GenerationResult["images"] = [];
    const outputNodeId = request.outputNodeId || this.findOutputNode(request.workflow);

    if (result.outputs && result.outputs[outputNodeId]?.images) {
      for (const img of result.outputs[outputNodeId].images) {
        const imageBuffer = await this.downloadImage(img.filename, img.subfolder, img.type);
        const localPath = "/tmp/comfyui-" + Date.now() + "-" + img.filename;
        fs.writeFileSync(localPath, imageBuffer);

        images.push({
          filename: img.filename,
          url: this.config.baseUrl + "/view?filename=" + img.filename + "&subfolder=" + img.subfolder + "&type=" + img.type,
          localPath,
        });
      }
    }

    return {
      success: true,
      promptId: queueResult.prompt_id,
      images,
      executionTime: (Date.now() - startTime) / 1000,
    };
  }

  /**
   * Text to Image generation
   */
  async textToImage(request: TextToImageRequest): Promise<GenerationResult> {
    const workflow = this.buildTextToImageWorkflow(request);
    return this.executeWorkflow({ workflow, outputNodeId: "9" });
  }

  /**
   * Image to Image generation
   */
  async imageToImage(request: ImageToImageRequest): Promise<GenerationResult> {
    let localImagePath = request.sourceImage;
    if (request.sourceImage.startsWith("gs://")) {
      localImagePath = await this.downloadFromGCS(request.sourceImage);
    } else if (request.sourceImage.startsWith("http")) {
      localImagePath = await this.downloadFromURL(request.sourceImage);
    }

    const uploaded = await this.uploadImage(localImagePath);

    const workflow = this.buildImageToImageWorkflow({
      ...request,
      sourceImage: uploaded.name,
    });

    return this.executeWorkflow({ workflow, outputNodeId: "9" });
  }

  /**
   * Generate video from image (AnimateDiff or similar)
   */
  async imageToVideo(request: VideoGenerationRequest): Promise<GenerationResult> {
    let localImagePath = request.sourceImage;
    if (request.sourceImage.startsWith("gs://")) {
      localImagePath = await this.downloadFromGCS(request.sourceImage);
    } else if (request.sourceImage.startsWith("http")) {
      localImagePath = await this.downloadFromURL(request.sourceImage);
    }

    const uploaded = await this.uploadImage(localImagePath);

    const workflow = this.buildImageToVideoWorkflow({
      ...request,
      sourceImage: uploaded.name,
    });

    return this.executeWorkflow({ workflow, outputNodeId: "video_output" });
  }

  /**
   * Upload result to GCS
   */
  async uploadResultToGCS(result: GenerationResult, bucket: string, prefix: string): Promise<string[]> {
    const uploadedUris: string[] = [];

    for (const image of result.images) {
      if (image.localPath && fs.existsSync(image.localPath)) {
        const gcsPath = prefix + "/" + image.filename;
        await storage.bucket(bucket).upload(image.localPath, {
          destination: gcsPath,
          metadata: { contentType: "image/png" },
        });
        uploadedUris.push("gs://" + bucket + "/" + gcsPath);
        fs.unlinkSync(image.localPath);
      }
    }

    return uploadedUris;
  }

  /**
   * Wait for completion (legacy method)
   */
  async waitForCompletion(promptId: string, timeoutMs = 600000): Promise<void> {
    const wsUrl = this.config.baseUrl.replace("http", "ws") + "/ws";
    return this.waitForCompletionWs(promptId, wsUrl, timeoutMs);
  }

  /**
   * Build text-to-image workflow
   */
  private buildTextToImageWorkflow(request: TextToImageRequest): ComfyWorkflow {
    return {
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: request.seed ?? Math.floor(Math.random() * 1000000000),
          steps: request.steps ?? 20,
          cfg: request.cfg ?? 7,
          sampler_name: request.sampler ?? "euler",
          scheduler: request.scheduler ?? "normal",
          denoise: 1,
          model: ["4", 0],
          positive: ["6", 0],
          negative: ["7", 0],
          latent_image: ["5", 0],
        },
      },
      "4": {
        class_type: "CheckpointLoaderSimple",
        inputs: {
          ckpt_name: request.model ?? "v1-5-pruned-emaonly.ckpt",
        },
      },
      "5": {
        class_type: "EmptyLatentImage",
        inputs: {
          width: request.width ?? 512,
          height: request.height ?? 512,
          batch_size: 1,
        },
      },
      "6": {
        class_type: "CLIPTextEncode",
        inputs: {
          text: request.prompt,
          clip: ["4", 1],
        },
      },
      "7": {
        class_type: "CLIPTextEncode",
        inputs: {
          text: request.negativePrompt ?? "",
          clip: ["4", 1],
        },
      },
      "8": {
        class_type: "VAEDecode",
        inputs: {
          samples: ["3", 0],
          vae: ["4", 2],
        },
      },
      "9": {
        class_type: "SaveImage",
        inputs: {
          filename_prefix: "ComfyUI",
          images: ["8", 0],
        },
      },
    };
  }

  /**
   * Build image-to-image workflow
   */
  private buildImageToImageWorkflow(request: ImageToImageRequest & { sourceImage: string }): ComfyWorkflow {
    return {
      "1": {
        class_type: "LoadImage",
        inputs: {
          image: request.sourceImage,
        },
      },
      "2": {
        class_type: "VAEEncode",
        inputs: {
          pixels: ["1", 0],
          vae: ["4", 2],
        },
      },
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: request.seed ?? Math.floor(Math.random() * 1000000000),
          steps: request.steps ?? 20,
          cfg: request.cfg ?? 7,
          sampler_name: "euler",
          scheduler: "normal",
          denoise: request.strength ?? 0.75,
          model: ["4", 0],
          positive: ["6", 0],
          negative: ["7", 0],
          latent_image: ["2", 0],
        },
      },
      "4": {
        class_type: "CheckpointLoaderSimple",
        inputs: {
          ckpt_name: "v1-5-pruned-emaonly.ckpt",
        },
      },
      "6": {
        class_type: "CLIPTextEncode",
        inputs: {
          text: request.prompt,
          clip: ["4", 1],
        },
      },
      "7": {
        class_type: "CLIPTextEncode",
        inputs: {
          text: request.negativePrompt ?? "",
          clip: ["4", 1],
        },
      },
      "8": {
        class_type: "VAEDecode",
        inputs: {
          samples: ["3", 0],
          vae: ["4", 2],
        },
      },
      "9": {
        class_type: "SaveImage",
        inputs: {
          filename_prefix: "ComfyUI",
          images: ["8", 0],
        },
      },
    };
  }

  /**
   * Build image-to-video workflow (AnimateDiff style)
   */
  private buildImageToVideoWorkflow(request: VideoGenerationRequest & { sourceImage: string }): ComfyWorkflow {
    return {
      "1": {
        class_type: "LoadImage",
        inputs: {
          image: request.sourceImage,
        },
      },
      "2": {
        class_type: "CheckpointLoaderSimple",
        inputs: {
          ckpt_name: "v1-5-pruned-emaonly.ckpt",
        },
      },
      "3": {
        class_type: "ADE_AnimateDiffLoaderWithContext",
        inputs: {
          model_name: "mm_sd_v15_v2.ckpt",
          beta_schedule: "sqrt_linear (AnimateDiff)",
          motion_scale: request.motionStrength ?? 1.0,
          apply_v2_models_properly: true,
          model: ["2", 0],
          context_options: ["4", 0],
        },
      },
      "4": {
        class_type: "ADE_StandardUniformContextOptions",
        inputs: {
          context_length: 16,
          context_stride: 1,
          context_overlap: 4,
          closed_loop: false,
          fuse_method: "flat",
          use_on_equal_length: false,
        },
      },
      "5": {
        class_type: "VAEEncode",
        inputs: {
          pixels: ["1", 0],
          vae: ["2", 2],
        },
      },
      "6": {
        class_type: "CLIPTextEncode",
        inputs: {
          text: request.prompt ?? "high quality, smooth motion",
          clip: ["2", 1],
        },
      },
      "7": {
        class_type: "CLIPTextEncode",
        inputs: {
          text: "low quality, blurry, distorted",
          clip: ["2", 1],
        },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          seed: Math.floor(Math.random() * 1000000000),
          steps: 20,
          cfg: 7,
          sampler_name: "euler",
          scheduler: "normal",
          denoise: 0.8,
          model: ["3", 0],
          positive: ["6", 0],
          negative: ["7", 0],
          latent_image: ["5", 0],
        },
      },
      "9": {
        class_type: "VAEDecode",
        inputs: {
          samples: ["8", 0],
          vae: ["2", 2],
        },
      },
      video_output: {
        class_type: "VHS_VideoCombine",
        inputs: {
          frame_rate: request.fps ?? 8,
          loop_count: 0,
          filename_prefix: "AnimateDiff",
          format: "video/h264-mp4",
          pingpong: false,
          save_output: true,
          images: ["9", 0],
        },
      },
    };
  }

  /**
   * Wait for completion via WebSocket
   */
  private waitForCompletionWs(promptId: string, wsUrl: string, timeoutMs?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("Timeout waiting for completion"));
      }, timeoutMs || this.config.timeout);

      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === "executed" && message.data.prompt_id === promptId) {
            clearTimeout(timeout);
            ws.close();
            resolve();
          } else if (message.type === "executing" && message.data.prompt_id === promptId && message.data.node === null) {
            clearTimeout(timeout);
            ws.close();
            resolve();
          } else if (message.type === "execution_error" && message.data.prompt_id === promptId) {
            clearTimeout(timeout);
            ws.close();
            reject(new Error("Execution error: " + JSON.stringify(message.data)));
          }
        } catch {
          // Ignore parse errors
        }
      });

      ws.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Poll for completion
   */
  private async pollForCompletion(promptId: string): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 1000;

    while (Date.now() - startTime < this.config.timeout!) {
      const history = await this.getHistory(promptId);
      if (history[promptId]?.status?.completed) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error("Timeout waiting for completion");
  }

  /**
   * Find the output node in a workflow
   */
  private findOutputNode(workflow: ComfyWorkflow): string {
    for (const [nodeId, node] of Object.entries(workflow)) {
      if (node.class_type === "SaveImage" || node.class_type === "VHS_VideoCombine") {
        return nodeId;
      }
    }
    return Object.keys(workflow).pop() || "9";
  }

  /**
   * Download file from GCS
   */
  private async downloadFromGCS(gcsUri: string): Promise<string> {
    const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!match) throw new Error("Invalid GCS URI: " + gcsUri);

    const [, bucket, filePath] = match;
    const ext = path.extname(filePath) || ".png";
    const localPath = "/tmp/comfyui-input-" + Date.now() + ext;

    await storage.bucket(bucket).file(filePath).download({ destination: localPath });
    return localPath;
  }

  /**
   * Download file from URL
   */
  private async downloadFromURL(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to download: " + url);

    const ext = path.extname(new URL(url).pathname) || ".png";
    const localPath = "/tmp/comfyui-input-" + Date.now() + ext;

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(localPath, buffer);
    return localPath;
  }

  /**
   * Load workflow template (legacy)
   */
  private async loadWorkflow(name: string): Promise<ComfyWorkflow> {
    // Check for built-in workflows
    if (name === "text-to-image") {
      return this.buildTextToImageWorkflow({ prompt: "" });
    }
    if (name === "image-to-image") {
      return this.buildImageToImageWorkflow({ prompt: "", sourceImage: "" });
    }
    // Return empty workflow for unknown templates
    return {};
  }

  /**
   * Inject inputs into workflow (legacy)
   */
  private injectInputs(workflow: ComfyWorkflow, inputs: Record<string, any>): ComfyWorkflow {
    const prompt = JSON.parse(JSON.stringify(workflow));

    for (const [nodeId, node] of Object.entries(prompt) as [string, WorkflowNode][]) {
      if (node.class_type === "LoadVideo" && inputs.sourceVideo) {
        node.inputs.video = inputs.sourceVideo;
      }
      if (node.class_type === "TrimVideo") {
        if (inputs.start !== undefined) node.inputs.start_frame = inputs.start * 30;
        if (inputs.end !== undefined) node.inputs.end_frame = inputs.end * 30;
      }
      if (node.class_type === "CLIPTextEncode" && inputs.prompt) {
        node.inputs.text = inputs.prompt;
      }
      if (node.class_type === "KSampler") {
        if (inputs.seed !== undefined) node.inputs.seed = inputs.seed;
        if (inputs.steps !== undefined) node.inputs.steps = inputs.steps;
        if (inputs.cfg !== undefined) node.inputs.cfg = inputs.cfg;
      }
    }

    return prompt;
  }

  /**
   * Get available models
   */
  async getModels(): Promise<string[]> {
    const response = await fetch(this.config.baseUrl + "/object_info/CheckpointLoaderSimple");
    if (!response.ok) return [];

    const info = await response.json() as any;
    return info?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
  }

  /**
   * Get system stats
   */
  async getSystemStats(): Promise<{ queue: { running: number; pending: number } }> {
    const response = await fetch(this.config.baseUrl + "/queue");
    if (!response.ok) throw new Error("Failed to get queue status");

    const queue = await response.json() as any;
    return {
      queue: {
        running: queue.queue_running?.length || 0,
        pending: queue.queue_pending?.length || 0,
      },
    };
  }

  /**
   * Interrupt current execution
   */
  async interrupt(): Promise<void> {
    await fetch(this.config.baseUrl + "/interrupt", { method: "POST" });
  }

  /**
   * Clear queue
   */
  async clearQueue(): Promise<void> {
    await fetch(this.config.baseUrl + "/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear: true }),
    });
  }
}

let clientInstance: ComfyUIClient | null = null;

export function getComfyUIClient(config?: Partial<ComfyUIConfig>): ComfyUIClient {
  if (!clientInstance) {
    clientInstance = new ComfyUIClient(config);
  }
  return clientInstance;
}
