import { ImageAnnotatorClient } from "@google-cloud/vision";

interface ExtractedFrame {
  path: string;
  timestamp: number;
  index: number;
}

export class CloudVisionOcr {
  private client: ImageAnnotatorClient;

  constructor() {
    this.client = new ImageAnnotatorClient();
  }

  async processFrames(frames: ExtractedFrame[]): Promise<OcrResult[]> {
    const results: OcrResult[] = [];

    for (const frame of frames) {
      try {
        const frameResults = await this.processFrame(frame);
        results.push(...frameResults);
      } catch (error) {
        console.warn(`[CloudVision] Failed to process frame ${frame.index}:`, error);
        // Continue processing other frames
      }
    }

    console.log(`[CloudVision] Processed ${frames.length} frames, found ${results.length} text regions`);
    return results;
  }

  private async processFrame(frame: ExtractedFrame): Promise<OcrResult[]> {
    const [result] = await this.client.textDetection(frame.path);
    const detections = result.textAnnotations || [];

    if (detections.length === 0) return [];

    // Skip the first detection (full text block)
    return detections.slice(1).map((detection: typeof detections[0], i: number) => {
      const vertices = detection.boundingPoly?.vertices || [];
      const bbox = this.calculateBbox(vertices);

      return {
        id: `ocr_${frame.index}_${i}`,
        text: detection.description || "",
        bbox,
        timestamp: frame.timestamp,
        confidence: detection.confidence || 0.9,
      };
    });
  }

  private calculateBbox(vertices: any[]): { x: number; y: number; width: number; height: number } {
    if (vertices.length < 4) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const xs = vertices.map((v) => v.x || 0);
    const ys = vertices.map((v) => v.y || 0);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
}

interface OcrResult {
  id: string;
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  timestamp: number;
  confidence: number;
}
