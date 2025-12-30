import { prisma } from "../db";
import { updateProgress, setReviewRequired } from "../tasks/progress";
import { InsightFaceClient } from "../providers/embedding/insightface";
import { extractEvenlyDistributedFrames, ExtractedFrame } from "../ffmpeg/extractFrames";
import { downloadFile, uploadJSON, getDefaultBucket, buildGcsUri } from "../utils/gcs";
import * as fs from "fs/promises";
import * as path from "path";

// Default thresholds if shared constants not available
const EMBEDDING_THRESHOLDS = {
  AUTO_MERGE: 0.85,
  REVIEW_MIN: 0.65,
};

export async function runEmbed(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { video: true },
  });

  if (!job) throw new Error(`Job not found: ${jobId}`);

  const workDir = `/tmp/embed_${jobId}`;
  await fs.mkdir(workDir, { recursive: true });

  try {
    const embedder = new InsightFaceClient();

    await updateProgress(jobId, 5, "downloading_video");

    // Download normalized video
    const normalizedArtifact = await prisma.artifact.findFirst({
      where: { videoId: job.videoId, type: "NORMALIZED_VIDEO" },
      orderBy: { createdAt: "desc" },
    });

    if (!normalizedArtifact) throw new Error("Normalized video not found");

    const localVideoPath = path.join(workDir, "video.mp4");
    await downloadFile(normalizedArtifact.gcsUri, localVideoPath);

    await updateProgress(jobId, 10, "extracting_frames");

    // Extract frames for face detection (30 frames evenly distributed)
    const framesDir = path.join(workDir, "frames");
    const extractedFrames = await extractEvenlyDistributedFrames(
      localVideoPath,
      framesDir,
      30,
      { format: "jpg", quality: 2 }
    );

    if (extractedFrames.length === 0) {
      console.warn("[Embed] No frames extracted");
    }

    await updateProgress(jobId, 20, "detecting_faces");

    // Detect faces in video frames
    const detections = await embedder.detectFaces(extractedFrames);

    await updateProgress(jobId, 35, "tracking");

    // Track faces across frames
    const tracks = await embedder.trackFaces(detections);

    await updateProgress(jobId, 50, "embedding");

    // Generate embeddings for each track
    const embeddings = await embedder.generateEmbeddings(tracks);

    await updateProgress(jobId, 70, "clustering");

    // Cluster embeddings to identify unique persons
    const clusters = await embedder.clusterEmbeddings(embeddings);

    // Classify clusters by similarity
    const autoMerge: any[] = [];
    const reviewRequired: any[] = [];
    const different: any[] = [];

    for (const cluster of clusters) {
      if (cluster.similarity >= EMBEDDING_THRESHOLDS.AUTO_MERGE) {
        autoMerge.push(cluster);
      } else if (cluster.similarity >= EMBEDDING_THRESHOLDS.REVIEW_MIN) {
        reviewRequired.push(cluster);
      } else {
        different.push(cluster);
      }
    }

    await updateProgress(jobId, 85, "building_report");

    const report = {
      frameCount: extractedFrames.length,
      totalFaces: detections.length,
      uniquePersons: clusters.length,
      autoMerged: autoMerge,
      reviewRequired,
      different,
      eventPatch: buildEntityPatch(autoMerge),
    };

    await updateProgress(jobId, 90, "uploading_report");

    // Upload embed report to GCS
    const bucket = getDefaultBucket();
    const reportGcsPath = `artifacts/${job.videoId}/embed_report_${Date.now()}.json`;
    const reportGcsUri = buildGcsUri(bucket, reportGcsPath);

    await uploadJSON(reportGcsUri, report);

    // If there are review required items, set status
    if (reviewRequired.length > 0) {
      await setReviewRequired(jobId, "weak_similarity_review");
    }

    await prisma.job.update({
      where: { id: jobId },
      data: {
        result: report,
      },
    });

    await prisma.artifact.create({
      data: {
        jobId,
        videoId: job.videoId,
        type: "EMBED_REPORT",
        gcsUri: reportGcsUri,
        metadata: {
          frameCount: extractedFrames.length,
          totalFaces: detections.length,
          uniquePersons: clusters.length,
        },
      },
    });

    if (reviewRequired.length === 0) {
      await updateProgress(jobId, 100, "completed");
    }
  } finally {
    // Cleanup work directory
    await fs.rm(workDir, { recursive: true, force: true }).catch((err) => {
      console.error(`[Embed] Failed to cleanup work directory: ${err}`);
    });
  }
}

function buildEntityPatch(autoMerged: any[]): any[] {
  return autoMerged.map((cluster, i) => ({
    op: "add",
    path: `/entities/-`,
    value: {
      id: `person_${i}`,
      type: "PERSON",
      name: `Person ${i + 1}`,
      embeddings: cluster.centroid,
    },
  }));
}
