/**
 * Video Analysis Pipeline - 動画解析統合パイプライン
 *
 * 複数のAIプロバイダーを組み合わせて包括的な動画解析を実行
 */

import {
  VideoAnalysisResult,
  SceneInfo,
  DetectedEntity,
  TranscriptSegment,
  OnScreenText,
  VideoEvent,
} from "../../providers/types";
import { getProviders, ProviderFactory } from "../../providers";

export interface AnalysisPipelineOptions {
  // Which providers to use
  useProviders?: {
    twelvelabs?: boolean;
    gemini?: boolean;
    whisper?: boolean;
  };

  // What to extract
  extract?: {
    scenes?: boolean;
    entities?: boolean;
    transcript?: boolean;
    ocr?: boolean;
    events?: boolean;
  };

  // Language settings
  language?: string;

  // Callbacks for progress
  onProgress?: (stage: string, progress: number) => void;
}

export interface AnalysisPipelineResult extends VideoAnalysisResult {
  // Additional pipeline metadata
  pipeline: {
    providersUsed: string[];
    stages: Array<{
      name: string;
      duration: number;
      success: boolean;
    }>;
    totalDuration: number;
  };
}

export class VideoAnalysisPipeline {
  private providers: ProviderFactory;

  constructor(providers?: ProviderFactory) {
    this.providers = providers || getProviders();
  }

