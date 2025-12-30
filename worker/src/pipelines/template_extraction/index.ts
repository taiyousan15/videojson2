/**
 * Template Extraction Pipeline - 動画テンプレート抽出
 *
 * 動画解析結果からテンプレートを生成し、再利用可能な構造に変換
 */

import {
  VideoTemplate,
  TemplateStructure,
  TemplateSection,
  TemplatePlaceholder,
  TemplateStyle,
  TemplateTiming,
  VideoAnalysisResult,
  SceneInfo,
  OnScreenText,
  TranscriptSegment,
} from "../../providers/types";
import { getProviders } from "../../providers";
import { v4 as uuidv4 } from "uuid";

export interface TemplateExtractionOptions {
  // Template name
  name?: string;

  // What to make replaceable
  replaceables?: {
    narration?: boolean;
    onScreenText?: boolean;
    images?: boolean;
    backgroundMusic?: boolean;
  };

  // Section detection sensitivity
  sectionMinDuration?: number; // seconds

  // Style extraction depth
  styleDepth?: "basic" | "detailed";
}

export class TemplateExtractor {
  /**
   * Extract template from video analysis result
   */
  async extract(
    analysisResult: VideoAnalysisResult,
    options: TemplateExtractionOptions = {}
  ): Promise<VideoTemplate> {
    const templateId = uuidv4();
    const name = options.name || `Template from ${analysisResult.videoId}`;

    console.log("[TemplateExtractor] Extracting template...");

    // Step 1: Build structure from scenes
    const structure = this.buildStructure(analysisResult, options);
    console.log(`[TemplateExtractor] Found ${structure.sections.length} sections`);

    // Step 2: Identify placeholders (replaceable elements)
    const placeholders = this.identifyPlaceholders(analysisResult, structure, options);
    console.log(`[TemplateExtractor] Found ${placeholders.length} placeholders`);

    // Step 3: Extract style information
    const style = this.extractStyle(analysisResult, options);

    // Step 4: Extract timing information
    const timing = this.extractTiming(analysisResult, structure);

    // Step 5: Use LLM to enhance template if available
    let enhancedTemplate: VideoTemplate = {
      id: templateId,
      name,
      sourceVideoId: analysisResult.videoId,
      version: "1.0.0",
      createdAt: new Date().toISOString(),
      structure,
      placeholders,
      style,
      timing,
    };

    try {
      enhancedTemplate = await this.enhanceWithLLM(enhancedTemplate, analysisResult);
    } catch (error) {
      console.warn("[TemplateExtractor] LLM enhancement failed, using basic template");
    }

    return enhancedTemplate;
  }

  /**
   * Build structure from scenes
   */
  private buildStructure(
    analysis: VideoAnalysisResult,
    options: TemplateExtractionOptions
  ): TemplateStructure {
    const minDuration = options.sectionMinDuration || 3;
    const scenes = analysis.scenes;

    // Classify scenes into section types
    const sections: TemplateSection[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];

      // Skip very short scenes
      if (scene.duration < minDuration) continue;

      // Determine section type based on position and content
      let type: TemplateSection["type"] = "content";

      if (i === 0 && scene.startTime < 5) {
        type = "intro";
      } else if (i === scenes.length - 1 && scene.endTime >= analysis.duration - 10) {
        type = "outro";
      } else if (scene.duration < 3) {
        type = "transition";
      }

      // Check for keywords in description
      const descLower = (scene.description || "").toLowerCase();
      if (descLower.includes("intro") || descLower.includes("opening") || descLower.includes("logo")) {
        type = "intro";
      } else if (descLower.includes("outro") || descLower.includes("ending") || descLower.includes("subscribe")) {
        type = "outro";
      } else if (descLower.includes("transition") || descLower.includes("fade") || descLower.includes("cut")) {
        type = "transition";
      }

      sections.push({
        id: `section-${i}`,
        name: this.generateSectionName(scene, type, i),
        type,
        startTime: scene.startTime,
        endTime: scene.endTime,
        isReplaceable: type === "content",
        description: scene.description || "",
      });
    }

    // Ensure we have at least one section
    if (sections.length === 0) {
      sections.push({
        id: "section-0",
        name: "Main Content",
        type: "content",
        startTime: 0,
        endTime: analysis.duration,
        isReplaceable: true,
        description: analysis.summary || "Main video content",
      });
    }

