/**
 * OpenAI Client - GPT-4o (Multimodal LLM)
 * https://platform.openai.com/docs/api-reference
 */

import {
  LLMMessage,
  LLMResponse,
  LLMOptions,
  LLMProvider,
  StructuredOutput,
  LLMContentPart,
} from "../types";

interface OpenAIConfig {
  apiKey: string;
  model: string;
  whisperModel: string;
  baseUrl: string;
  isOpenRouter: boolean;
  openRouterSiteName?: string;
  openRouterSiteUrl?: string;
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{
    type: "text" | "image_url";
    text?: string;
    image_url?: {
      url: string;
      detail?: "low" | "high" | "auto";
    };
  }>;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIClient implements LLMProvider {
  name = "openai";
  private config: OpenAIConfig;
  private baseUrl: string;

  constructor(config: OpenAIConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || "https://api.openai.com/v1";
  }

  /**
   * Get headers for API requests (includes OpenRouter headers if needed)
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    if (this.config.isOpenRouter) {
      // OpenRouter requires these headers for tracking
      if (this.config.openRouterSiteUrl) {
        headers["HTTP-Referer"] = this.config.openRouterSiteUrl;
      }
      if (this.config.openRouterSiteName) {
        headers["X-Title"] = this.config.openRouterSiteName;
      }
    }

    return headers;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) {
      return false;
    }
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Check if using OpenRouter
   */
  isOpenRouter(): boolean {
    return this.config.isOpenRouter;
  }

  /**
   * Chat completion with GPT-4
   */
  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const openaiMessages = this.convertMessages(messages);
    const model = options?.model || this.config.model;

    const body: any = {
      model,
      messages: openaiMessages,
      max_tokens: options?.maxTokens ?? 8192,
    };

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    if (options?.responseFormat === "json") {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${JSON.stringify(error)}`);
    }

    const result = await response.json() as OpenAIResponse;
    const content = result.choices[0]?.message?.content || "";

    return {
      content,
      usage: {
        inputTokens: result.usage.prompt_tokens,
        outputTokens: result.usage.completion_tokens,
      },
      model: result.model,
      finishReason: result.choices[0]?.finish_reason || "stop",
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
      content: `You must respond with valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}\n\nRespond ONLY with the JSON object.`,
    };

    const response = await this.chat([systemMessage, ...messages], {
      ...options,
      responseFormat: "json",
      temperature: options?.temperature ?? 0.1,
    });

    try {
      const data = JSON.parse(response.content) as T;
      return { data, raw: response.content };
    } catch (error) {
      throw new Error(`Failed to parse structured output: ${response.content}`);
    }
  }

  /**
   * Analyze image with GPT-4 Vision
   */
  async analyzeImage(
    imageUrl: string,
    prompt: string,
    options?: { detail?: "low" | "high" | "auto" }
  ): Promise<string> {
    const messages: LLMMessage[] = [
      {
        role: "user",
        content: [
          {
            type: "image",
            imageUrl,
          },
          {
            type: "text",
            text: prompt,
          },
        ],
      },
    ];

    const response = await this.chat(messages, { model: "gpt-4o" });
    return response.content;
  }

  /**
   * Batch analyze multiple images
   */
  async analyzeImages(
    images: Array<{ url: string; prompt?: string }>,
    globalPrompt: string
  ): Promise<string> {
    const content: LLMContentPart[] = [];

    for (const image of images) {
      content.push({
        type: "image",
        imageUrl: image.url,
      });
      if (image.prompt) {
        content.push({
          type: "text",
          text: image.prompt,
        });
      }
    }

    content.push({
      type: "text",
      text: globalPrompt,
    });

    const messages: LLMMessage[] = [
      {
        role: "user",
        content,
      },
    ];

    const response = await this.chat(messages, { model: "gpt-4o" });
    return response.content;
  }

  /**
   * Generate embeddings for text
   * Note: OpenRouter does not support embeddings API
   */
  async createEmbedding(text: string): Promise<number[]> {
    if (this.config.isOpenRouter) {
      throw new Error("Embeddings API is not supported with OpenRouter. Please use OPENAI_API_KEY directly.");
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.statusText}`);
    }

    const result = await response.json() as any;
    return result.data[0].embedding;
  }

  /**
   * Batch embeddings
   * Note: OpenRouter does not support embeddings API
   */
  async createEmbeddings(texts: string[]): Promise<number[][]> {
    if (this.config.isOpenRouter) {
      throw new Error("Embeddings API is not supported with OpenRouter. Please use OPENAI_API_KEY directly.");
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: texts,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.statusText}`);
    }

    const result = await response.json() as any;
    return result.data.map((d: any) => d.embedding);
  }

  /**
   * Rerank candidates by relevance
   */
  async rerank(
    query: string,
    candidates: { id: string; text: string }[]
  ): Promise<{ id: string; score: number }[]> {
    const prompt = `Given the query: "${query}"

Rank the following candidates by relevance (score 0-1, higher is more relevant):
${candidates.map((c, i) => `${i + 1}. [ID: ${c.id}] ${c.text}`).join("\n")}

Respond with JSON: {"rankings": [{"id": "...", "score": 0.95}, ...]}`;

    const response = await this.chat(
      [{ role: "user", content: prompt }],
      { responseFormat: "json" }
    );

    const result = JSON.parse(response.content);
    return result.rankings || [];
  }

  /**
   * Classify text into categories
   */
  async classify(
    text: string,
    categories: string[]
  ): Promise<{ category: string; confidence: number }> {
    const prompt = `Classify the following text into one of these categories: ${categories.join(", ")}

Text: "${text}"

Respond with JSON: {"category": "...", "confidence": 0.95}`;

    const response = await this.chat(
      [{ role: "user", content: prompt }],
      { responseFormat: "json" }
    );

    return JSON.parse(response.content);
  }

  /**
   * Summarize text
   */
  async summarize(text: string, maxLength: number = 100): Promise<string> {
    const response = await this.chat([
      {
        role: "user",
        content: `Summarize in ${maxLength} characters or less:\n\n${text}`,
      },
    ]);

    return response.content;
  }

  /**
   * Extract entities from text
   */
  async extractEntities(text: string): Promise<{ name: string; type: string }[]> {
    const prompt = `Extract named entities from the following text.

Text: "${text}"

Respond with JSON: {"entities": [{"name": "...", "type": "PERSON|LOCATION|OBJECT|BRAND"}, ...]}`;

    const response = await this.chat(
      [{ role: "user", content: prompt }],
      { responseFormat: "json" }
    );

    const result = JSON.parse(response.content);
    return result.entities || [];
  }

  /**
   * Convert LLM messages to OpenAI format
   */
  private convertMessages(messages: LLMMessage[]): OpenAIMessage[] {
    return messages.map((msg) => {
      if (typeof msg.content === "string") {
        return {
          role: msg.role,
          content: msg.content,
        };
      }

      // Handle multimodal content
      const parts = msg.content.map((part: LLMContentPart) => {
        if (part.type === "text") {
          return { type: "text" as const, text: part.text || "" };
        } else if (part.type === "image") {
          const url = part.imageUrl || (part.base64 ? `data:${part.mimeType || "image/jpeg"};base64,${part.base64}` : "");
          return {
            type: "image_url" as const,
            image_url: {
              url,
              detail: "auto" as const,
            },
          };
        }
        return { type: "text" as const, text: "" };
      });

      return {
        role: msg.role,
        content: parts,
      };
    });
  }
}