  /**
   * Run full video analysis pipeline
   */
  async analyze(
    videoUrl: string,
    options: AnalysisPipelineOptions = {}
  ): Promise<AnalysisPipelineResult> {
    const startTime = Date.now();
    const stages: AnalysisPipelineResult["pipeline"]["stages"] = [];
    const providersUsed: string[] = [];

    // Default options
    const opts = {
      useProviders: {
        twelvelabs: true,
        gemini: true,
        whisper: true,
        ...options.useProviders,
      },
      extract: {
        scenes: true,
        entities: true,
        transcript: true,
        ocr: true,
        events: true,
        ...options.extract,
      },
      language: options.language || "auto",
    };

    // Check available providers
    const available = this.providers.getAvailable();
    console.log("[Pipeline] Available providers:", available);

    // Initialize result
    let result: VideoAnalysisResult = {
      videoId: "",
      duration: 0,
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      scenes: [],
      chapters: [],
      entities: [],
      events: [],
      transcript: [],
      onScreenTexts: [],
      summary: "",
      tags: [],
      language: opts.language,
    };

    // Stage 1: Primary video analysis (TwelveLabs or Gemini)
    options.onProgress?.("video_analysis", 0);
    const analysisStageStart = Date.now();

    try {
      if (opts.useProviders.twelvelabs && available.includes("twelvelabs")) {
        console.log("[Pipeline] Using TwelveLabs for primary analysis");
        const twelvelabs = this.providers.getTwelveLabs();
        const tlResult = await twelvelabs.analyzeVideo(videoUrl, {
          extractScenes: opts.extract.scenes,
          extractEntities: opts.extract.entities,
          extractTranscript: opts.extract.transcript,
          language: opts.language,
        });
        result = this.mergeResults(result, tlResult);
        providersUsed.push("twelvelabs");
      } else if (opts.useProviders.gemini && available.includes("gemini")) {
        console.log("[Pipeline] Using Gemini for primary analysis");
        const gemini = this.providers.getGemini();
        const geminiResult = await gemini.analyzeVideo(videoUrl, {
          extractScenes: opts.extract.scenes,
          extractEntities: opts.extract.entities,
          extractTranscript: opts.extract.transcript,
          extractOCR: opts.extract.ocr,
          language: opts.language,
        });
        result = this.mergeResults(result, geminiResult);
        providersUsed.push("gemini");
      }

      stages.push({
        name: "video_analysis",
        duration: Date.now() - analysisStageStart,
        success: true,
      });
    } catch (error) {
      console.error("[Pipeline] Primary analysis failed:", error);
      stages.push({
        name: "video_analysis",
        duration: Date.now() - analysisStageStart,
        success: false,
      });
    }

    options.onProgress?.("video_analysis", 100);

    // Stage 2: Audio transcription (Whisper)
    if (opts.extract.transcript && opts.useProviders.whisper && available.includes("openai")) {
      options.onProgress?.("transcription", 0);
      const transcriptStageStart = Date.now();

      try {
        console.log("[Pipeline] Using Whisper for transcription");
        const whisper = this.providers.getWhisper();

        // Extract audio URL (assuming video URL can be used directly or has audio track)
        const segments = await whisper.transcribe(videoUrl, {
          language: opts.language !== "auto" ? opts.language : undefined,
          timestamps: true,
        });

        // Merge transcription if primary analysis didn't provide detailed one
        if (segments.length > result.transcript.length) {
          result.transcript = segments;
        }

        providersUsed.push("whisper");
        stages.push({
          name: "transcription",
          duration: Date.now() - transcriptStageStart,
          success: true,
        });
      } catch (error) {
        console.error("[Pipeline] Transcription failed:", error);
        stages.push({
          name: "transcription",
          duration: Date.now() - transcriptStageStart,
          success: false,
        });
      }

      options.onProgress?.("transcription", 100);
    }

    // Stage 3: Enhanced scene detection using Gemini (if not used as primary)
    if (
      opts.extract.scenes &&
      opts.useProviders.gemini &&
      available.includes("gemini") &&
      !providersUsed.includes("gemini")
    ) {
      options.onProgress?.("scene_detection", 0);
      const sceneStageStart = Date.now();

      try {
        console.log("[Pipeline] Using Gemini for enhanced scene detection");
        const gemini = this.providers.getGemini();
        const geminiResult = await gemini.analyzeVideo(videoUrl, {
          extractScenes: true,
          extractEntities: false,
          extractTranscript: false,
          extractOCR: opts.extract.ocr,
        });

        // Merge scenes if Gemini provides more detail
        if (geminiResult.scenes.length > result.scenes.length) {
          result.scenes = geminiResult.scenes;
        }

        // Always use OCR from Gemini
        if (geminiResult.onScreenTexts.length > 0) {
          result.onScreenTexts = geminiResult.onScreenTexts;
        }

        providersUsed.push("gemini");
        stages.push({
          name: "scene_detection",
          duration: Date.now() - sceneStageStart,
          success: true,
        });
      } catch (error) {
        console.error("[Pipeline] Enhanced scene detection failed:", error);
        stages.push({
          name: "scene_detection",
          duration: Date.now() - sceneStageStart,
          success: false,
        });
      }

      options.onProgress?.("scene_detection", 100);
    }

    // Stage 4: Event extraction and enrichment using Claude
    if (opts.extract.events && available.includes("anthropic")) {
      options.onProgress?.("event_extraction", 0);
      const eventStageStart = Date.now();

      try {
        console.log("[Pipeline] Using Claude for event extraction");
        const claude = this.providers.getAnthropic();

        const eventPrompt = `Based on this video analysis data, identify key events:

Scenes: ${JSON.stringify(result.scenes.slice(0, 10))}
Transcript: ${result.transcript.slice(0, 20).map(t => t.text).join(" ")}
Summary: ${result.summary}

Identify events such as:
- Key moments or turning points
- Important announcements or reveals
- Emotional peaks
- Action sequences
- Transitions between topics

Return JSON: {"events": [{"id": "event-1", "type": "key_moment", "startTime": 0, "endTime": 10, "description": "...", "importance": 0.9}]}`;

        const eventsResult = await claude.chatStructured<{ events: VideoEvent[] }>(
          [{ role: "user", content: eventPrompt }],
          {
            type: "object",
            properties: {
              events: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    type: { type: "string" },
                    startTime: { type: "number" },
                    endTime: { type: "number" },
                    description: { type: "string" },
                    importance: { type: "number" },
                  },
                },
              },
            },
          }
        );