    return {
      totalDuration: analysis.duration,
      sections,
    };
  }

  /**
   * Identify placeholders (replaceable elements)
   */
  private identifyPlaceholders(
    analysis: VideoAnalysisResult,
    structure: TemplateStructure,
    options: TemplateExtractionOptions
  ): TemplatePlaceholder[] {
    const placeholders: TemplatePlaceholder[] = [];
    const replaceables = {
      narration: true,
      onScreenText: true,
      images: true,
      backgroundMusic: true,
      ...options.replaceables,
    };

    // Add narration placeholders from transcript
    if (replaceables.narration && analysis.transcript.length > 0) {
      // Group transcript segments by section
      for (const section of structure.sections) {
        if (!section.isReplaceable) continue;

        const sectionTranscript = analysis.transcript.filter(
          (t) => t.startTime >= section.startTime && t.endTime <= section.endTime
        );

        if (sectionTranscript.length > 0) {
          placeholders.push({
            id: `narration-${section.id}`,
            type: "narration",
            name: `Narration for ${section.name}`,
            description: `Spoken content during ${section.name}`,
            startTime: sectionTranscript[0].startTime,
            endTime: sectionTranscript[sectionTranscript.length - 1].endTime,
            defaultValue: sectionTranscript.map((t) => t.text).join(" "),
            constraints: {
              minLength: 10,
              maxLength: 500,
            },
          });
        }
      }
    }

    // Add on-screen text placeholders
    if (replaceables.onScreenText && analysis.onScreenTexts.length > 0) {
      for (let i = 0; i < analysis.onScreenTexts.length; i++) {
        const text = analysis.onScreenTexts[i];

        // Skip watermarks and very short text
        if (text.type === "watermark" || text.text.length < 3) continue;

        placeholders.push({
          id: `text-${i}`,
          type: "text",
          name: `On-screen text ${i + 1}`,
          description: `${text.type} text appearing at ${text.startTime}s`,
          startTime: text.startTime,
          endTime: text.endTime,
          position: text.boundingBox,
          defaultValue: text.text,
          constraints: {
            maxLength: 100,
          },
        });
      }
    }

    // Add section-based image/video placeholders for content sections
    if (replaceables.images) {
      for (const section of structure.sections) {
        if (section.type === "content" && section.isReplaceable) {
          // Add visual placeholder for each content section
          placeholders.push({
            id: `visual-${section.id}`,
            type: "video",
            name: `Visual for ${section.name}`,
            description: `Main visual content for this section`,
            startTime: section.startTime,
            endTime: section.endTime,
            constraints: {
              duration: { min: 1, max: section.endTime - section.startTime },
              aspectRatio: `${analysis.resolution.width}:${analysis.resolution.height}`,
            },
          });
        }
      }
    }

    // Add background music placeholder
    if (replaceables.backgroundMusic) {
      placeholders.push({
        id: "bgm-main",
        type: "audio",
        name: "Background Music",
        description: "Main background music track",
        startTime: 0,
        endTime: analysis.duration,
        constraints: {
          duration: { min: analysis.duration * 0.8, max: analysis.duration * 1.2 },
        },
      });
    }

    return placeholders;
  }

  /**
   * Extract style information
   */
  private extractStyle(
    analysis: VideoAnalysisResult,
    options: TemplateExtractionOptions
  ): TemplateStyle {
    const style: TemplateStyle = {
      fonts: [],
      colors: [],
      transitions: [],
      effects: [],
    };

    // Extract font information from on-screen text
    // (In a real implementation, this would analyze frame images)
    const textTypes = new Set(analysis.onScreenTexts.map((t) => t.type));
    for (const type of textTypes) {
      style.fonts.push({
        name: "default",
        usage: type,
      });
    }

    // Extract transition information from scenes
    for (let i = 1; i < analysis.scenes.length; i++) {
      const prev = analysis.scenes[i - 1];
      const curr = analysis.scenes[i];
      const gap = curr.startTime - prev.endTime;

      if (gap > 0 && gap < 2) {
        style.transitions.push({
          type: gap < 0.5 ? "cut" : "fade",
          duration: gap,
          timing: prev.endTime,
        });
      }
    }

    // Extract effects mentioned in descriptions
    const effectKeywords = [
      "zoom", "pan", "slide", "fade", "blur", "glow",
      "shake", "rotate", "scale", "bounce",
    ];

    for (const scene of analysis.scenes) {
      const descLower = scene.description.toLowerCase();
      for (const effect of effectKeywords) {
        if (descLower.includes(effect) && !style.effects.includes(effect)) {
          style.effects.push(effect);
        }
      }
    }

    return style;
  }

  /**
   * Extract timing information
   */
  private extractTiming(
    analysis: VideoAnalysisResult,
    structure: TemplateStructure
  ): TemplateTiming {
    const cuePoints: TemplateTiming["cuePoints"] = [];

    // Add section start cue points
    for (const section of structure.sections) {
      cuePoints.push({
        time: section.startTime,
        type: "section_start",
        description: `Start of ${section.name}`,
      });
    }

    // Add event-based cue points
    for (const event of analysis.events) {
      cuePoints.push({
        time: event.startTime,
        type: event.type,
        description: event.description,
      });
    }

    // Sort by time
    cuePoints.sort((a, b) => a.time - b.time);

    return {
      cuePoints,
    };
  }

  /**
   * Enhance template using LLM
   */
  private async enhanceWithLLM(
    template: VideoTemplate,
    analysis: VideoAnalysisResult
  ): Promise<VideoTemplate> {
    const providers = getProviders();
    const available = providers.getAvailable();

    if (!available.includes("anthropic") && !available.includes("openai")) {
      return template;
    }

    console.log("[TemplateExtractor] Enhancing template with LLM...");

    const llm = available.includes("anthropic")
      ? providers.getAnthropic()
      : providers.getOpenAI();

    const prompt = `Analyze this video template and enhance it:

Current Template:
${JSON.stringify(template, null, 2)}

Video Analysis Summary:
- Summary: ${analysis.summary}
- Duration: ${analysis.duration}s
- Scenes: ${analysis.scenes.length}
- Has narration: ${analysis.transcript.length > 0}

Please:
1. Improve section names to be more descriptive
2. Add missing placeholder descriptions
3. Suggest additional replaceable elements
4. Identify any patterns in timing or structure

Return the enhanced template as JSON.`;

    try {
      const response = await llm.chatStructured<VideoTemplate>(
        [{ role: "user", content: prompt }],
        {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            structure: { type: "object" },
            placeholders: { type: "array" },
            style: { type: "object" },
            timing: { type: "object" },
          },
        }
      );

      // Merge enhancements with original
      return {
        ...template,
        ...response.data,
        id: template.id, // Keep original ID
        sourceVideoId: template.sourceVideoId,
        createdAt: template.createdAt,
      };
    } catch (error) {
      console.warn("[TemplateExtractor] LLM enhancement failed:", error);
      return template;
    }
  }

  /**
   * Generate section name from scene info
   */
  private generateSectionName(
    scene: SceneInfo,
    type: TemplateSection["type"],
    index: number
  ): string {
    if (type === "intro") return "Introduction";
    if (type === "outro") return "Conclusion";
    if (type === "transition") return `Transition ${index}`;

    // Try to extract meaningful name from description
    const desc = scene.description;
    if (desc.length < 30) {
      return desc;
    }

    // Take first sentence or first 30 chars
    const firstSentence = desc.split(/[.!?]/)[0];
    if (firstSentence.length < 50) {
      return firstSentence;
    }

    return `Content Section ${index + 1}`;
  }
}

