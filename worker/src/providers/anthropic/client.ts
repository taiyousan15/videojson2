/**
 * Anthropic Claude Client - Claude 3.5 Sonnet (Structured Output)
 * https://docs.anthropic.com/claude/reference/
 */

import {
  LLMMessage,
  LLMResponse,
  LLMOptions,
  LLMProvider,
  StructuredOutput,
  LLMContentPart,
} from "../types";

interface AnthropicConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  isOpenRouter?: boolean;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Array<{
    type: "text" | "image";
    text?: string;
    source?: {
      type: "base64";
      media_type: string;
      data: string;
    };
  }>;
}

interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<{
    type: "text";
    text: string;
  }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicClient implements LLMProvider {
  name = "anthropic";
  private config: AnthropicConfig;
  private baseUrl: string;

  constructor(config: AnthropicConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || "https://api.anthropic.com/v1";
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) {
      return false;
    }
    // Anthropic doesn't have a simple ping endpoint, so we just check the key exists
    return true;
  }

  /**
   * Chat completion with Claude
   */
  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    // Use OpenRouter (OpenAI-compatible) format if configured
    if (this.config.isOpenRouter) {
      return this.chatOpenRouter(messages, options);
    }

    const { systemPrompt, anthropicMessages } = this.convertMessages(messages);
    const model = options?.model || this.config.model;

    const body: any = {
      model,
      max_tokens: options?.maxTokens ?? 8192,
      messages: anthropicMessages,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Anthropic API error: ${JSON.stringify(error)}`);
    }

    const result = await response.json() as AnthropicResponse;
    const content = result.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");

    return {
      content,
      usage: {
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
      },
      model: result.model,
      finishReason: result.stop_reason,
    };
  }

  /**
   * Chat completion via OpenRouter (OpenAI-compatible format)
   */
  private async chatOpenRouter(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const model = options?.model || this.config.model;

    // Convert to OpenAI format
    const openaiMessages = messages.map((msg) => ({
      role: msg.role,
      content: typeof msg.content === "string" ? msg.content : msg.content.map((c) => {
        if (c.type === "text") return { type: "text", text: c.text };
        if (c.type === "image" && c.base64) {
          return {
            type: "image_url",
            image_url: { url: `data:${c.mimeType || "image/jpeg"};base64,${c.base64}` },
          };
        }
        return { type: "text", text: "" };
      }),
    }));

    const body: any = {
      model,
      max_tokens: options?.maxTokens ?? 8192,
      messages: openaiMessages,
    };

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiKey}`,
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://videojson.app",
        "X-Title": process.env.OPENROUTER_SITE_NAME || "VideoJSON",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenRouter API error: ${JSON.stringify(error)}`);
    }

    const result = await response.json();
    const choice = result.choices?.[0];

    return {
      content: choice?.message?.content || "",
      usage: {
        inputTokens: result.usage?.prompt_tokens || 0,
        outputTokens: result.usage?.completion_tokens || 0,
      },
      model: result.model,
      finishReason: choice?.finish_reason || "stop",
    };
  }

  /**
   * Structured output with JSON schema validation
   */
  async chatStructured<T>(
    messages: LLMMessage[],
    schema: object,
    options?: LLMOptions
  ): Promise<StructuredOutput<T>> {
    // Claude is excellent at following JSON schemas
    const systemMessage: LLMMessage = {
      role: "system",
      content: `You are a precise JSON generator. You must respond with valid JSON that exactly matches this schema:

${JSON.stringify(schema, null, 2)}

Rules:
1. Respond ONLY with the JSON object, no explanations or markdown
2. All required fields must be present
3. Use the exact types specified
4. If a field is optional and you don't have data, omit it
5. Never include fields not in the schema`,
    };

    const response = await this.chat([systemMessage, ...messages], {
      ...options,
      temperature: options?.temperature ?? 0.1, // Lower temp for structured output
    });

    try {
      // Try to extract JSON from the response
      const jsonContent = this.extractJSON(response.content);
      const data = JSON.parse(jsonContent) as T;
      return {
        data,
        raw: response.content,
        confidence: 1.0,
      };
    } catch (error) {
      // If parsing fails, try with a retry prompt
      const retryMessages: LLMMessage[] = [
        systemMessage,
        ...messages,
        { role: "assistant", content: response.content },
        {
          role: "user",
          content: "The previous response was not valid JSON. Please respond with ONLY the JSON object, starting with { and ending with }. No markdown, no explanations.",
        },
      ];

      const retryResponse = await this.chat(retryMessages, {
        ...options,
        temperature: 0,
      });

      const retryJson = this.extractJSON(retryResponse.content);
      const data = JSON.parse(retryJson) as T;
      return {
        data,
        raw: retryResponse.content,
        confidence: 0.8,
      };
    }
  }

  /**
   * Specialized method for video template generation
   */
  async generateVideoTemplate(analysisData: object): Promise<StructuredOutput<object>> {
    const schema = {
      type: "object",
      required: ["id", "name", "structure", "placeholders", "style", "timing"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        structure: {
          type: "object",
          required: ["totalDuration", "sections"],
          properties: {
            totalDuration: { type: "number" },
            sections: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "type", "startTime", "endTime"],
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  type: { type: "string", enum: ["intro", "content", "transition", "outro", "custom"] },
                  startTime: { type: "number" },
                  endTime: { type: "number" },
                  isReplaceable: { type: "boolean" },
                  description: { type: "string" },
                },
              },
            },
          },
        },
        placeholders: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "type", "name", "startTime", "endTime"],
            properties: {
              id: { type: "string" },
              type: { type: "string", enum: ["text", "image", "video", "audio", "narration"] },
              name: { type: "string" },
              description: { type: "string" },
              startTime: { type: "number" },
              endTime: { type: "number" },
              defaultValue: { type: "string" },
            },
          },
        },
        style: {
          type: "object",
          properties: {
            fonts: { type: "array" },
            colors: { type: "array" },
            transitions: { type: "array" },
            effects: { type: "array" },
          },
        },
        timing: {
          type: "object",
          properties: {
            bpm: { type: "number" },
            cuePoints: { type: "array" },
          },
        },
      },
    };

    const messages: LLMMessage[] = [
      {
        role: "user",
        content: `Based on this video analysis data, generate a video template that can be used to create similar videos by replacing placeholders:

${JSON.stringify(analysisData, null, 2)}

Identify:
1. The overall structure (intro, content sections, transitions, outro)
2. Elements that can be replaced (text overlays, narration, images, video clips)
3. Style characteristics (fonts, colors, transitions, effects)
4. Timing patterns (beat markers, cue points for sync)

Make the template practical for recreating videos with different content.`,
      },
    ];

    return this.chatStructured<object>(messages, schema);
  }

  /**
   * Generate narration script from template
   */
  async generateNarrationScript(
    template: object,
    newContent: { topic: string; keyPoints: string[]; style?: string }
  ): Promise<StructuredOutput<{ segments: Array<{ text: string; timing: number; emotion: string }> }>> {
    const schema = {
      type: "object",
      required: ["segments"],
      properties: {
        segments: {
          type: "array",
          items: {
            type: "object",
            required: ["text", "timing", "emotion"],
            properties: {
              text: { type: "string" },
              timing: { type: "number" },
              emotion: { type: "string", enum: ["neutral", "excited", "calm", "urgent", "friendly"] },
              emphasis: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    };

    const messages: LLMMessage[] = [
      {
        role: "user",
        content: `Generate a narration script for a video based on this template and content:

Template structure:
${JSON.stringify(template, null, 2)}

New content:
- Topic: ${newContent.topic}
- Key points: ${newContent.keyPoints.join(", ")}
- Style: ${newContent.style || "professional and engaging"}

Create narration segments that match the template's timing and style.`,
      },
    ];

    return this.chatStructured<{ segments: Array<{ text: string; timing: number; emotion: string }> }>(messages, schema);
  }

  /**
   * Convert LLM messages to Anthropic format
   */
  private convertMessages(messages: LLMMessage[]): {
    systemPrompt: string;
    anthropicMessages: AnthropicMessage[];
  } {
    let systemPrompt = "";
    const anthropicMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemPrompt += (typeof msg.content === "string" ? msg.content : "") + "\n";
        continue;
      }

      if (typeof msg.content === "string") {
        anthropicMessages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      } else {
        // Handle multimodal content
        const parts = msg.content.map((part: LLMContentPart) => {
          if (part.type === "text") {
            return { type: "text" as const, text: part.text || "" };
          } else if (part.type === "image" && part.base64) {
            return {
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: part.mimeType || "image/jpeg",
                data: part.base64,
              },
            };
          }
          return { type: "text" as const, text: "" };
        });

        anthropicMessages.push({
          role: msg.role as "user" | "assistant",
          content: parts,
        });
      }
    }

    return { systemPrompt: systemPrompt.trim(), anthropicMessages };
  }

  /**
   * Extract JSON from text that might include markdown
   */
  private extractJSON(text: string): string {
    // Try to find JSON in code blocks
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Try to find raw JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }

    return text;
  }
}
