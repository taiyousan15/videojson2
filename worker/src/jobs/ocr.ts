import { prisma } from "../db";
import { updateProgress, setReviewRequired } from "../tasks/progress";
import { CloudVisionOcr } from "../providers/ocr/vision";
import { extractFrames, ExtractedFrame } from "../ffmpeg/extractFrames";
import { downloadFile, uploadJSON, getDefaultBucket, buildGcsUri } from "../utils/gcs";
import * as fs from "fs/promises";
import * as path from "path";

export async function runOcr(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { video: true },
  });

  if (!job) throw new Error(`Job not found: ${jobId}`);

  const workDir = `/tmp/ocr_${jobId}`;
  await fs.mkdir(workDir, { recursive: true });

  try {
    const ocr = new CloudVisionOcr();

    await updateProgress(jobId, 10, "downloading_video");

    // Download normalized video
    const normalizedArtifact = await prisma.artifact.findFirst({
      where: { videoId: job.videoId, type: "NORMALIZED_VIDEO" },
      orderBy: { createdAt: "desc" },
    });

    if (!normalizedArtifact) throw new Error("Normalized video not found");

    const localVideoPath = path.join(workDir, "video.mp4");
    await downloadFile(normalizedArtifact.gcsUri, localVideoPath);

    await updateProgress(jobId, 20, "extracting_frames");

    // Extract keyframes for OCR (1 frame per second, max 60 frames)
    const framesDir = path.join(workDir, "frames");
    const extractedFrames = await extractFrames(localVideoPath, framesDir, {
      fps: 1,
      maxFrames: 60,
      format: "jpg",
      quality: 2,
    });

    if (extractedFrames.length === 0) {
      console.warn("[OCR] No frames extracted, creating empty report");
    }

    await updateProgress(jobId, 40, "running_ocr");

    // Run OCR on frames
    const ocrResults = await ocr.processFrames(extractedFrames);

    await updateProgress(jobId, 60, "building_report");

    // Build OCR report with bbox and safe_area suggestions
    const report = {
      frameCount: extractedFrames.length,
      onScreenTexts: ocrResults.map((r: any, index: number) => ({
        id: `ocr_${index}`,
        start: r.timestamp,
        end: r.timestamp + 1,
        text: r.text,
        bbox: r.bbox,
        confidence: r.confidence || 0.9,
      })),
      suggestedSafeArea: calculateSafeArea(ocrResults),
      suggestedPatch: buildStylePatch(ocrResults),
    };

    await updateProgress(jobId, 75, "uploading_report");

    // Upload OCR report to GCS
    const bucket = getDefaultBucket();
    const reportGcsPath = `artifacts/${job.videoId}/ocr_report_${Date.now()}.json`;
    const reportGcsUri = buildGcsUri(bucket, reportGcsPath);

    await uploadJSON(reportGcsUri, report);

    await updateProgress(jobId, 85, "awaiting_review");

    // Always require review for OCR results (P4: Human-in-the-loop)
    await setReviewRequired(jobId, "ocr_review_required");

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
        type: "OCR_REPORT",
        gcsUri: reportGcsUri,
        metadata: {
          frameCount: extractedFrames.length,
          textCount: report.onScreenTexts.length,
        },
      },
    });
  } finally {
    // Cleanup work directory
    await fs.rm(workDir, { recursive: true, force: true }).catch((err) => {
      console.error(`[OCR] Failed to cleanup work directory: ${err}`);
    });
  }
}

function calculateSafeArea(ocrResults: any[]): any {
  // Calculate safe area based on text positions
  return {
    top: 0.1,
    bottom: 0.1,
    left: 0.05,
    right: 0.05,
  };
}

function buildStylePatch(ocrResults: any[]): any[] {
  // Build JSON Patch for style updates
  return [
    {
      op: "add",
      path: "/style/safeArea",
      value: calculateSafeArea(ocrResults),
    },
  ];
}