/**
 * Apply template to generate new video parameters
 */
export interface TemplateApplication {
  templateId: string;
  replacements: Record<string, string | { url: string; type: string }>;
}

export async function applyTemplate(
  template: VideoTemplate,
  application: TemplateApplication
): Promise<{
  script: Array<{
    startTime: number;
    endTime: number;
    type: string;
    content: string | { url: string };
  }>;
  renderParams: object;
}> {
  const script: Array<{
    startTime: number;
    endTime: number;
    type: string;
    content: string | { url: string };
  }> = [];

  // Apply replacements to placeholders
  for (const placeholder of template.placeholders) {
    const replacement = application.replacements[placeholder.id];

    if (replacement) {
      script.push({
        startTime: placeholder.startTime,
        endTime: placeholder.endTime,
        type: placeholder.type,
        content: typeof replacement === "string" ? replacement : replacement,
      });
    } else if (placeholder.defaultValue) {
      script.push({
        startTime: placeholder.startTime,
        endTime: placeholder.endTime,
        type: placeholder.type,
        content: placeholder.defaultValue,
      });
    }
  }

  // Sort by start time
  script.sort((a, b) => a.startTime - b.startTime);

  return {
    script,
    renderParams: {
      template: template.id,
      duration: template.structure.totalDuration,
      style: template.style,
      timing: template.timing,
    },
  };
}

// Export singleton
let extractorInstance: TemplateExtractor | null = null;

export function getTemplateExtractor(): TemplateExtractor {
  if (!extractorInstance) {
    extractorInstance = new TemplateExtractor();
  }
  return extractorInstance;
}
