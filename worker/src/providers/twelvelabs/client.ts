/**
 * TwelveLabs Client - 動画理解AI (Marengo 2.7)
 * https://docs.twelvelabs.io/reference/api-reference
 */

import {
  VideoAnalysisResult,
  SceneInfo,
  DetectedEntity,
  VideoEvent,
  TranscriptSegment,
  VideoAnalysisOptions,
  VideoAnalysisProvider,
} from "../types";

interface TwelveLabsConfig {
  apiKey: string;
  indexId: string;
  apiUrl: string;
}

interface TwelveLabsTask {
  _id: string;
  status: "pending" | "indexing" | "ready" | "failed";
  video_id?: string;
  metadata?: {
    duration: number;
    width: number;
    height: number;
    fps: number;
  };
}

interface TwelveLabsSearchResult {
  data: Array<{
    id: string;
    start: number;
    end: number;
    confidence: string;
    video_id: string;
    metadata: {
      text?: string;
      type?: string;
    };
    modules: Array<{
      type: string;
      confidence: string;
    }>;
  }>;
}

interface TwelveLabsGenerateResult {
  id: string;
  data: string;
}

export class TwelveLabsClient implements VideoAnalysisProvider {
  name = "twelvelabs";
  private config: TwelveLabsConfig;

  constructor(config: TwelveLabsConfig) {
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey || !this.config.indexId) {
      return false;
    }
    try {
      const response = await this.request("GET", "/indexes");
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Make API request to TwelveLabs
   */
  private async request(
    method: string,
    endpoint: string,
    body?: object,
    isMultipart = false
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "x-api-key": this.config.apiKey,
    };

    if (!isMultipart && body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${this.config.apiUrl}${endpoint}`, {
      method,
      headers,
      body: isMultipart ? (body as any) : body ? JSON.stringify(body) : undefined,
    });

    return response;
  }

  /**
   * Upload video to TwelveLabs for indexing
   */
  async uploadVideo(
    videoUrl: string,
    options?: { language?: string }
  ): Promise<string> {
    // Create a task to upload video via URL
    const response = await this.request("POST", "/tasks", {
      index_id: this.config.indexId,
      url: videoUrl,
      language: options?.language || "auto",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`TwelveLabs upload failed: ${JSON.stringify(error)}`);
    }

    const result = await response.json() as any;
    return result._id;
  }

  /**
   * Wait for video indexing to complete
   */
  async waitForIndexing(
    taskId: string,
    maxWaitMs = 600000,
    pollIntervalMs = 10000
  ): Promise<TwelveLabsTask> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const task = await this.getTaskStatus(taskId);

      if (task.status === "ready") {
        return task;
      }

      if (task.status === "failed") {
        throw new Error("TwelveLabs indexing failed");
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error("TwelveLabs indexing timeout");
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId: string): Promise<TwelveLabsTask> {
    const response = await this.request("GET", `/tasks/${taskId}`);

    if (!response.ok) {
      throw new Error(`Failed to get task status: ${response.statusText}`);
    }

    return response.json() as Promise<TwelveLabsTask>;
  }

  /**
   * Get video information
   */
  async getVideo(videoId: string): Promise<any> {
    const response = await this.request(
      "GET",
      `/indexes/${this.config.indexId}/videos/${videoId}`
    );

    if (!response.ok) {
      throw new Error(`Failed to get video: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Generate text from video (summarization, chapters, etc.)
   */
  async generate(
    videoId: string,
    type: "summary" | "chapter" | "highlight" | "gist",
    prompt?: string
  ): Promise<string> {
    const body: any = {
      video_id: videoId,
      type,
    };

    if (prompt) {
      body.prompt = prompt;
    }

    const response = await this.request("POST", "/generate", body);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`TwelveLabs generate failed: ${JSON.stringify(error)}`);
    }

    const result = await response.json() as TwelveLabsGenerateResult;
    return result.data;
  }

