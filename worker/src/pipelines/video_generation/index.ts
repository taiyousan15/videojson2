/**
 * Video Generation Pipeline - 動画生成パイプライン
 *
 * テンプレートから新しい動画を生成する統合パイプライン
 */

import { getProviders, ProviderFactory } from "../../providers";
import {
  VideoTemplate,
  TemplatePlaceholder,
  VideoGenerationResult,
  ImageGenerationResult,
  TTSResult,
} from "../../providers/types";
import { Storage } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid";

const storage = new Storage();

/**
 * Video generation request
 */
export interface VideoGenerationRequest {
  templateId: string;
  template: VideoTemplate;
  replacements: Record<string, PlaceholderReplacement>;
  outputOptions?: {
    format?: "mp4" | "webm" | "mov";
    quality?: "draft" | "standard" | "high";
    resolution?: { width: number; height: number };
  };
}

/**
 * Placeholder replacement value
 */
export type PlaceholderReplacement =
  | { type: "text"; value: string }
  | { type: "image"; url?: string; prompt?: string }
  | { type: "video"; url?: string; prompt?: string }
  | { type: "audio"; url?: string }
  | { type: "narration"; text: string; voice?: string };

/**
 * Generated asset
 */
export interface GeneratedAsset {
  placeholderId: string;
  type: string;
  url: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Generation progress callback
 */
export type ProgressCallback = (
  stage: string,
  progress: number,
  message?: string
) => void;

/**
 * Video generation result
 */
export interface VideoGenerationPipelineResult {
  success: boolean;
  videoUrl?: string;
  assets: GeneratedAsset[];
  renderScript: RenderScript;
  errors: string[];
  stats: {
    totalDuration: number;
    assetsGenerated: number;
    clipCount: number;
  };
}

/**
 * Render script for FFmpeg
 */
export interface RenderScript {
  version: string;
  duration: number;
  resolution: { width: number; height: number };
  fps: number;
  tracks: RenderTrack[];
}

export interface RenderTrack {
  type: "video" | "audio" | "text";
  clips: RenderClip[];
}

export interface RenderClip {
  id: string;
  startTime: number;
  endTime: number;
  source: string;
  effects?: string[];
  transitions?: {
    in?: { type: string; duration: number };
    out?: { type: string; duration: number };
  };
}

/**
 * Video Generation Pipeline
 */
export class VideoGenerationPipeline {
  private providers: ProviderFactory;
  private bucket: string;

  constructor(providers?: ProviderFactory, bucket?: string) {
    this.providers = providers || getProviders();
    this.bucket = bucket || process.env.GCS_BUCKET || "videojson-artifacts";
  }

