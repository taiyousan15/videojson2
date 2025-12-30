import OpenAI from "openai";

export class LlmClient {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async rerank(
    query: string,
    candidates: { id: string; text: string }[]
  ): Promise<{ id: string; score: number }[]> {
    const prompt = `Given the query: "${query}"

Rank the following candidates by relevance (1-10 score):
${candidates.map((c, i) => `${i + 1}. ${c.text}`).join("\n")}

Return JSON array: [{"id": "...", "score": N}, ...]`;

    const response = await this.client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content || "[]";
    return JSON.parse(content);
  }

  async classify(
    text: string,
    categories: string[]
  ): Promise<{ category: string; confidence: number }> {
    const prompt = `Classify the following text into one of these categories: ${categories.join(", ")}

Text: "${text}"

Return JSON: {"category": "...", "confidence": 0.0-1.0}`;

    const response = await this.client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content || '{"category": "", "confidence": 0}';
    return JSON.parse(content);
  }

  async summarize(text: string, maxLength: number = 100): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Summarize in ${maxLength} characters or less:\n\n${text}`,
        },
      ],
    });

    return response.choices[0].message.content || "";
  }

  async extractEntities(text: string): Promise<{ name: string; type: string }[]> {
    const prompt = `Extract named entities from the following text.

Text: "${text}"

Return JSON array: [{"name": "...", "type": "PERSON|LOCATION|OBJECT|BRAND"}, ...]`;

    const response = await this.client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content || "[]";
    const result = JSON.parse(content);
    return result.entities || [];
  }
}
