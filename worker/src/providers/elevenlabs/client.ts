/**
 * ElevenLabs Client - Text-to-Speech
 * https://elevenlabs.io/docs/api-reference
 *
 * 高品質音声合成AIの完全実装
 */

import {
  TTSProvider,
  TTSRequest,
  TTSResult,
} from "../types";

interface ElevenLabsConfig {
  apiKey: string;
  defaultVoice?: string;
  defaultModel?: string;
}

interface Voice {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  preview_url: string;
}

export class ElevenLabsClient implements TTSProvider {
  name = "elevenlabs";
  private config: ElevenLabsConfig;
  private baseUrl = "https://api.elevenlabs.io/v1";

  // Pre-defined voice IDs for common use cases
  private builtInVoices: Record<string, string> = {
    "rachel": "21m00Tcm4TlvDq8ikWAM", // American female, warm
    "drew": "29vD33N1CtxCmqQRPOHJ", // American male, calm
    "paul": "5Q0t7uMcjvnagumLfvZi", // American male, news
    "domi": "AZnzlk1XvdvUeBnXmlld", // American female, strong
    "dave": "CYw3kZ02Hs0563khs1Fj", // British male, casual
    "sarah": "EXAVITQu4vr4xnSDxMaL", // American female, soft
    "thomas": "GBv7mTt0atIp3Br8iCZE", // American male, calm
    "george": "JBFqnCBsd6RMkjVDRZzb", // British male, raspy
    "emily": "LcfcDJNUP1GQjkzn1xUU", // American female, calm
    "josh": "TxGEqnHWrfWFTfGW9XjX", // American male, deep
    "daniel": "onwK4e9ZLuTAKqWW03F9", // British male, deep
    "adam": "pNInz6obpgDQGcFmaJgB", // American male, deep
  };

  private models = {
    "eleven_multilingual_v2": "eleven_multilingual_v2",
    "eleven_turbo_v2_5": "eleven_turbo_v2_5",
    "eleven_turbo_v2": "eleven_turbo_v2",
  };

  constructor(config: ElevenLabsConfig) {
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) {
      return false;
    }
    try {
      const response = await fetch(`${this.baseUrl}/user`, {
        headers: { "xi-api-key": this.config.apiKey },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      "xi-api-key": this.config.apiKey,
      "Content-Type": "application/json",
    };
  }

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const voiceId = this.resolveVoiceId(request.voice);
    const modelId = this.config.defaultModel || this.models["eleven_multilingual_v2"];

    console.log(`[ElevenLabs] Synthesizing with voice ${voiceId}...`);

    const response = await fetch(
      `${this.baseUrl}/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          ...this.getHeaders(),
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
          text: request.text,
          model_id: modelId,
          voice_settings: {
            stability: request.stability ?? 0.5,
            similarity_boost: request.similarityBoost ?? 0.75,
            style: request.style ?? 0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`ElevenLabs API error: ${JSON.stringify(error)}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");
    const audioUrl = `data:audio/mpeg;base64,${audioBase64}`;

    const wordCount = request.text.split(/\s+/).length;
    const estimatedDuration = (wordCount / 150) * 60;

    console.log(`[ElevenLabs] Synthesized ${audioBuffer.byteLength} bytes`);

    return {
      audioUrl,
      duration: estimatedDuration,
      format: "mp3",
    };
  }

  async synthesizeWithTimestamps(
    request: TTSRequest
  ): Promise<TTSResult & { timestamps: Array<{ char: string; start: number; end: number }> }> {
    const voiceId = this.resolveVoiceId(request.voice);
    const modelId = this.models["eleven_multilingual_v2"];

    const response = await fetch(
      `${this.baseUrl}/text-to-speech/${voiceId}/with-timestamps`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          text: request.text,
          model_id: modelId,
          voice_settings: {
            stability: request.stability ?? 0.5,
            similarity_boost: request.similarityBoost ?? 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`ElevenLabs timestamp error: ${JSON.stringify(error)}`);
    }

    const result = await response.json() as {
      audio_base64: string;
      alignment: {
        characters: string[];
        character_start_times_seconds: number[];
        character_end_times_seconds: number[];
      };
    };
    const audioBase64 = result.audio_base64;
    const timestamps = result.alignment.characters.map((char: string, i: number) => ({
      char,
      start: result.alignment.character_start_times_seconds[i],
      end: result.alignment.character_end_times_seconds[i],
    }));

    const duration = timestamps[timestamps.length - 1]?.end || 0;

    return {
      audioUrl: `data:audio/mpeg;base64,${audioBase64}`,
      duration,
      format: "mp3",
      timestamps,
    };
  }

  async getVoices(): Promise<Voice[]> {
    const response = await fetch(`${this.baseUrl}/voices`, {
      headers: { "xi-api-key": this.config.apiKey },
    });

    if (!response.ok) {
      throw new Error(`Failed to get voices: ${response.statusText}`);
    }

    const result = await response.json() as { voices: Voice[] };
    return result.voices;
  }

  async listVoices(): Promise<Array<{ id: string; name: string; language: string }>> {
    const voices = await this.getVoices();
    return voices.map((v) => ({
      id: v.voice_id,
      name: v.name,
      language: v.labels?.language || "en",
    }));
  }

  async synthesizeSegments(
    segments: Array<{
      text: string;
      voice?: string;
      startTime?: number;
    }>
  ): Promise<Array<TTSResult & { segmentIndex: number }>> {
    const results: Array<TTSResult & { segmentIndex: number }> = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      console.log(`[ElevenLabs] Synthesizing segment ${i + 1}/${segments.length}`);

      const result = await this.synthesize({
        text: segment.text,
        voice: segment.voice,
      });

      results.push({ ...result, segmentIndex: i });

      if (i < segments.length - 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    return results;
  }

  private resolveVoiceId(voice?: string): string {
    if (!voice) {
      return this.config.defaultVoice || this.builtInVoices["rachel"];
    }
    const builtIn = this.builtInVoices[voice.toLowerCase()];
    if (builtIn) {
      return builtIn;
    }
    return voice;
  }
}

export const VoicePresets = {
  narration: {
    corporate: "rachel",
    documentary: "daniel",
    educational: "thomas",
    storytelling: "george",
  },
  commercial: {
    energetic: "josh",
    friendly: "sarah",
    professional: "paul",
  },
};