  /**
   * Generate video from template
   */
  async generate(
    request: VideoGenerationRequest,
    onProgress?: ProgressCallback
  ): Promise<VideoGenerationPipelineResult> {
    const startTime = Date.now();
    const assets: GeneratedAsset[] = [];
    const errors: string[] = [];
    const generationId = uuidv4();

    console.log(`[VideoGen] Starting generation ${generationId}`);
    onProgress?.("initializing", 0, "Initializing pipeline...");

    // Step 1: Validate template and replacements
    onProgress?.("validating", 5, "Validating template...");
    const validation = this.validateRequest(request);
    if (!validation.valid) {
      return {
        success: false,
        assets: [],
        renderScript: this.createEmptyRenderScript(),
        errors: validation.errors,
        stats: { totalDuration: 0, assetsGenerated: 0, clipCount: 0 },
      };
    }

    // Step 2: Generate assets for each placeholder
    onProgress?.("generating_assets", 10, "Generating assets...");

    const placeholderCount = request.template.placeholders.length;
    let generatedCount = 0;

    for (const placeholder of request.template.placeholders) {
      const replacement = request.replacements[placeholder.id];

      if (!replacement) {
        // Use default value if available
        if (placeholder.defaultValue) {
          assets.push({
            placeholderId: placeholder.id,
            type: placeholder.type,
            url: placeholder.defaultValue,
          });
        }
        continue;
      }

      try {
        const asset = await this.generateAsset(
          placeholder,
          replacement,
          generationId
        );

        if (asset) {
          assets.push(asset);
        }

        generatedCount++;
        const progress = 10 + (generatedCount / placeholderCount) * 60;
        onProgress?.(
          "generating_assets",
          progress,
          `Generated ${generatedCount}/${placeholderCount} assets`
        );
      } catch (error) {
        console.error(`[VideoGen] Failed to generate asset for ${placeholder.id}:`, error);
        errors.push(`Failed to generate ${placeholder.id}: ${error}`);
      }
    }

    console.log(`[VideoGen] Generated ${assets.length} assets`);

    // Step 3: Generate video clips using Runway
    onProgress?.("generating_clips", 70, "Generating video clips...");

    const videoAssets = assets.filter((a) => a.type === "video" || a.type === "image");
    const clipUrls: string[] = [];

    if (this.providers.isAvailable("runway") && videoAssets.length > 0) {
      try {
        const runway = this.providers.getRunway();

        for (const asset of videoAssets) {
          // Find corresponding section in template
          const placeholder = request.template.placeholders.find(
            (p) => p.id === asset.placeholderId
          );

          if (placeholder && placeholder.type === "video") {
            const replacement = request.replacements[placeholder.id];
            const prompt = replacement?.type === "video" && replacement.prompt
              ? replacement.prompt
              : `Continue the visual style, smooth motion`;

            console.log(`[VideoGen] Generating clip for ${placeholder.id}`);

            const task = await runway.generate({
              prompt,
              referenceImage: asset.url,
              duration: Math.min(10, placeholder.endTime - placeholder.startTime) as 5 | 10,
            });

            const result = await runway.waitForCompletion(task.taskId, {
              onProgress: (p) => {
                onProgress?.("generating_clips", 70 + p * 0.15, `Generating clip...`);
              },
            });

            if (result.videoUrl) {
              clipUrls.push(result.videoUrl);
            }
          }
        }
      } catch (error) {
        console.error("[VideoGen] Runway generation failed:", error);
        errors.push(`Video clip generation failed: ${error}`);
      }
    }

    // Step 4: Build render script
    onProgress?.("building_script", 85, "Building render script...");

    const renderScript = this.buildRenderScript(
      request.template,
      assets,
      clipUrls,
      request.outputOptions
    );

    // Step 5: Upload render script to GCS
    onProgress?.("uploading", 90, "Uploading assets...");

    const scriptPath = `generations/${generationId}/render-script.json`;
    await this.uploadJSON(scriptPath, renderScript);

    // Step 6: Trigger render job (or return script for external rendering)
    onProgress?.("complete", 100, "Generation complete");

    const totalDuration = Date.now() - startTime;
    console.log(`[VideoGen] Generation completed in ${totalDuration}ms`);

    return {
      success: errors.length === 0,
      videoUrl: undefined, // Will be set after render job completes
      assets,
      renderScript,
      errors,
      stats: {
        totalDuration,
        assetsGenerated: assets.length,
        clipCount: clipUrls.length,
      },
    };
  }

  /**
   * Generate a single asset based on placeholder and replacement
   */
  private async generateAsset(
    placeholder: TemplatePlaceholder,
    replacement: PlaceholderReplacement,
    generationId: string
  ): Promise<GeneratedAsset | null> {
    console.log(`[VideoGen] Generating ${placeholder.type} for ${placeholder.id}`);

    switch (replacement.type) {
      case "text":
        return {
          placeholderId: placeholder.id,
          type: "text",
          url: replacement.value,
        };

      case "image":
        if (replacement.url) {
          return {
            placeholderId: placeholder.id,
            type: "image",
            url: replacement.url,
          };
        }
        if (replacement.prompt && this.providers.isAvailable("replicate")) {
          const replicate = this.providers.getReplicate();
          const result = await replicate.generate({
            prompt: replacement.prompt,
            width: 1024,
            height: 1024,
          });
          return {
            placeholderId: placeholder.id,
            type: "image",
            url: result.imageUrl,
          };
        }
        break;

      case "video":
        if (replacement.url) {
          return {
            placeholderId: placeholder.id,
            type: "video",
            url: replacement.url,
          };
        }
        // Video from prompt will be handled in the clip generation step
        if (replacement.prompt) {
          return {
            placeholderId: placeholder.id,
            type: "video",
            url: "", // Will be generated later
            metadata: { prompt: replacement.prompt },
          };
        }
        break;

      case "audio":
        if (replacement.url) {
          return {
            placeholderId: placeholder.id,
            type: "audio",
            url: replacement.url,
          };
        }
        break;

      case "narration":
        if (this.providers.isAvailable("elevenlabs")) {
          const elevenlabs = this.providers.getElevenLabs();
          const result = await elevenlabs.synthesize({
            text: replacement.text,
            voice: replacement.voice,
          });
          return {
            placeholderId: placeholder.id,
            type: "narration",
            url: result.audioUrl,
            duration: result.duration,
          };
        }
        break;
    }

    return null;
  }

