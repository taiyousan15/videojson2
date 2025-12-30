/**
 * Gemini Client - Google Gemini 2.0 Flash (Multimodal Analysis)
 * https://ai.google.dev/gemini-api/docs
 */

import {
  LLMMessage,
  LLMResponse,
  LLMOptions,
  LLMProvider,
  StructuredOutput,
  VideoAnalysisResult,
  SceneInfo,
  DetectedEntity,
  OnScreenText,
  TranscriptSegment,
  VideoAnalysisOptions,
  VideoAnalysisProvider,
} from "../types";

interface GeminiConfig {
  apiKey: string;
  model: string;
}

interface GeminiContent {
  role: "user" | "model";
  parts: Array<{
    text?: string;
    inlineData?: {
      mimeType: string;
      data: string;
    };
    fileData?: {
      mimeType: string;
      fileUri: string;
    };
  }>;
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export class GeminiClient implements LLMProvider, VideoAnalysisProvider {
  name = "gemini";
  private config: GeminiConfig;
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta";

  constructor(config: GeminiConfig) {
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) {
      return false;
    }
    try {
      const response = await fetch(
        `${this.baseUrl}/models?key=${this.config.apiKey}`
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Upload file to Gemini File API for video analysis
   */
  async uploadFile(
    fileUrl: string,
    mimeType: string
  ): Promise<{ fileUri: string; name: string }> {
    // Download file first
    const fileResponse = await fetch(fileUrl);
    const fileBuffer = await fileResponse.arrayBuffer();
    const base64Data = Buffer.from(fileBuffer).toString("base64");

    // Start resumable upload
    const initResponse = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${this.config.apiKey}`,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(fileBuffer.byteLength),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file: { displayName: `upload-${Date.now()}` },
        }),
      }
    );

    const uploadUrl = initResponse.headers.get("X-Goog-Upload-URL");
    if (!uploadUrl) {
      throw new Error("Failed to get upload URL");
    }

    // Upload file content
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(fileBuffer.byteLength),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: fileBuffer,
    });

    if (!uploadResponse.ok) {
      throw new Error(`File upload failed: ${uploadResponse.statusText}`);
    }

    const result = await uploadResponse.json() as { file: { uri: string; name: string } };
    return {
      fileUri: result.file.uri,
      name: result.file.name,
    };
  }

  /**
   * Wait for file processing to complete
   */
  async waitForFileProcessing(
    fileName: string,
    maxWaitMs = 300000
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const response = await fetch(
        `${this.baseUrl}/files/${fileName}?key=${this.config.apiKey}`
      );

      if (!response.ok) {
        throw new Error(`Failed to get file status: ${response.statusText}`);
      }

      const file = await response.json() as { state: string };

      if (file.state === "ACTIVE") {
        return;
      }

      if (file.state === "FAILED") {
        throw new Error("File processing failed");
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error("File processing timeout");
  }

  /**
   * Chat completion with Gemini
   */
  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const geminiContents = this.convertMessages(messages);
    const model = options?.model || this.config.model;

    const body: any = {
      contents: geminiContents,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 8192,
      },
    };

    if (options?.responseFormat === "json") {
      body.generationConfig.responseMimeType = "application/json";
    }

    const response = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.config.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gemini API error: ${JSON.stringify(error)}`);
    }

    const result = await response.json() as GeminiResponse;
    const content = result.candidates[0]?.content?.parts[0]?.text || "";

    return {
      content,
      usage: result.usageMetadata
        ? {
            inputTokens: result.usageMetadata.promptTokenCount,
            outputTokens: result.usageMetadata.candidatesTokenCount,
          }
        : undefined,
      model,
      finishReason: result.candidates[0]?.finishReason || "stop",
    };
  }

  /**
   * Structured output with JSON schema
   */
  async chatStructured<T>(
    messages: LLMMessage[],
    schema: object,
    options?: LLMOptions
  ): Promise<StructuredOutput<T>> {
    const systemMessage: LLMMessage = {
      role: "system",
      content: `You must respond with valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}\n\nRespond ONLY with the JSON, no additional text.`,
    };

    const response = await this.chat([systemMessage, ...messages], {
      ...options,
      responseFormat: "json",
    });

    try {
      const data = JSON.parse(response.content) as T;
      return { data, raw: response.content };
    } catch (error) {
      throw new Error(`Failed to parse structured output: ${response.content}`);
    }
  }

  /**
   * Analyze video using Gemini's vision capabilities
   */
  async analyzeVideo(
    videoUrl: string,
    options?: VideoAnalysisOptions
  ): Promise<VideoAnalysisResult> {
    console.log("[Gemini] Uploading video...");

    // Determine MIME type from URL
    const mimeType = this.getMimeType(videoUrl);

    // Upload video to Gemini
    const { fileUri, name } = await this.uploadFile(videoUrl, mimeType);

    // Wait for processing
    console.log("[Gemini] Waiting for video processing...");
    await this.waitForFileProcessing(name);

    // Analyze video with structured prompts
    console.log("[Gemini] Analyzing video...");

    const analysisResult = await this.performVideoAnalysis(fileUri, mimeType, options);

    return analysisResult;
  }

  /**
   * Perform comprehensive video analysis
   */
  private async performVideoAnalysis(
    fileUri: string,
    mimeType: string,
    options?: VideoAnalysisOptions
  ): Promise<VideoAnalysisResult> {
    // Step 1: Get overview and structure
    const overviewPrompt = `Analyze this video and provide:
1. A brief summary (2-3 sentences)
2. Total duration estimate
3. Main topics/themes
4. Language used

Respond in JSON format:
{
  "summary": "...",
  "durationEstimate": 120,
  "topics": ["topic1", "topic2"],
  "language": "en",
  "resolution": {"width": 1920, "height": 1080}
}`;

    const overviewResponse = await this.chatWithVideo(fileUri, mimeType, overviewPrompt);
    const overview = this.parseJSON(overviewResponse.content);

    // Step 2: Extract scenes/chapters
    const scenesPrompt = `Analyze this video and identify distinct scenes or chapters.
For each scene, provide:
- Start time (in seconds)
- End time (in seconds)
- Brief description
- Key visual elements

Respond in JSON format:
{
  "scenes": [
    {
      "startTime": 0,
      "endTime": 30,
      "description": "Introduction with logo animation",
      "visualElements": ["logo", "text", "animation"]
    }
  ]
}`;

    const scenesResponse = await this.chatWithVideo(fileUri, mimeType, scenesPrompt);
    const scenesData = this.parseJSON(scenesResponse.content);

    // Step 3: Extract entities (people, objects, text)
    let entities: DetectedEntity[] = [];
    if (options?.extractEntities !== false) {
      const entitiesPrompt = `Identify all entities in this video:
1. People (with descriptions and timestamps)
2. Objects and products
3. Brands and logos
4. Locations

Respond in JSON format:
{
  "entities": [
    {
      "name": "Person in blue shirt",
      "type": "person",
      "appearances": [{"startTime": 0, "endTime": 30}],
      "attributes": {"clothing": "blue shirt"}
    }
  ]
}`;

      const entitiesResponse = await this.chatWithVideo(fileUri, mimeType, entitiesPrompt);
      const entitiesData = this.parseJSON(entitiesResponse.content);
      entities = this.mapEntities(entitiesData.entities || []);
    }

    // Step 4: Extract on-screen text (OCR)
    let onScreenTexts: OnScreenText[] = [];
    if (options?.extractOCR !== false) {
      const ocrPrompt = `Identify all text visible on screen throughout the video.
For each text, provide:
- The text content
- Approximate timestamp when visible
- Position (top, bottom, center, etc.)
- Type (title, subtitle, caption, watermark)

Respond in JSON format:
{
  "texts": [
    {
      "text": "Subscribe Now",
      "startTime": 10,
      "endTime": 15,
      "position": "bottom-right",
      "type": "caption"
    }
  ]
}`;

      const ocrResponse = await this.chatWithVideo(fileUri, mimeType, ocrPrompt);
      const ocrData = this.parseJSON(ocrResponse.content);
      onScreenTexts = this.mapOnScreenTexts(ocrData.texts || []);
    }

    // Step 5: Extract transcript (if available from audio)
    let transcript: TranscriptSegment[] = [];
    if (options?.extractTranscript !== false) {
      const transcriptPrompt = `Transcribe the spoken content in this video.
Include timestamps and speaker identification if possible.

Respond in JSON format:
{
  "transcript": [
    {
      "startTime": 0,
      "endTime": 5,
      "text": "Hello and welcome...",
      "speaker": "narrator"
    }
  ]
}`;

      const transcriptResponse = await this.chatWithVideo(fileUri, mimeType, transcriptPrompt);
      const transcriptData = this.parseJSON(transcriptResponse.content);
      transcript = this.mapTranscript(transcriptData.transcript || []);
    }

    // Build final result
    const scenes: SceneInfo[] = (scenesData.scenes || []).map(
      (s: any, i: number) => ({
        id: `scene-${i}`,
        startTime: s.startTime || 0,
        endTime: s.endTime || 0,
        duration: (s.endTime || 0) - (s.startTime || 0),
        type: "scene" as const,
        description: s.description || "",
        tags: s.visualElements || [],
      })
    );

    return {
      videoId: `gemini-${Date.now()}`,
      duration: overview.durationEstimate || 0,
      resolution: overview.resolution || { width: 1920, height: 1080 },
      fps: 30,

      scenes,
      chapters: scenes.map((s) => ({
        ...s,
        type: "chapter" as const,
      })),

      entities,
      events: [],
      transcript,
      onScreenTexts,

      summary: overview.summary || "",
      tags: overview.topics || [],
      language: overview.language || "unknown",

      _raw: {
        fileUri,
        overview,
        scenesData,
      },
    };
  }

  /**
   * Chat with video content
   */
  private async chatWithVideo(
    fileUri: string,
    mimeType: string,
    prompt: string
  ): Promise<LLMResponse> {
    const model = this.config.model;

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                mimeType,
                fileUri,
              },
            },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    };

    const response = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.config.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gemini video analysis error: ${JSON.stringify(error)}`);
    }

    const result = await response.json() as GeminiResponse;
    return {
      content: result.candidates[0]?.content?.parts[0]?.text || "{}",
      model,
      finishReason: result.candidates[0]?.finishReason || "stop",
    };
  }

  /**
   * Convert LLM messages to Gemini format
   */
  private convertMessages(messages: LLMMessage[]): GeminiContent[] {
    const contents: GeminiContent[] = [];
    let systemPrompt = "";

    for (const msg of messages) {
      if (msg.role === "system") {
        systemPrompt += (typeof msg.content === "string" ? msg.content : "") + "\n";
        continue;
      }

      const parts: GeminiContent["parts"] = [];

      if (typeof msg.content === "string") {
        const text = msg.role === "user" && systemPrompt
          ? `${systemPrompt}\n${msg.content}`
          : msg.content;
        parts.push({ text });
        systemPrompt = "";
      } else {
        for (const part of msg.content) {
          if (part.type === "text") {
            parts.push({ text: part.text || "" });
          } else if (part.type === "image" && part.base64) {
            parts.push({
              inlineData: {
                mimeType: part.mimeType || "image/jpeg",
                data: part.base64,
              },
            });
          }
        }
      }

      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts,
      });
    }

    return contents;
  }

  /**
   * Safely parse JSON from response
   */
  private parseJSON(text: string): any {
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
      }
      return JSON.parse(text);
    } catch {
      console.warn("Failed to parse JSON, returning empty object");
      return {};
    }
  }

  /**
   * Map entity data to DetectedEntity format
   */
  private mapEntities(entities: any[]): DetectedEntity[] {
    return entities.map((e, i) => ({
      id: `entity-${i}`,
      name: e.name || `unknown-${i}`,
      type: this.mapEntityType(e.type),
      confidence: e.confidence || 0.8,
      appearances: (e.appearances || []).map((a: any) => ({
        startTime: a.startTime || 0,
        endTime: a.endTime || 0,
      })),
      attributes: e.attributes,
    }));
  }

  /**
   * Map entity type string to enum
   */
  private mapEntityType(type: string): DetectedEntity["type"] {
    const typeMap: Record<string, DetectedEntity["type"]> = {
      person: "person",
      people: "person",
      object: "object",
      location: "location",
      place: "location",
      brand: "brand",
      logo: "brand",
      text: "text",
      action: "action",
    };
    return typeMap[type?.toLowerCase()] || "object";
  }

  /**
   * Map OCR data to OnScreenText format
   */
  private mapOnScreenTexts(texts: any[]): OnScreenText[] {
    return texts.map((t, i) => ({
      id: `text-${i}`,
      startTime: t.startTime || 0,
      endTime: t.endTime || t.startTime || 0,
      text: t.text || "",
      boundingBox: this.parsePosition(t.position),
      confidence: t.confidence || 0.8,
      type: this.mapTextType(t.type),
    }));
  }

  /**
   * Parse position string to bounding box
   */
  private parsePosition(position: string): OnScreenText["boundingBox"] {
    const posMap: Record<string, OnScreenText["boundingBox"]> = {
      "top-left": { x: 0, y: 0, width: 0.3, height: 0.1 },
      "top-center": { x: 0.35, y: 0, width: 0.3, height: 0.1 },
      "top-right": { x: 0.7, y: 0, width: 0.3, height: 0.1 },
      "center": { x: 0.35, y: 0.45, width: 0.3, height: 0.1 },
      "bottom-left": { x: 0, y: 0.9, width: 0.3, height: 0.1 },
      "bottom-center": { x: 0.35, y: 0.9, width: 0.3, height: 0.1 },
      "bottom-right": { x: 0.7, y: 0.9, width: 0.3, height: 0.1 },
    };
    return posMap[position?.toLowerCase()] || { x: 0, y: 0, width: 1, height: 0.1 };
  }

  /**
   * Map text type string to enum
   */
  private mapTextType(type: string): OnScreenText["type"] {
    const typeMap: Record<string, OnScreenText["type"]> = {
      title: "title",
      subtitle: "subtitle",
      caption: "caption",
      watermark: "watermark",
    };
    return typeMap[type?.toLowerCase()] || "other";
  }

  /**
   * Map transcript data to TranscriptSegment format
   */
  private mapTranscript(segments: any[]): TranscriptSegment[] {
    return segments.map((s, i) => ({
      id: `transcript-${i}`,
      startTime: s.startTime || 0,
      endTime: s.endTime || 0,
      text: s.text || "",
      speaker: s.speaker,
      confidence: s.confidence || 0.8,
      language: s.language,
    }));
  }

  /**
   * Get MIME type from URL
   */
  private getMimeType(url: string): string {
    const ext = url.split(".").pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      mkv: "video/x-matroska",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
    };
    return mimeTypes[ext || ""] || "video/mp4";
  }
}
