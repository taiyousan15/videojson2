/**
 * Analyze Job - 動画解析ジョブ
 *
 * 新しいAI統合パイプラインを使用して動画を解析
 */

import { prisma } from "../db";
import {
  updateProgress,
  setWaitingExternal,
  resumeFromWaiting,
  setReviewRequired,
} from "../tasks/progress";
import {
  VideoAnalysisPipeline,
  getAnalysisPipeline,
} from "../pipelines/video_analysis";
import {
  TemplateExtractor,
  getTemplateExtractor,
} from "../pipelines/template_extraction";
import { Storage } from "@google-cloud/storage";

const storage = new Storage();

export async function runAnalyze(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { video: true },
  });

  if (!job) throw new Error(`Job not found: ${jobId}`);

  console.log(`[Analyze] Starting analysis for job ${jobId}`);

  // Get normalized video artifact
  const normalizedVideo = await prisma.artifact.findFirst({
    where: { videoId: job.videoId, type: "NORMALIZED_VIDEO" },
  });

  if (!normalizedVideo) {
    throw new Error("Normalized video not found. Run INGEST job first.");
  }

  const videoUrl = normalizedVideo.gcsUri;
  console.log(`[Analyze] Video URL: ${videoUrl}`);

  await updateProgress(jobId, 5, "initializing_pipeline");

  // Initialize pipelines
  const analysisPipeline = getAnalysisPipeline();
  const templateExtractor = getTemplateExtractor();

  await setWaitingExternal(jobId, "ai_analysis");

  // Run video analysis with progress callback
  await updateProgress(jobId, 10, "running_video_analysis");

  const analysisResult = await analysisPipeline.analyze(videoUrl, {
    extract: {
      scenes: true,
      entities: true,
      transcript: true,
      ocr: true,
      events: true,
    },
    onProgress: (stage, progress) => {
      const overallProgress = 10 + (progress * 0.5); // 10-60%
      console.log(`[Analyze] ${stage}: ${progress}%`);
    },
  });

  await resumeFromWaiting(jobId);
  await updateProgress(jobId, 60, "analysis_complete");

  console.log(`[Analyze] Analysis complete. Providers used: ${analysisResult.pipeline.providersUsed.join(", ")}`);

  // Extract template
  await updateProgress(jobId, 65, "extracting_template");

  const template = await templateExtractor.extract(analysisResult, {
    name: `Template from ${job.video.title || job.videoId}`,
    replaceables: {
      narration: true,
      onScreenText: true,
      images: true,
      backgroundMusic: true,
    },
  });

  console.log(`[Analyze] Template extracted with ${template.placeholders.length} placeholders`);

  await updateProgress(jobId, 75, "saving_results");

  // Build output JSON files
  const bucket = process.env.GCS_BUCKET || "videojson-artifacts";
  const basePath = `artifacts/${job.videoId}`;

  // Save Event JSON
  const eventJson = {
    version: "2.0",
    videoId: job.videoId,
    duration: analysisResult.duration,
    resolution: analysisResult.resolution,
    fps: analysisResult.fps,
    summary: analysisResult.summary,
    language: analysisResult.language,
    tags: analysisResult.tags,
    scenes: analysisResult.scenes,
    chapters: analysisResult.chapters,
    entities: analysisResult.entities,
    events: analysisResult.events,
    transcript: analysisResult.transcript,
    onScreenTexts: analysisResult.onScreenTexts,
    pipeline: analysisResult.pipeline,
  };

  const eventJsonUri = `gs://${bucket}/${basePath}/event.json`;
  await uploadJSON(bucket, `${basePath}/event.json`, eventJson);

  await prisma.artifact.create({
    data: {
      jobId,
      videoId: job.videoId,
      type: "EVENT_JSON",
      gcsUri: eventJsonUri,
      metadata: {
        version: "2.0",
        sceneCount: analysisResult.scenes.length,
        entityCount: analysisResult.entities.length,
        transcriptLength: analysisResult.transcript.length,
      },
    },
  });

  await updateProgress(jobId, 85, "saving_template");

  // Save Template JSON
  const templateJsonUri = `gs://${bucket}/${basePath}/template.json`;
  await uploadJSON(bucket, `${basePath}/template.json`, template);

  await prisma.artifact.create({
    data: {
      jobId,
      videoId: job.videoId,
      type: "TEMPLATE_JSON",
      gcsUri: templateJsonUri,
      metadata: {
        version: template.version,
        sectionCount: template.structure.sections.length,
        placeholderCount: template.placeholders.length,
      },
    },
  });

  // Check for low confidence results that need review
  const lowConfidenceEntities = analysisResult.entities.filter(
    (e) => e.confidence < 0.5
  );

  const lowConfidenceEvents = analysisResult.events.filter(
    (e: any) => e.importance && e.importance < 0.3
  );

  if (lowConfidenceEntities.length > 5 || lowConfidenceEvents.length > 3) {
    await setReviewRequired(jobId, "low_confidence_results");
    await prisma.job.update({
      where: { id: jobId },
      data: {
        result: {
          eventJsonUri,
          templateJsonUri,
          warnings: {
            lowConfidenceEntities: lowConfidenceEntities.length,
            lowConfidenceEvents: lowConfidenceEvents.length,
          },
        },
      },
    });

    console.log(`[Analyze] Review required due to low confidence results`);
    return;
  }

  // Update job result
  await prisma.job.update({
    where: { id: jobId },
    data: {
      result: {
        eventJsonUri,
        templateJsonUri,
        summary: analysisResult.summary,
        stats: {
          duration: analysisResult.duration,
          scenes: analysisResult.scenes.length,
          entities: analysisResult.entities.length,
          events: analysisResult.events.length,
          transcriptSegments: analysisResult.transcript.length,
          onScreenTexts: analysisResult.onScreenTexts.length,
          placeholders: template.placeholders.length,
        },
        pipeline: {
          providersUsed: analysisResult.pipeline.providersUsed,
          totalDuration: analysisResult.pipeline.totalDuration,
        },
      },
    },
  });

  await updateProgress(jobId, 100, "completed");
  console.log(`[Analyze] Job ${jobId} completed successfully`);
}