  /**
   * Build render script for FFmpeg
   */
  private buildRenderScript(
    template: VideoTemplate,
    assets: GeneratedAsset[],
    clipUrls: string[],
    options?: VideoGenerationRequest["outputOptions"]
  ): RenderScript {
    const resolution = options?.resolution || { width: 1920, height: 1080 };

    const videoTrack: RenderTrack = {
      type: "video",
      clips: [],
    };

    const audioTrack: RenderTrack = {
      type: "audio",
      clips: [],
    };

    const textTrack: RenderTrack = {
      type: "text",
      clips: [],
    };

    // Add clips from template sections
    for (const section of template.structure.sections) {
      // Find asset for this section
      const placeholder = template.placeholders.find(
        (p) => p.startTime >= section.startTime && p.endTime <= section.endTime
      );

      const asset = placeholder
        ? assets.find((a) => a.placeholderId === placeholder.id)
        : null;

      if (asset?.type === "video" && asset.url) {
        videoTrack.clips.push({
          id: `clip-${section.id}`,
          startTime: section.startTime,
          endTime: section.endTime,
          source: asset.url,
          transitions: {
            in: section.startTime === 0 ? undefined : { type: "fade", duration: 0.5 },
            out: section.endTime === template.structure.totalDuration
              ? undefined
              : { type: "fade", duration: 0.5 },
          },
        });
      }

      if (asset?.type === "narration" && asset.url) {
        audioTrack.clips.push({
          id: `audio-${section.id}`,
          startTime: section.startTime,
          endTime: section.endTime,
          source: asset.url,
        });
      }

      if (asset?.type === "text") {
        textTrack.clips.push({
          id: `text-${section.id}`,
          startTime: section.startTime,
          endTime: section.endTime,
          source: asset.url,
          effects: ["lower_third"],
        });
      }
    }

    // Add generated clips
    let clipIndex = 0;
    for (const url of clipUrls) {
      if (!videoTrack.clips.some((c) => c.source === url)) {
        videoTrack.clips.push({
          id: `generated-${clipIndex}`,
          startTime: clipIndex * 5,
          endTime: (clipIndex + 1) * 5,
          source: url,
        });
        clipIndex++;
      }
    }

    return {
      version: "1.0",
      duration: template.structure.totalDuration,
      resolution,
      fps: 30,
      tracks: [videoTrack, audioTrack, textTrack].filter(
        (t) => t.clips.length > 0
      ),
    };
  }

  /**
   * Validate generation request
   */
  private validateRequest(request: VideoGenerationRequest): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!request.template) {
      errors.push("Template is required");
    }

    if (!request.template.structure?.sections?.length) {
      errors.push("Template has no sections");
    }

    // Check if at least some replacements are provided
    const replacementCount = Object.keys(request.replacements || {}).length;
    if (replacementCount === 0 && request.template.placeholders.length > 0) {
      console.warn("[VideoGen] No replacements provided, using defaults");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create empty render script for error cases
   */
  private createEmptyRenderScript(): RenderScript {
    return {
      version: "1.0",
      duration: 0,
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      tracks: [],
    };
  }

  /**
   * Upload JSON to GCS
   */
  private async uploadJSON(path: string, data: object): Promise<string> {
    const file = storage.bucket(this.bucket).file(path);
    await file.save(JSON.stringify(data, null, 2), {
      contentType: "application/json",
    });
    return `gs://${this.bucket}/${path}`;
  }
}

// Export singleton
let pipelineInstance: VideoGenerationPipeline | null = null;

export function getVideoGenerationPipeline(): VideoGenerationPipeline {
  if (!pipelineInstance) {
    pipelineInstance = new VideoGenerationPipeline();
  }
  return pipelineInstance;
}
