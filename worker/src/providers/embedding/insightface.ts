// InsightFace client for face detection and embedding

interface ExtractedFrame {
  path: string;
  timestamp: number;
  index: number;
}

export class InsightFaceClient {
  private endpoint: string;

  constructor() {
    // デフォルトポート8001（8000はPythonアプリで使われやすいため回避）
    this.endpoint = process.env.INSIGHTFACE_ENDPOINT || "http://localhost:8001";
  }

  async detectFaces(frames: ExtractedFrame[]): Promise<FaceDetection[]> {
    const results: FaceDetection[] = [];

    for (const frame of frames) {
      try {
        const response = await fetch(`${this.endpoint}/detect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_path: frame.path }),
        });

        if (!response.ok) {
          console.warn(`[InsightFace] Detection failed for frame ${frame.index}`);
          continue;
        }

        const data = await response.json() as { faces: Array<{ bbox: { x: number; y: number; width: number; height: number }; landmarks?: number[][]; confidence: number }> };
        results.push(
          ...data.faces.map((face, j: number) => ({
            id: `face_${frame.index}_${j}`,
            frameIndex: frame.index,
            timestamp: frame.timestamp,
            bbox: face.bbox,
            landmarks: face.landmarks,
            confidence: face.confidence,
          }))
        );
      } catch (error) {
        console.warn(`[InsightFace] Error detecting faces in frame ${frame.index}:`, error);
      }
    }

    console.log(`[InsightFace] Detected ${results.length} faces in ${frames.length} frames`);
    return results;
  }

  async trackFaces(detections: FaceDetection[]): Promise<FaceTrack[]> {
    // Simple face tracking based on spatial proximity and temporal continuity
    // This is a basic implementation - production would use SORT/DeepSORT
    const tracks: FaceTrack[] = [];
    const used = new Set<string>();

    // Sort detections by frame index
    const sortedDetections = [...detections].sort((a, b) => a.frameIndex - b.frameIndex);

    for (const detection of sortedDetections) {
      if (used.has(detection.id)) continue;

      // Find or create track
      let matchedTrack: FaceTrack | null = null;
      let bestIoU = 0;

      for (const track of tracks) {
        // Get last detection in track
        const lastDetection = track.detections[track.detections.length - 1];

        // Check if same or adjacent frame
        if (detection.frameIndex <= lastDetection.frameIndex + 3) {
          const iou = this.calculateIoU(detection.bbox, lastDetection.bbox);
          if (iou > 0.3 && iou > bestIoU) {
            bestIoU = iou;
            matchedTrack = track;
          }
        }
      }

      if (matchedTrack) {
        matchedTrack.detections.push(detection);
      } else {
        // Create new track
        tracks.push({
          id: `track_${tracks.length}`,
          detections: [detection],
        });
      }

      used.add(detection.id);
    }

    console.log(`[InsightFace] Created ${tracks.length} tracks from ${detections.length} detections`);
    return tracks;
  }

  private calculateIoU(a: FaceDetection["bbox"], b: FaceDetection["bbox"]): number {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.width, b.x + b.width);
    const y2 = Math.min(a.y + a.height, b.y + b.height);

    if (x2 < x1 || y2 < y1) return 0;

    const intersection = (x2 - x1) * (y2 - y1);
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    const union = areaA + areaB - intersection;

    return intersection / union;
  }

  async generateEmbeddings(tracks: FaceTrack[]): Promise<FaceEmbedding[]> {
    const embeddings: FaceEmbedding[] = [];

    for (const track of tracks) {
      // Use best quality face from track for embedding
      const bestFace = track.detections.reduce((best, current) =>
        current.confidence > best.confidence ? current : best
      );

      const response = await fetch(`${this.endpoint}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detection_id: bestFace.id }),
      });

      if (!response.ok) continue;

