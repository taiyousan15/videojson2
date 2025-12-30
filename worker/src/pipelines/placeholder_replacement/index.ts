/**
 * Placeholder Replacement Engine - プレースホルダー置換エンジン
 *
 * テンプレート内のプレースホルダーを新しいコンテンツで置換
 */

import { getProviders, ProviderFactory } from "../../providers";
import { VideoTemplate, TemplatePlaceholder } from "../../providers/types";
import { getQualityControlPipeline, QualityCheckResult } from "../quality_control";

export interface ReplacementValue {
  type: "text" | "image" | "video" | "audio" | "narration";
  value?: string;
  prompt?: string;
  url?: string;
  voice?: string;
  style?: string;
}

export interface ReplacementResult {
  placeholderId: string;
  originalValue?: string;
  newValue: string;
  type: string;
  generatedUrl?: string;
  quality?: QualityCheckResult;
  metadata?: Record<string, unknown>;
}

export interface ReplacementOptions {
  generateImages?: boolean;
  generateNarration?: boolean;
  checkQuality?: boolean;
  stylePrefix?: string;
}

/**
 * Placeholder Replacement Engine
 */
export class PlaceholderReplacementEngine {
  private providers: ProviderFactory;

  constructor(providers?: ProviderFactory) {
    this.providers = providers || getProviders();
  }

  /**
   * Replace all placeholders in a template
   */
  async replaceAll(
    template: VideoTemplate,
    replacements: Record<string, ReplacementValue>,
    options: ReplacementOptions = {}
  ): Promise<ReplacementResult[]> {
    const results: ReplacementResult[] = [];

    console.log("[PlaceholderEngine] Processing " + template.placeholders.length + " placeholders...");

    for (const placeholder of template.placeholders) {
      const replacement = replacements[placeholder.id];

      if (!replacement) {
        if (placeholder.defaultValue) {
          results.push({
            placeholderId: placeholder.id,
            originalValue: placeholder.defaultValue,
            newValue: placeholder.defaultValue,
            type: placeholder.type,
          });
        }
        continue;
      }

      const result = await this.replaceSingle(placeholder, replacement, options);
      results.push(result);
    }

    console.log("[PlaceholderEngine] Completed " + results.length + " replacements");
    return results;
  }

  /**
   * Replace a single placeholder
   */
  async replaceSingle(
    placeholder: TemplatePlaceholder,
    replacement: ReplacementValue,
    options: ReplacementOptions = {}
  ): Promise<ReplacementResult> {
    console.log("[PlaceholderEngine] Replacing " + placeholder.id + " (" + placeholder.type + ")");

    switch (replacement.type) {
      case "text":
        return this.replaceText(placeholder, replacement);

      case "image":
        return this.replaceImage(placeholder, replacement, options);

      case "video":
        return this.replaceVideo(placeholder, replacement, options);

      case "audio":
        return this.replaceAudio(placeholder, replacement);

      case "narration":
        return this.replaceNarration(placeholder, replacement, options);

      default:
        throw new Error("Unknown replacement type: " + replacement.type);
    }
  }

  /**
   * Replace text placeholder
   */
  private async replaceText(
    placeholder: TemplatePlaceholder,
    replacement: ReplacementValue
  ): Promise<ReplacementResult> {
    const newValue = replacement.value || "";

    return {
      placeholderId: placeholder.id,
      originalValue: placeholder.defaultValue,
      newValue,
      type: "text",
      metadata: {
        charCount: newValue.length,
        wordCount: newValue.split(/\s+/).length,
      },
    };
  }

  /**
   * Replace image placeholder
   */
  private async replaceImage(
    placeholder: TemplatePlaceholder,
    replacement: ReplacementValue,
    options: ReplacementOptions
  ): Promise<ReplacementResult> {
    // If URL provided, use it directly
    if (replacement.url) {
      const result: ReplacementResult = {
        placeholderId: placeholder.id,
        originalValue: placeholder.defaultValue,
        newValue: replacement.url,
        type: "image",
        generatedUrl: replacement.url,
      };

      if (options.checkQuality) {
        const qc = getQualityControlPipeline();
        result.quality = await qc.checkImageQuality(replacement.url);
      }

      return result;
    }

    // Generate image from prompt
    if (replacement.prompt && options.generateImages && this.providers.isAvailable("replicate")) {
      const replicate = this.providers.getReplicate();

      const prompt = options.stylePrefix
        ? options.stylePrefix + ", " + replacement.prompt
        : replacement.prompt;

      console.log("[PlaceholderEngine] Generating image: " + prompt.substring(0, 50) + "...");

      const imageResult = await replicate.generate({
        prompt,
        width: 1024,
        height: 1024,
      });

      const result: ReplacementResult = {
        placeholderId: placeholder.id,
        originalValue: placeholder.defaultValue,
        newValue: imageResult.imageUrl,
        type: "image",
        generatedUrl: imageResult.imageUrl,
        metadata: {
          prompt,
          width: imageResult.width,
          height: imageResult.height,
        },
      };

      if (options.checkQuality) {
        const qc = getQualityControlPipeline();
        result.quality = await qc.checkImageQuality(imageResult.imageUrl);
      }

      return result;
    }

    // Fallback to default
    return {
      placeholderId: placeholder.id,
      originalValue: placeholder.defaultValue,
      newValue: placeholder.defaultValue || "",
      type: "image",
    };
  }

