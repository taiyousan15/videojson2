/**
 * Provider Factory - プロバイダーインスタンスの生成・管理
 */

import { getConfig, validateConfig, ProviderConfig } from "./config";
import { TwelveLabsClient } from "./twelvelabs/client";
import { GeminiClient } from "./gemini/client";
import { AnthropicClient } from "./anthropic/client";
import { OpenAIClient } from "./openai/client";
import { ElevenLabsClient } from "./elevenlabs/client";
import { RunwayClient } from "./runway/client";
import { ReplicateClient } from "./replicate/client";
import { WhisperClient } from "./whisper/client";

export interface Providers {
  // Video Analysis
  twelvelabs?: TwelveLabsClient;
  gemini?: GeminiClient;

  // LLM
  anthropic?: AnthropicClient;
  openai?: OpenAIClient;

  // TTS
  elevenlabs?: ElevenLabsClient;

  // Video Generation
  runway?: RunwayClient;

  // Image Generation
  replicate?: ReplicateClient;

  // STT
  whisper?: WhisperClient;
}

export class ProviderFactory {
  private config: ProviderConfig;
  private providers: Providers = {};

  constructor(config?: ProviderConfig) {
    this.config = config || getConfig();
  }

  /**
   * Get validation status
   */
  validate() {
    return validateConfig(this.config);
  }

  /**
   * Get TwelveLabs client
   */
  getTwelveLabs(): TwelveLabsClient {
    if (!this.providers.twelvelabs) {
      this.providers.twelvelabs = new TwelveLabsClient(this.config.twelvelabs);
    }
    return this.providers.twelvelabs;
  }

  /**
   * Get Gemini client
   */
  getGemini(): GeminiClient {
    if (!this.providers.gemini) {
      this.providers.gemini = new GeminiClient(this.config.gemini);
    }
    return this.providers.gemini;
  }

  /**
   * Get Anthropic Claude client
   */
  getAnthropic(): AnthropicClient {
    if (!this.providers.anthropic) {
      this.providers.anthropic = new AnthropicClient(this.config.anthropic);
    }
    return this.providers.anthropic;
  }

  /**
   * Get OpenAI client
   */
  getOpenAI(): OpenAIClient {
    if (!this.providers.openai) {
      this.providers.openai = new OpenAIClient(this.config.openai);
    }
    return this.providers.openai;
  }

  /**
   * Get ElevenLabs client
   */
  getElevenLabs(): ElevenLabsClient {
    if (!this.providers.elevenlabs) {
      this.providers.elevenlabs = new ElevenLabsClient(this.config.elevenlabs);
    }
    return this.providers.elevenlabs;
  }

  /**
   * Get Runway client
   */
  getRunway(): RunwayClient {
    if (!this.providers.runway) {
      this.providers.runway = new RunwayClient(this.config.runway);
    }
    return this.providers.runway;
  }

  /**
   * Get Replicate client
   */
  getReplicate(): ReplicateClient {
    if (!this.providers.replicate) {
      this.providers.replicate = new ReplicateClient(this.config.replicate);
    }
    return this.providers.replicate;
  }

  /**
   * Get Whisper (OpenAI STT) client
   */
  getWhisper(): WhisperClient {
    if (!this.providers.whisper) {
      this.providers.whisper = new WhisperClient(this.config.openai);
    }
    return this.providers.whisper;
  }

  /**
   * Get the best available LLM provider
   * Priority: Claude > GPT-4o > Gemini
   */
  getBestLLM(): AnthropicClient | OpenAIClient | GeminiClient {
    const validation = this.validate();

    if (validation.available.includes("anthropic")) {
      return this.getAnthropic();
    }
    if (validation.available.includes("openai")) {
      return this.getOpenAI();
    }
    if (validation.available.includes("gemini")) {
      return this.getGemini();
    }

    throw new Error("No LLM provider available. Please configure at least one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_AI_API_KEY");
  }

  /**
   * Get the best available video analysis provider
   * Priority: TwelveLabs > Gemini
   */
  getBestVideoAnalysis(): TwelveLabsClient | GeminiClient {
    const validation = this.validate();

    if (validation.available.includes("twelvelabs")) {
      return this.getTwelveLabs();
    }
    if (validation.available.includes("gemini")) {
      return this.getGemini();
    }

    throw new Error("No video analysis provider available. Please configure at least one of: TWELVELABS_API_KEY, GOOGLE_AI_API_KEY");
  }

  /**
   * Check if a specific provider is available
   */
  isAvailable(provider: keyof Providers): boolean {
    const validation = this.validate();
    return validation.available.includes(provider);
  }

  /**
   * Get all available providers
   */
  getAvailable(): string[] {
    return this.validate().available;
  }
}

// Singleton instance
let factoryInstance: ProviderFactory | null = null;

export function getProviders(): ProviderFactory {
  if (!factoryInstance) {
    factoryInstance = new ProviderFactory();
  }
  return factoryInstance;
}
