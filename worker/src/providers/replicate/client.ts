/**
 * Replicate Client - Image Generation (Flux 1.1 Pro)
 * https://replicate.com/docs
 *
 * 画像生成AIの完全実装
 */

import {
  ImageGenerationProvider,
  ImageGenerationRequest,
  ImageGenerationResult,
} from "../types";

interface ReplicateConfig {
  apiToken: string;
  fluxModel: string;
}

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[];
  error?: string;
  logs?: string;
  metrics?: {
    predict_time?: number;
  };
}

export class ReplicateClient implements ImageGenerationProvider {
  name = "replicate";
  private config: ReplicateConfig;
  private baseUrl = "https://api.replicate.com/v1";

  // Model versions
  private models = {
    "flux-1.1-pro": "black-forest-labs/flux-1.1-pro",
    "flux-schnell": "black-forest-labs/flux-schnell",
    "flux-dev": "black-forest-labs/flux-dev",
    "sdxl": "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
  };

  constructor(config: ReplicateConfig) {
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiToken) {
      return false;
    }
    try {
      const response = await fetch(`${this.baseUrl}/account`, {
        headers: { Authorization: `Bearer ${this.config.apiToken}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiToken}`,
    };
  }

  /**
   * Generate image with Flux
   */
  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const modelId = this.config.fluxModel || this.models["flux-1.1-pro"];

    console.log(`[Replicate] Generating image with ${modelId}...`);

    // Start prediction
    const response = await fetch(`${this.baseUrl}/models/${modelId}/predictions`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        input: {
          prompt: request.prompt,
          width: request.width || 1024,
          height: request.height || 1024,
          num_outputs: 1,
          output_format: "webp",
          output_quality: 90,
          ...(request.negativePrompt && { negative_prompt: request.negativePrompt }),
          ...(request.referenceImage && { image: request.referenceImage }),
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Replicate API error: ${JSON.stringify(error)}`);
    }

    const prediction = await response.json() as { id: string };
    console.log(`[Replicate] Prediction started: ${prediction.id}`);

    // Poll for completion
    const result = await this.waitForCompletion(prediction.id);

    const imageUrl = Array.isArray(result.output) ? result.output[0] : result.output;

    return {
      imageUrl: imageUrl || "",
      width: request.width || 1024,
      height: request.height || 1024,
    };
  }

  /**
   * Generate image with specific model
   */
  async generateWithModel(
    modelKey: keyof typeof this.models,
    request: ImageGenerationRequest
  ): Promise<ImageGenerationResult> {
    const originalModel = this.config.fluxModel;
    this.config.fluxModel = this.models[modelKey];

    try {
      return await this.generate(request);
    } finally {
      this.config.fluxModel = originalModel;
    }
  }

  /**
   * Generate multiple images
   */
  async generateBatch(
    prompts: string[],
    options?: {
      width?: number;
      height?: number;
    }
  ): Promise<ImageGenerationResult[]> {
    const results: ImageGenerationResult[] = [];

    // Run in parallel with concurrency limit
    const concurrency = 3;
    for (let i = 0; i < prompts.length; i += concurrency) {
      const batch = prompts.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((prompt) =>
          this.generate({
            prompt,
            width: options?.width,
            height: options?.height,
          })
        )
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Image-to-image transformation
   */
  async transform(
    imageUrl: string,
    prompt: string,
    options?: {
      strength?: number; // 0-1, how much to change
      width?: number;
      height?: number;
    }
  ): Promise<ImageGenerationResult> {
    const modelId = this.models["flux-dev"]; // Dev model supports img2img better

    const response = await fetch(`${this.baseUrl}/models/${modelId}/predictions`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        input: {
          image: imageUrl,
          prompt,
          strength: options?.strength || 0.75,
          width: options?.width || 1024,
          height: options?.height || 1024,
          num_outputs: 1,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Replicate transform error: ${JSON.stringify(error)}`);
    }

    const prediction = await response.json() as { id: string };
    const result = await this.waitForCompletion(prediction.id);

    const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;

    return {
      imageUrl: outputUrl || "",
      width: options?.width || 1024,
      height: options?.height || 1024,
    };
  }

  /**
   * Upscale image
   */
  async upscale(
    imageUrl: string,
    scale: 2 | 4 = 2
  ): Promise<ImageGenerationResult> {
    const upscaleModel = "nightmareai/real-esrgan:f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa";

    const response = await fetch(`${this.baseUrl}/predictions`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        version: upscaleModel.split(":")[1],
        input: {
          image: imageUrl,
          scale,
          face_enhance: true,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Replicate upscale error: ${JSON.stringify(error)}`);
    }

    const prediction = await response.json() as { id: string };
    const result = await this.waitForCompletion(prediction.id);

    return {
      imageUrl: (result.output as string) || "",
      width: 0, // Unknown until downloaded
      height: 0,
    };
  }

  /**
   * Remove background from image
   */
  async removeBackground(imageUrl: string): Promise<ImageGenerationResult> {
    const bgRemovalModel = "cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003";

    const response = await fetch(`${this.baseUrl}/predictions`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        version: bgRemovalModel.split(":")[1],
        input: {
          image: imageUrl,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Replicate bg removal error: ${JSON.stringify(error)}`);
    }

    const prediction = await response.json() as { id: string };
    const result = await this.waitForCompletion(prediction.id);

    return {
      imageUrl: (result.output as string) || "",
      width: 0,
      height: 0,
    };
  }

  /**
   * Wait for prediction to complete
   */
  private async waitForCompletion(
    predictionId: string,
    maxWaitMs = 120000
  ): Promise<ReplicatePrediction> {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < maxWaitMs) {
      const response = await fetch(
        `${this.baseUrl}/predictions/${predictionId}`,
        {
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get prediction status`);
      }

      const result = await response.json() as ReplicatePrediction;

      if (result.status === "succeeded") {
        console.log(`[Replicate] Prediction completed in ${result.metrics?.predict_time}s`);
        return result;
      }

      if (result.status === "failed" || result.status === "canceled") {
        throw new Error(`Prediction failed: ${result.error}`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error("Prediction timeout");
  }

  /**
   * Cancel a running prediction
   */
  async cancel(predictionId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/predictions/${predictionId}/cancel`,
      {
        method: "POST",
        headers: this.getHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to cancel prediction: ${response.statusText}`);
    }

    console.log(`[Replicate] Prediction ${predictionId} cancelled`);
  }
}

/**
 * Style presets for image generation
 */
export const ImageStylePresets = {
  photorealistic: "photorealistic, 8k, high detail, professional photography",
  anime: "anime style, vibrant colors, detailed illustration",
  cinematic: "cinematic lighting, dramatic, movie still, 35mm film",
  minimalist: "minimalist, clean, simple, modern design",
  vintage: "vintage, retro, film grain, nostalgic",
  neon: "neon lights, cyberpunk, glowing, futuristic",
  watercolor: "watercolor painting, soft edges, artistic",
  oil_painting: "oil painting, brushstrokes, classical art style",
};
