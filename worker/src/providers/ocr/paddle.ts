// PaddleOCR client for GPU-optimized OCR
// Used as cost-optimized alternative to Cloud Vision

export class PaddleOcrClient {
  private endpoint: string;

  constructor() {
    this.endpoint = process.env.PADDLEOCR_ENDPOINT || "http://localhost:8000";
  }

  async processFrames(framePaths: string[]): Promise<OcrResult[]> {
    const results: OcrResult[] = [];

    for (let i = 0; i < framePaths.length; i++) {
      const framePath = framePaths[i];
      const result = await this.processFrame(framePath, i);
      results.push(...result);
    }

    return results;
  }

  private async processFrame(framePath: string, frameIndex: number): Promise<OcrResult[]> {
    const response = await fetch(`${this.endpoint}/ocr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_path: framePath }),
    });

    if (!response.ok) {
      throw new Error(`PaddleOCR error: ${response.statusText}`);
    }

    const data = await response.json() as { results: Array<{ text: string; box: number[][]; confidence: number }> };

    return data.results.map((r, i: number) => ({
      id: `ocr_${frameIndex}_${i}`,
      text: r.text,
      bbox: {
        x: r.box[0][0],
        y: r.box[0][1],
        width: r.box[1][0] - r.box[0][0],
        height: r.box[2][1] - r.box[0][1],
      },
      timestamp: frameIndex / 30,
      confidence: r.confidence,
    }));
  }
}

interface OcrResult {
  id: string;
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  timestamp: number;
  confidence: number;
}
