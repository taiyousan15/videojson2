import { prisma } from "../db";
import { updateProgress, setReviewRequired } from "../tasks/progress";
import { downloadJSON, uploadJSON, getDefaultBucket, buildGcsUri } from "../utils/gcs";

interface EventSegment {
  start: number;
  end: number;
  type?: string;
  features?: {
    action_intensity?: number;
    face_presence?: number;
    audio_energy?: number;
    text_density?: number;
    scene_change?: number;
  };
}

interface ScoredSegment {
  start: number;
  end: number;
  score: number;
  features: Record<string, number>;
}

export async function runHighlight(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { video: true },
  });

  if (!job) throw new Error(`Job not found: ${jobId}`);

  await updateProgress(jobId, 10, "loading_event_json");

  // Load Event JSON artifact
  const eventArtifact = await prisma.artifact.findFirst({
    where: { videoId: job.videoId, type: "EVENT_JSON" },
    orderBy: { createdAt: "desc" },
  });

  if (!eventArtifact) throw new Error("Event JSON not found");

  await updateProgress(jobId, 20, "downloading_event_json");

  // Download Event JSON from GCS
  const eventJson = await downloadJSON<any>(eventArtifact.gcsUri);

  await updateProgress(jobId, 30, "loading_weights");

  // Load active model weights
  const weights = await prisma.modelWeights.findFirst({
    where: { name: "highlight_scorer", active: true },
    orderBy: { version: "desc" },
  });

  const defaultWeights = {
    action_intensity: 0.3,
    face_presence: 0.2,
    audio_energy: 0.2,
    text_density: 0.15,
    scene_change: 0.15,
  };

  const scoringWeights = (weights?.weights as any) || defaultWeights;

  await updateProgress(jobId, 40, "extracting_features");

  // Extract segments from event JSON
  let eventSegments = extractSegmentsFromEventJson(eventJson);

  // Fallback: generate segments from video duration if none found
  if (eventSegments.length === 0) {
    console.log("[Highlight] No segments in Event JSON, generating from video duration");
    const videoDuration = eventJson.duration || eventJson.metadata?.duration || job.video.duration || 60;
    eventSegments = generateFallbackSegments(videoDuration);
    console.log(`[Highlight] Generated ${eventSegments.length} fallback segments for ${videoDuration}s video`);
  }

  await updateProgress(jobId, 60, "scoring_segments");

  // Score segments using weights
  const segments = scoreSegments(eventSegments, scoringWeights);

  await updateProgress(jobId, 75, "building_plan");

  // Build highlight plan
  const plan = {
    totalSegments: segments.length,
    candidates: segments.map((s: ScoredSegment, i: number) => ({
      id: `segment_${i}`,
      start: s.start,
      end: s.end,
      score: s.score,
      features: s.features,
      selected: s.score >= 0.7, // Auto-select high scoring segments
    })),
    weightsVersion: weights?.version || 0,
    reviewRequired: job.config && (job.config as any).reviewRequired !== false,
  };

  await updateProgress(jobId, 85, "uploading_plan");

  // Upload highlight plan to GCS
  const bucket = getDefaultBucket();
  const planGcsPath = `artifacts/${job.videoId}/highlight_plan_${Date.now()}.json`;
  const planGcsUri = buildGcsUri(bucket, planGcsPath);

  await uploadJSON(planGcsUri, plan);

  // Check if review is required
  if (plan.reviewRequired) {
    await setReviewRequired(jobId, "highlight_review");
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      result: plan,
    },
  });

  await prisma.artifact.create({
    data: {
      jobId,
      videoId: job.videoId,
      type: "HIGHLIGHT_PLAN",
      gcsUri: planGcsUri,
      metadata: {
        totalSegments: segments.length,
        selectedCount: plan.candidates.filter((c) => c.selected).length,
        weightsVersion: plan.weightsVersion,
      },
    },
  });

  if (!plan.reviewRequired) {
    await updateProgress(jobId, 100, "completed");
  }
}

/**
 * Generate fallback segments from video duration
 */
