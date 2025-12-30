/**
 * Runway Client - Video Generation (Gen-3 Alpha Turbo)
 * https://docs.runwayml.com/
 *
 * 動画生成AIの完全実装
 */

import {
  VideoGenerationProvider,
  VideoGenerationRequest,
  VideoGenerationResult,
} from "../types";

interface RunwayConfig {
  apiKey: string;
}

interface RunwayGenerationParams {
  // Gen-3 Alpha specific params
  model: "gen3a_turbo" | "gen3a";
  prompt: string;
  duration: 5 | 10; // seconds
  ratio: "16:9" | "9:16" | "1:1";

  // Optional controls
  seed?: number;
  watermark?: boolean;

  // Image-to-video
  image?: string; // base64 or URL

  // Video-to-video (extend)
  video?: string;
  extendMode?: "start" | "end";
}

interface RunwayTask {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  progress?: number;
  output?: {
    url: string;
  }[];
  failure?: string;
  createdAt: string;
}

export class RunwayClient implements VideoGenerationProvider {
  name = "runway";
  private config: RunwayConfig;
  private baseUrl = "https://api.runwayml.com/v1";

  constructor(config: RunwayConfig) {
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) {
      return false;
    }
    try {
      // Check API key validity
      const response = await fetch(`${this.baseUrl}/tasks`, {
        method: "GET",
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
      "X-Runway-Version": "2024-11-06",
    };
  }

  /**
   * Generate video from text prompt
   */
  async generate(request: VideoGenerationRequest): Promise<VideoGenerationResult> {
    const params: RunwayGenerationParams = {
      model: "gen3a_turbo",
      prompt: request.prompt,
      duration: request.duration === 10 ? 10 : 5,
      ratio: this.mapAspectRatio(request.aspectRatio),
      watermark: false,
    };

    // Add reference image if provided
    if (request.referenceImage) {
      params.image = request.referenceImage;
    }

    console.log("[Runway] Creating generation task...");

    const response = await fetch(`${this.baseUrl}/image_to_video`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: params.model,
        promptImage: params.image,
        promptText: params.prompt,
        duration: params.duration,
        ratio: params.ratio,
        watermark: params.watermark,
        seed: params.seed,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Runway API error: ${JSON.stringify(error)}`);
    }

    const result = await response.json() as any;
    console.log(`[Runway] Task created: ${result.id}`);

    return {
      videoUrl: "",
      duration: params.duration,
      taskId: result.id,
      status: "pending",
    };
  }

  /**
   * Generate video from text only (no reference image)
   */
  async generateFromText(
    prompt: string,
    options?: {
      duration?: 5 | 10;
      aspectRatio?: "16:9" | "9:16" | "1:1";
      seed?: number;
    }
  ): Promise<VideoGenerationResult> {
    const response = await fetch(`${this.baseUrl}/text_to_video`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: "gen3a_turbo",
        promptText: prompt,
        duration: options?.duration || 5,
        ratio: options?.aspectRatio || "16:9",
        watermark: false,
        seed: options?.seed,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Runway text-to-video error: ${JSON.stringify(error)}`);
    }

    const result = await response.json() as any;

    return {
      videoUrl: "",
      duration: options?.duration || 5,
      taskId: result.id,
      status: "pending",
    };
  }

  /**
   * Extend existing video
   */
  async extendVideo(
    videoUrl: string,
    prompt: string,
    mode: "start" | "end" = "end"
  ): Promise<VideoGenerationResult> {
    const response = await fetch(`${this.baseUrl}/video_to_video`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: "gen3a_turbo",
        promptVideo: videoUrl,
        promptText: prompt,
        mode: mode === "start" ? "prepend" : "append",
        duration: 5,
        watermark: false,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Runway extend error: ${JSON.stringify(error)}`);
    }

    const result = await response.json() as any;

    return {
      videoUrl: "",
      duration: 5,
      taskId: result.id,
      status: "pending",
    };
  }

  /**
   * Get task status and result
   */
  async getStatus(taskId: string): Promise<VideoGenerationResult> {
    const response = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get task status: ${response.statusText}`);
    }

    const task = await response.json() as RunwayTask;

    return {
      videoUrl: task.output?.[0]?.url || "",
      duration: 5, // Task doesn't return duration
      taskId: task.id,
      status: this.mapStatus(task.status),
    };
  }

  /**
   * Wait for task to complete
   */
  async waitForCompletion(
    taskId: string,
    options?: {
      maxWaitMs?: number;
      pollIntervalMs?: number;
      onProgress?: (progress: number) => void;
    }
  ): Promise<VideoGenerationResult> {
    const maxWait = options?.maxWaitMs || 300000; // 5 minutes
    const pollInterval = options?.pollIntervalMs || 5000; // 5 seconds
    const startTime = Date.now();

    console.log(`[Runway] Waiting for task ${taskId}...`);

    while (Date.now() - startTime < maxWait) {
      const result = await this.getStatus(taskId);

      if (result.status === "completed") {
        console.log(`[Runway] Task completed: ${result.videoUrl}`);
        return result;
      }

      if (result.status === "failed") {
        throw new Error(`Runway generation failed for task ${taskId}`);
      }

      // Report progress if callback provided
      const elapsed = Date.now() - startTime;
      const progress = Math.min(95, (elapsed / maxWait) * 100);
      options?.onProgress?.(progress);

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Runway generation timeout for task ${taskId}`);
  }

  /**
   * Cancel a running task
   */
  async cancelTask(taskId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/tasks/${taskId}/cancel`, {
      method: "POST",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to cancel task: ${response.statusText}`);
    }

    console.log(`[Runway] Task ${taskId} cancelled`);
  }

  /**
   * Generate multiple clips and concatenate
   */
  async generateSequence(
    clips: Array<{
      prompt: string;
      duration: 5 | 10;
      referenceImage?: string;
    }>
  ): Promise<string[]> {
    const results: string[] = [];

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      console.log(`[Runway] Generating clip ${i + 1}/${clips.length}`);

      const task = await this.generate({
        prompt: clip.prompt,
        duration: clip.duration,
        referenceImage: clip.referenceImage,
      });

      const completed = await this.waitForCompletion(task.taskId);
      results.push(completed.videoUrl);
    }

    return results;
  }

  /**
   * Map aspect ratio string to Runway format
   */
  private mapAspectRatio(
    ratio?: "16:9" | "9:16" | "1:1"
  ): "16:9" | "9:16" | "1:1" {
    return ratio || "16:9";
  }

  /**
   * Map Runway status to our status type
   */
  private mapStatus(
    status: RunwayTask["status"]
  ): VideoGenerationResult["status"] {
    switch (status) {
      case "SUCCEEDED":
        return "completed";
      case "FAILED":
      case "CANCELLED":
        return "failed";
      case "RUNNING":
        return "processing";
      default:
        return "pending";
    }
  }
}

/**
 * Video generation with style transfer
 */
export interface StyleTransferOptions {
  sourceVideo: string;
  stylePrompt: string;
  strength?: number; // 0-1
}

/**
 * Batch video generation
 */
export interface BatchGenerationJob {
  id: string;
  clips: Array<{
    prompt: string;
    taskId?: string;
    status: "pending" | "processing" | "completed" | "failed";
    videoUrl?: string;
  }>;
  createdAt: string;
}