  /**
   * Search within video
   */
  async search(
    query: string,
    options?: {
      videoIds?: string[];
      searchOptions?: ("visual" | "conversation" | "text_in_video" | "logo")[];
      threshold?: string;
    }
  ): Promise<TwelveLabsSearchResult["data"]> {
    const body: any = {
      index_id: this.config.indexId,
      query,
      search_options: options?.searchOptions || ["visual", "conversation"],
      threshold: options?.threshold || "medium",
    };

    if (options?.videoIds) {
      body.filter = { id: options.videoIds };
    }

    const response = await this.request("POST", "/search", body);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`TwelveLabs search failed: ${JSON.stringify(error)}`);
    }

    const result = await response.json() as TwelveLabsSearchResult;
    return result.data;
  }

  /**
   * Get video transcript
   */
  async getTranscript(videoId: string): Promise<TranscriptSegment[]> {
    const response = await this.request(
      "GET",
      `/indexes/${this.config.indexId}/videos/${videoId}/transcription`
    );

    if (!response.ok) {
      // Transcript might not be available
      return [];
    }

    const result = await response.json() as any;

    return (result.data || []).map((segment: any, index: number) => ({
      id: `transcript-${index}`,
      startTime: segment.start,
      endTime: segment.end,
      text: segment.value,
      confidence: 0.9, // TwelveLabs doesn't provide confidence per segment
      language: result.language || "unknown",
    }));
  }

  /**
   * Full video analysis using TwelveLabs capabilities
   */
  async analyzeVideo(
    videoUrl: string,
    options?: VideoAnalysisOptions
  ): Promise<VideoAnalysisResult> {
    // Step 1: Upload and index video
    console.log("[TwelveLabs] Uploading video...");
    const taskId = await this.uploadVideo(videoUrl, {
      language: options?.language,
    });

    // Step 2: Wait for indexing
    console.log("[TwelveLabs] Waiting for indexing...");
    const task = await this.waitForIndexing(taskId);
    const videoId = task.video_id!;

    // Step 3: Get video metadata
    console.log("[TwelveLabs] Getting video info...");
    const videoInfo = await this.getVideo(videoId);

    // Step 4: Generate summary
    console.log("[TwelveLabs] Generating summary...");
    const summary = await this.generate(videoId, "summary");

    // Step 5: Generate chapters
    console.log("[TwelveLabs] Generating chapters...");
    const chaptersText = await this.generate(videoId, "chapter");
    const chapters = this.parseChapters(chaptersText, task.metadata?.duration || 0);

    // Step 6: Get transcript if requested
    let transcript: TranscriptSegment[] = [];
    if (options?.extractTranscript !== false) {
      console.log("[TwelveLabs] Getting transcript...");
      transcript = await this.getTranscript(videoId);
    }

    // Step 7: Search for entities (people, objects, etc.)
    let entities: DetectedEntity[] = [];
    if (options?.extractEntities !== false) {
      console.log("[TwelveLabs] Extracting entities...");
      entities = await this.extractEntities(videoId);
    }

    // Step 8: Generate highlights
    console.log("[TwelveLabs] Finding highlights...");
    const highlightsText = await this.generate(videoId, "highlight");
    const highlights = this.parseHighlights(highlightsText);

    // Build result
    return {
      videoId,
      duration: task.metadata?.duration || 0,
      resolution: {
        width: task.metadata?.width || 1920,
        height: task.metadata?.height || 1080,
      },
      fps: task.metadata?.fps || 30,

      scenes: chapters.map((ch) => ({
        ...ch,
        type: "chapter" as const,
        tags: [],
      })),
      chapters,

      entities,
      events: highlights.map((h) => ({
        id: h.id,
        type: "highlight",
        startTime: h.startTime,
        endTime: h.endTime,
        description: h.description,
      })),
      transcript,
      onScreenTexts: [], // TwelveLabs doesn't provide OCR directly

      summary,
      tags: this.extractTags(summary),
      language: options?.language || "auto",

      _raw: {
        taskId,
        videoId,
        videoInfo,
      },
    };
  }

  /**
   * Extract entities from video using search
   */
  private async extractEntities(videoId: string): Promise<DetectedEntity[]> {
    const entities: DetectedEntity[] = [];
    const entityQueries = [
      { query: "person speaking", type: "person" as const },
      { query: "text on screen", type: "text" as const },
      { query: "product or brand logo", type: "brand" as const },
      { query: "location or place", type: "location" as const },
    ];

    for (const { query, type } of entityQueries) {
      try {
        const results = await this.search(query, {
          videoIds: [videoId],
          threshold: "low",
        });

        for (const result of results) {
          const existing = entities.find(
            (e) => e.type === type && Math.abs(e.appearances[0].startTime - result.start) < 1
          );

          if (existing) {
            existing.appearances.push({
              startTime: result.start,
              endTime: result.end,
            });
          } else {
            entities.push({
              id: `entity-${entities.length}`,
              name: result.metadata?.text || `${type}-${entities.length}`,
              type,
              confidence: parseFloat(result.confidence) || 0.5,
              appearances: [
                {
                  startTime: result.start,
                  endTime: result.end,
                },
              ],
            });
          }
        }
      } catch (error) {
        console.warn(`Failed to extract ${type} entities:`, error);
      }
    }

    return entities;
  }

  /**
   * Parse chapters from generated text
   */
  private parseChapters(
    text: string,
    totalDuration: number
  ): SceneInfo[] {
    const chapters: SceneInfo[] = [];
    const lines = text.split("\n").filter((l) => l.trim());

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Try to parse timestamps like "00:00 - 01:30: Introduction"
      const match = line.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–]\s*(\d{1,2}:\d{2}(?::\d{2})?)?:?\s*(.*)/);

      if (match) {
        const startTime = this.parseTimestamp(match[1]);
        const endTime = match[2]
          ? this.parseTimestamp(match[2])
          : i < lines.length - 1
          ? totalDuration / lines.length * (i + 1)
          : totalDuration;
        const description = match[3].trim();

        chapters.push({
          id: `chapter-${i}`,
          startTime,
          endTime,
          duration: endTime - startTime,
          type: "chapter",
          description,
          tags: [],
        });
      }
    }

    // If no chapters parsed, create a single chapter
    if (chapters.length === 0) {
      chapters.push({
        id: "chapter-0",
        startTime: 0,
        endTime: totalDuration,
        duration: totalDuration,
        type: "chapter",
        description: text.substring(0, 200),
        tags: [],
      });
    }

    return chapters;
  }

  /**
   * Parse highlights from generated text
   */
  private parseHighlights(text: string): VideoEvent[] {
    const highlights: VideoEvent[] = [];
    const lines = text.split("\n").filter((l) => l.trim());

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–]?\s*(\d{1,2}:\d{2}(?::\d{2})?)?:?\s*(.*)/);

      if (match) {
        const startTime = this.parseTimestamp(match[1]);
        const endTime = match[2] ? this.parseTimestamp(match[2]) : startTime + 10;

        highlights.push({
          id: `highlight-${i}`,
          type: "highlight",
          startTime,
          endTime,
          description: match[3].trim(),
        });
      }
    }

    return highlights;
  }

  /**
   * Parse timestamp string to seconds
   */
  private parseTimestamp(timestamp: string): number {
    const parts = timestamp.split(":").map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return parts[0] * 60 + parts[1];
  }

  /**
   * Extract tags from summary
   */
  private extractTags(summary: string): string[] {
    // Simple keyword extraction
    const words = summary.toLowerCase().split(/\W+/);
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been",
      "being", "have", "has", "had", "do", "does", "did", "will",
      "would", "could", "should", "may", "might", "must", "shall",
      "can", "need", "dare", "ought", "used", "to", "of", "in",
      "for", "on", "with", "at", "by", "from", "as", "into", "through",
      "during", "before", "after", "above", "below", "between", "under",
      "again", "further", "then", "once", "here", "there", "when",
      "where", "why", "how", "all", "each", "few", "more", "most",
      "other", "some", "such", "no", "nor", "not", "only", "own",
      "same", "so", "than", "too", "very", "just", "and", "but",
      "if", "or", "because", "until", "while", "this", "that", "these",
      "those", "it", "its", "video", "shows", "featuring",
    ]);

    const wordCounts = new Map<string, number>();
    for (const word of words) {
      if (word.length > 3 && !stopWords.has(word)) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }

    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }
}