function generateFallbackSegments(duration: number): EventSegment[] {
  const segments: EventSegment[] = [];
  const segmentDuration = 10; // 10 seconds per segment

  for (let start = 0; start < duration; start += segmentDuration) {
    const end = Math.min(start + segmentDuration, duration);
    segments.push({
      start,
      end,
      type: "fallback",
      features: {
        action_intensity: 0.5 + Math.random() * 0.3,
        face_presence: 0.4 + Math.random() * 0.3,
        audio_energy: 0.5 + Math.random() * 0.3,
        text_density: 0.2 + Math.random() * 0.2,
        scene_change: 0.3 + Math.random() * 0.2,
      },
    });
  }

  // Mark first and last segments as potentially important
  if (segments.length > 0) {
    segments[0].features!.action_intensity = 0.8;
    segments[segments.length - 1].features!.action_intensity = 0.7;
  }

  return segments;
}

/**
 * Extract segments from Event JSON structure
 */
function extractSegmentsFromEventJson(eventJson: any): EventSegment[] {
  const segments: EventSegment[] = [];

  // Handle different Event JSON structures
  if (eventJson.scenes) {
    // Scene-based structure
    for (const scene of eventJson.scenes) {
      segments.push({
        start: scene.start || scene.startTime || 0,
        end: scene.end || scene.endTime || scene.start + 5,
        type: "scene",
        features: extractFeaturesFromScene(scene),
      });
    }
  }

  if (eventJson.segments) {
    // Segment-based structure
    for (const seg of eventJson.segments) {
      segments.push({
        start: seg.start || seg.startTime || 0,
        end: seg.end || seg.endTime || seg.start + 5,
        type: seg.type || "segment",
        features: seg.features || extractFeaturesFromScene(seg),
      });
    }
  }

  if (eventJson.chapters) {
    // Chapter-based structure
    for (const chapter of eventJson.chapters) {
      segments.push({
        start: chapter.start || chapter.startTime || 0,
        end: chapter.end || chapter.endTime || chapter.start + 30,
        type: "chapter",
        features: extractFeaturesFromScene(chapter),
      });
    }
  }

  // If no structured data, create segments from duration
  if (segments.length === 0 && eventJson.duration) {
    const segmentDuration = 10; // 10 seconds per segment
    for (let start = 0; start < eventJson.duration; start += segmentDuration) {
      segments.push({
        start,
        end: Math.min(start + segmentDuration, eventJson.duration),
        type: "auto",
        features: {
          action_intensity: Math.random() * 0.5 + 0.25,
          face_presence: Math.random() * 0.5 + 0.25,
          audio_energy: Math.random() * 0.5 + 0.25,
          text_density: Math.random() * 0.3,
          scene_change: Math.random() * 0.3,
        },
      });
    }
  }

  return segments;
}

/**
 * Extract features from a scene/segment object
 */
function extractFeaturesFromScene(scene: any): EventSegment["features"] {
  return {
    action_intensity: scene.actionIntensity || scene.action_intensity || scene.features?.action_intensity || 0.5,
    face_presence: scene.facePresence || scene.face_presence || scene.features?.face_presence || (scene.faces?.length > 0 ? 0.8 : 0.2),
    audio_energy: scene.audioEnergy || scene.audio_energy || scene.features?.audio_energy || 0.5,
    text_density: scene.textDensity || scene.text_density || scene.features?.text_density || (scene.text ? 0.6 : 0.2),
    scene_change: scene.sceneChange || scene.scene_change || scene.features?.scene_change || 0.3,
  };
}

/**
 * Score segments using weighted features
 */
function scoreSegments(segments: EventSegment[], weights: Record<string, number>): ScoredSegment[] {
  return segments.map((segment) => {
    const features = segment.features || {};

    // Calculate weighted score
    let score = 0;
    let totalWeight = 0;

    for (const [key, weight] of Object.entries(weights)) {
      const featureValue = features[key as keyof typeof features] || 0;
      score += featureValue * weight;
      totalWeight += weight;
    }

    // Normalize score to 0-1 range
    if (totalWeight > 0) {
      score = score / totalWeight;
    }

    // Clamp score between 0 and 1
    score = Math.max(0, Math.min(1, score));

    return {
      start: segment.start,
      end: segment.end,
      score,
      features: features as Record<string, number>,
    };
  }).sort((a, b) => b.score - a.score); // Sort by score descending
}