      const data = await response.json() as { embedding: number[]; quality: number };
      embeddings.push({
        trackId: track.id,
        embedding: data.embedding,
        quality: data.quality,
      });
    }

    return embeddings;
  }

  async clusterEmbeddings(embeddings: FaceEmbedding[]): Promise<FaceCluster[]> {
    // Cluster embeddings using cosine similarity
    const clusters: FaceCluster[] = [];
    const used = new Set<number>();

    for (let i = 0; i < embeddings.length; i++) {
      if (used.has(i)) continue;

      const cluster: FaceCluster = {
        id: `cluster_${clusters.length}`,
        embeddings: [embeddings[i]],
        centroid: embeddings[i].embedding,
        similarity: 1.0,
      };

      for (let j = i + 1; j < embeddings.length; j++) {
        if (used.has(j)) continue;

        const sim = this.cosineSimilarity(
          embeddings[i].embedding,
          embeddings[j].embedding
        );

        if (sim >= 0.55) {
          cluster.embeddings.push(embeddings[j]);
          cluster.similarity = Math.min(cluster.similarity, sim);
          used.add(j);
        }
      }

      // Update centroid
      cluster.centroid = this.computeCentroid(
        cluster.embeddings.map((e) => e.embedding)
      );

      clusters.push(cluster);
      used.add(i);
    }

    return clusters;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private computeCentroid(embeddings: number[][]): number[] {
    const centroid = new Array(embeddings[0].length).fill(0);

    for (const embedding of embeddings) {
      for (let i = 0; i < embedding.length; i++) {
        centroid[i] += embedding[i];
      }
    }

    return centroid.map((v) => v / embeddings.length);
  }

  /**
   * Swap faces in a frame using a target face
   * @param sourceFramePath - Path to the source frame
   * @param targetFacePath - Path to the target face image
   * @param outputPath - Path to save the swapped frame
   * @returns Success status and output path
   */
  async swapFace(
    sourceFramePath: string,
    targetFacePath: string,
    outputPath: string,
    restoreFace: boolean = false
  ): Promise<FaceSwapResult> {
    try {
      const response = await fetch(`${this.endpoint}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_image: sourceFramePath,
          target_face: targetFacePath,
          output_path: outputPath,
          restore_face: restoreFace,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.warn(`[InsightFace] Face swap failed: ${error}`);
        return { success: false, error };
      }

      const data = await response.json() as { success: boolean; output_path: string; faces_swapped: number };
      return {
        success: true,
        outputPath: data.output_path,
        facesSwapped: data.faces_swapped,
      };
    } catch (error) {
      console.warn(`[InsightFace] Error swapping face:`, error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Swap faces in multiple frames (batch processing)
   */
  async swapFacesBatch(
    sourceFramePaths: string[],
    targetFacePath: string,
    outputDir: string,
    onProgress?: (current: number, total: number) => void,
    restoreFace: boolean = false
  ): Promise<FaceSwapBatchResult> {
    const results: FaceSwapResult[] = [];
    const total = sourceFramePaths.length;

    for (let i = 0; i < total; i++) {
      const sourcePath = sourceFramePaths[i];
      const filename = sourcePath.split("/").pop() || `frame_${i}.jpg`;
      const outputPath = `${outputDir}/${filename}`;

      const result = await this.swapFace(sourcePath, targetFacePath, outputPath, restoreFace);
      results.push(result);

      if (onProgress) {
        onProgress(i + 1, total);
      }
    }

    const successful = results.filter((r) => r.success).length;
    const totalFacesSwapped = results.reduce((sum, r) => sum + (r.facesSwapped || 0), 0);

    console.log(`[InsightFace] Batch swap complete: ${successful}/${total} frames, ${totalFacesSwapped} faces swapped`);

    return {
      success: successful > 0,
      processedFrames: successful,
      totalFrames: total,
      totalFacesSwapped,
      results,
    };
  }

  /**
   * Check if InsightFace server is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

interface FaceDetection {
  id: string;
  frameIndex: number;
  timestamp: number;
  bbox: { x: number; y: number; width: number; height: number };
  landmarks?: number[][];
  confidence: number;
}

interface FaceTrack {
  id: string;
  detections: FaceDetection[];
}

interface FaceEmbedding {
  trackId: string;
  embedding: number[];
  quality: number;
}

interface FaceCluster {
  id: string;
  embeddings: FaceEmbedding[];
  centroid: number[];
  similarity: number;
}

interface FaceSwapResult {
  success: boolean;
  outputPath?: string;
  facesSwapped?: number;
  error?: string;
}

interface FaceSwapBatchResult {
  success: boolean;
  processedFrames: number;
  totalFrames: number;
  totalFacesSwapped: number;
  results: FaceSwapResult[];
}
