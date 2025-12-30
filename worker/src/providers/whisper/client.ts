/**
 * Whisper Client - OpenAI Whisper (Speech-to-Text)
 * https://platform.openai.com/docs/api-reference/audio
 */

import { TranscriptSegment, STTProvider, STTOptions } from "../types";

interface WhisperConfig {
  apiKey: string;
  model?: string;
  whisperModel: string;
  baseUrl?: string;
  isOpenRouter?: boolean;
}

interface WhisperResponse {
  task: string;
  language: string;
  duration: number;
  text: string;
  segments?: Array<{
    id: number;
    seek: number;
    start: number;
    end: number;
    text: string;
    tokens: number[];
    temperature: number;
    avg_logprob: number;
    compression_ratio: number;
    no_speech_prob: number;
  }>;
}

export class WhisperClient implements STTProvider {
  name = "whisper";
  private config: WhisperConfig;
  private baseUrl: string;

  constructor(config: WhisperConfig) {
    this.config = config;
    // Whisper must always use OpenAI directly, not OpenRouter
    this.baseUrl = "https://api.openai.com/v1";
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) {
      return false;
    }
    // Whisper is not available through OpenRouter
    if (this.config.isOpenRouter) {
      return false;
    }
    return true;
  }

  /**
   * Check if OpenRouter is being used (Whisper not supported)
   */
  private checkOpenRouterSupport(): void {
    if (this.config.isOpenRouter) {
      throw new Error(
        "Whisper API is not supported with OpenRouter. " +
        "Please set OPENAI_API_KEY separately for speech-to-text functionality."
      );
    }
  }

  /**
   * Transcribe audio file
   */
  async transcribe(
    audioUrl: string,
    options?: STTOptions
  ): Promise<TranscriptSegment[]> {
    this.checkOpenRouterSupport();

    // Download audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.statusText}`);
    }

    const audioBlob = await audioResponse.blob();
    const fileName = audioUrl.split("/").pop() || "audio.mp3";

    // Create form data
    const formData = new FormData();
    formData.append("file", audioBlob, fileName);
    formData.append("model", this.config.whisperModel || "whisper-1");
    formData.append("response_format", "verbose_json");

    if (options?.timestamps !== false) {
      formData.append("timestamp_granularities[]", "segment");
    }

    if (options?.language) {
      formData.append("language", options.language);
    }

    // Call Whisper API
    const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Whisper API error: ${JSON.stringify(error)}`);
    }

    const result = await response.json() as WhisperResponse;

    // Convert to TranscriptSegment format
    if (result.segments) {
      return result.segments.map((segment, index) => ({
        id: `whisper-${index}`,
        startTime: segment.start,
        endTime: segment.end,
        text: segment.text.trim(),
        confidence: 1 - segment.no_speech_prob,
        language: result.language,
      }));
    }

    // Fallback if no segments (shouldn't happen with verbose_json)
    return [
      {
        id: "whisper-0",
        startTime: 0,
        endTime: result.duration,
        text: result.text,
        confidence: 0.9,
        language: result.language,
      },
    ];
  }

  /**
   * Transcribe with speaker diarization
   * Note: Whisper doesn't support diarization natively, so we use a heuristic
   */
  async transcribeWithSpeakers(
    audioUrl: string,
    options?: STTOptions
  ): Promise<TranscriptSegment[]> {
    const segments = await this.transcribe(audioUrl, options);

    // Simple speaker diarization based on pauses
    let currentSpeaker = "Speaker 1";
    let speakerCount = 1;
    let lastEndTime = 0;

    return segments.map((segment, index) => {
      // If there's a significant pause, might be a speaker change
      if (segment.startTime - lastEndTime > 2.0 && index > 0) {
        speakerCount = speakerCount === 1 ? 2 : 1;
        currentSpeaker = `Speaker ${speakerCount}`;
      }

      lastEndTime = segment.endTime;

      return {
        ...segment,
        speaker: currentSpeaker,
      };
    });
  }

  /**
   * Translate audio to English
   */
  async translate(audioUrl: string): Promise<TranscriptSegment[]> {
    this.checkOpenRouterSupport();

    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.statusText}`);
    }

    const audioBlob = await audioResponse.blob();
    const fileName = audioUrl.split("/").pop() || "audio.mp3";

    const formData = new FormData();
    formData.append("file", audioBlob, fileName);
    formData.append("model", this.config.whisperModel || "whisper-1");
    formData.append("response_format", "verbose_json");

    const response = await fetch(`${this.baseUrl}/audio/translations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Whisper translation error: ${JSON.stringify(error)}`);
    }

    const result = await response.json() as WhisperResponse;

    if (result.segments) {
      return result.segments.map((segment, index) => ({
        id: `whisper-${index}`,
        startTime: segment.start,
        endTime: segment.end,
        text: segment.text.trim(),
        confidence: 1 - segment.no_speech_prob,
        language: "en", // Translation is always to English
      }));
    }

    return [
      {
        id: "whisper-0",
        startTime: 0,
        endTime: result.duration,
        text: result.text,
        confidence: 0.9,
        language: "en",
      },
    ];
  }

  /**
   * Extract audio from video and transcribe
   * Note: Requires FFmpeg to be available
   */
  async transcribeVideo(
    videoUrl: string,
    options?: STTOptions
  ): Promise<TranscriptSegment[]> {
    // For now, we'll try to transcribe directly
    // Whisper can handle some video formats, but audio is preferred
    return this.transcribe(videoUrl, options);
  }

  /**
   * Get word-level timestamps
   */
  async transcribeWithWords(
    audioUrl: string,
    options?: STTOptions
  ): Promise<{
    segments: TranscriptSegment[];
    words: Array<{
      word: string;
      start: number;
      end: number;
      confidence: number;
    }>;
  }> {
    this.checkOpenRouterSupport();

    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.statusText}`);
    }

    const audioBlob = await audioResponse.blob();
    const fileName = audioUrl.split("/").pop() || "audio.mp3";

    const formData = new FormData();
    formData.append("file", audioBlob, fileName);
    formData.append("model", this.config.whisperModel || "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "word");
    formData.append("timestamp_granularities[]", "segment");

    if (options?.language) {
      formData.append("language", options.language);
    }

    const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Whisper API error: ${JSON.stringify(error)}`);
    }

    const result = await response.json() as any;

    const segments: TranscriptSegment[] = (result.segments || []).map(
      (segment: any, index: number) => ({
        id: `whisper-${index}`,
        startTime: segment.start,
        endTime: segment.end,
        text: segment.text.trim(),
        confidence: 1 - (segment.no_speech_prob || 0),
        language: result.language,
      })
    );

    const words = (result.words || []).map((word: any) => ({
      word: word.word,
      start: word.start,
      end: word.end,
      confidence: 0.9, // Whisper doesn't provide word-level confidence
    }));

    return { segments, words };
  }
}