        result.events = [
          ...result.events,
          ...(eventsResult.data.events || []),
        ];

        providersUsed.push("anthropic");
        stages.push({
          name: "event_extraction",
          duration: Date.now() - eventStageStart,
          success: true,
        });
      } catch (error) {
        console.error("[Pipeline] Event extraction failed:", error);
        stages.push({
          name: "event_extraction",
          duration: Date.now() - eventStageStart,
          success: false,
        });
      }

      options.onProgress?.("event_extraction", 100);
    }

    // Stage 5: Generate summary if not available
    if (!result.summary && available.includes("anthropic")) {
      options.onProgress?.("summarization", 0);
      const summaryStageStart = Date.now();

      try {
        const claude = this.providers.getAnthropic();
        const summaryResponse = await claude.chat([
          {
            role: "user",
            content: `Summarize this video based on:
Scenes: ${result.scenes.map(s => s.description).join("; ")}
Transcript: ${result.transcript.slice(0, 30).map(t => t.text).join(" ")}

Provide a 2-3 sentence summary.`,
          },
        ]);
        result.summary = summaryResponse.content;

        stages.push({
          name: "summarization",
          duration: Date.now() - summaryStageStart,
          success: true,
        });
      } catch (error) {
        console.error("[Pipeline] Summarization failed:", error);
        stages.push({
          name: "summarization",
          duration: Date.now() - summaryStageStart,
          success: false,
        });
      }

      options.onProgress?.("summarization", 100);
    }

    // Finalize result
    const totalDuration = Date.now() - startTime;
    console.log(`[Pipeline] Analysis completed in ${totalDuration}ms`);
    console.log(`[Pipeline] Providers used: ${providersUsed.join(", ")}`);

    return {
      ...result,
      pipeline: {
        providersUsed,
        stages,
        totalDuration,
      },
    };
  }

  /**
   * Merge results from multiple providers
   */
  private mergeResults(
    base: VideoAnalysisResult,
    incoming: VideoAnalysisResult
  ): VideoAnalysisResult {
    return {
      videoId: incoming.videoId || base.videoId,
      duration: incoming.duration || base.duration,
      resolution: incoming.resolution || base.resolution,
      fps: incoming.fps || base.fps,

      scenes: incoming.scenes.length > 0 ? incoming.scenes : base.scenes,
      chapters: incoming.chapters.length > 0 ? incoming.chapters : base.chapters,

      entities: this.mergeEntities(base.entities, incoming.entities),
      events: [...base.events, ...incoming.events],
      transcript: incoming.transcript.length > base.transcript.length
        ? incoming.transcript
        : base.transcript,
      onScreenTexts: incoming.onScreenTexts.length > 0
        ? incoming.onScreenTexts
        : base.onScreenTexts,

      summary: incoming.summary || base.summary,
      tags: [...new Set([...base.tags, ...incoming.tags])],
      language: incoming.language || base.language,

      _raw: {
        ...base._raw,
        ...incoming._raw,
      },
    };
  }

  /**
   * Merge entity lists avoiding duplicates
   */
  private mergeEntities(
    base: DetectedEntity[],
    incoming: DetectedEntity[]
  ): DetectedEntity[] {
    const merged = [...base];

    for (const entity of incoming) {
      const existing = merged.find(
        (e) => e.name.toLowerCase() === entity.name.toLowerCase() && e.type === entity.type
      );

      if (existing) {
        // Merge appearances
        existing.appearances = [
          ...existing.appearances,
          ...entity.appearances,
        ].sort((a, b) => a.startTime - b.startTime);
      } else {
        merged.push(entity);
      }
    }

    return merged;
  }
}

// Export singleton
let pipelineInstance: VideoAnalysisPipeline | null = null;

export function getAnalysisPipeline(): VideoAnalysisPipeline {
  if (!pipelineInstance) {
    pipelineInstance = new VideoAnalysisPipeline();
  }
  return pipelineInstance;
}