/**
 * Upload JSON to GCS
 */
async function uploadJSON(bucket: string, path: string, data: object): Promise<void> {
  const file = storage.bucket(bucket).file(path);
  await file.save(JSON.stringify(data, null, 2), {
    contentType: "application/json",
  });
}

/**
 * Analyze specific aspects of a video (for re-analysis)
 */
export async function runPartialAnalyze(
  jobId: string,
  aspects: ("scenes" | "entities" | "transcript" | "ocr" | "events")[]
): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { video: true },
  });

  if (!job) throw new Error(`Job not found: ${jobId}`);

  const normalizedVideo = await prisma.artifact.findFirst({
    where: { videoId: job.videoId, type: "NORMALIZED_VIDEO" },
  });

  if (!normalizedVideo) {
    throw new Error("Normalized video not found");
  }

  const analysisPipeline = getAnalysisPipeline();

  const result = await analysisPipeline.analyze(normalizedVideo.gcsUri, {
    extract: {
      scenes: aspects.includes("scenes"),
      entities: aspects.includes("entities"),
      transcript: aspects.includes("transcript"),
      ocr: aspects.includes("ocr"),
      events: aspects.includes("events"),
    },
  });

  // Merge with existing event.json
  const existingArtifact = await prisma.artifact.findFirst({
    where: { videoId: job.videoId, type: "EVENT_JSON" },
  });

  if (existingArtifact) {
    // Download existing, merge, re-upload
    // Implementation depends on storage provider
    console.log("[Analyze] Merging with existing analysis");
  }

  await updateProgress(jobId, 100, "partial_analysis_complete");
}