  /**
   * Replace video placeholder
   */
  private async replaceVideo(
    placeholder: TemplatePlaceholder,
    replacement: ReplacementValue,
    options: ReplacementOptions
  ): Promise<ReplacementResult> {
    // If URL provided, use it directly
    if (replacement.url) {
      const result: ReplacementResult = {
        placeholderId: placeholder.id,
        originalValue: placeholder.defaultValue,
        newValue: replacement.url,
        type: "video",
        generatedUrl: replacement.url,
      };

      if (options.checkQuality) {
        const qc = getQualityControlPipeline();
        result.quality = await qc.checkVideoQuality(replacement.url);
      }

      return result;
    }

    // Video generation will be handled by the video generation pipeline
    // Here we just store the prompt for later processing
    return {
      placeholderId: placeholder.id,
      originalValue: placeholder.defaultValue,
      newValue: "",
      type: "video",
      metadata: {
        prompt: replacement.prompt,
        pendingGeneration: true,
      },
    };
  }

  /**
   * Replace audio placeholder
   */
  private async replaceAudio(
    placeholder: TemplatePlaceholder,
    replacement: ReplacementValue
  ): Promise<ReplacementResult> {
    if (replacement.url) {
      return {
        placeholderId: placeholder.id,
        originalValue: placeholder.defaultValue,
        newValue: replacement.url,
        type: "audio",
        generatedUrl: replacement.url,
      };
    }

    return {
      placeholderId: placeholder.id,
      originalValue: placeholder.defaultValue,
      newValue: placeholder.defaultValue || "",
      type: "audio",
    };
  }

  /**
   * Replace narration placeholder with TTS
   */
  private async replaceNarration(
    placeholder: TemplatePlaceholder,
    replacement: ReplacementValue,
    options: ReplacementOptions
  ): Promise<ReplacementResult> {
    const text = replacement.value || "";

    if (!text) {
      return {
        placeholderId: placeholder.id,
        originalValue: placeholder.defaultValue,
        newValue: "",
        type: "narration",
      };
    }

    // Generate narration with TTS
    if (options.generateNarration && this.providers.isAvailable("elevenlabs")) {
      const elevenlabs = this.providers.getElevenLabs();

      console.log("[PlaceholderEngine] Generating narration: " + text.substring(0, 30) + "...");

      const ttsResult = await elevenlabs.synthesize({
        text,
        voice: replacement.voice,
      });

      return {
        placeholderId: placeholder.id,
        originalValue: placeholder.defaultValue,
        newValue: text,
        type: "narration",
        generatedUrl: ttsResult.audioUrl,
        metadata: {
          voice: replacement.voice,
          duration: ttsResult.duration,
          format: ttsResult.format,
        },
      };
    }

    return {
      placeholderId: placeholder.id,
      originalValue: placeholder.defaultValue,
      newValue: text,
      type: "narration",
    };
  }

  /**
   * Validate replacements against template
   */
  validateReplacements(
    template: VideoTemplate,
    replacements: Record<string, ReplacementValue>
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const placeholder of template.placeholders) {
      const replacement = replacements[placeholder.id];

      if (!replacement && !placeholder.defaultValue) {
        errors.push("Missing replacement for required placeholder: " + placeholder.id);
        continue;
      }

      if (replacement) {
        // Type compatibility check
        if (placeholder.type === "text" && replacement.type !== "text") {
          warnings.push("Placeholder " + placeholder.id + " expects text but got " + replacement.type);
        }

        if (placeholder.type === "image" && replacement.type !== "image") {
          warnings.push("Placeholder " + placeholder.id + " expects image but got " + replacement.type);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Generate script from template with replacements
   */
  async generateScript(
    template: VideoTemplate,
    replacements: Record<string, ReplacementValue>
  ): Promise<string> {
    let script = "";

    for (const section of template.structure.sections) {
      script += "## " + section.name + "\n";
      script += "[" + section.startTime + "s - " + section.endTime + "s]\n\n";

      // Find placeholders in this section
      const sectionPlaceholders = template.placeholders.filter(
        (p) => p.startTime >= section.startTime && p.endTime <= section.endTime
      );

      for (const placeholder of sectionPlaceholders) {
        const replacement = replacements[placeholder.id];
        const value = replacement?.value || placeholder.defaultValue || "[Empty]";
        script += "- " + placeholder.type.toUpperCase() + ": " + value + "\n";
      }

      script += "\n";
    }

    return script;
  }
}

let instance: PlaceholderReplacementEngine | null = null;

export function getPlaceholderReplacementEngine(): PlaceholderReplacementEngine {
  if (!instance) {
    instance = new PlaceholderReplacementEngine();
  }
  return instance;
}
