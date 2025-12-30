/**
 * TRAIN Job - 学習ループ
 *
 * ハイライトフィードバックを使用してスコアリング重みを更新
 * 特徴量ベースの学習、検証セット評価、ロールバック機能を含む
 */

import { prisma } from "../db";
import { updateProgress } from "../tasks/progress";
import { downloadJSON, uploadJSON, getDefaultBucket, buildGcsUri } from "../utils/gcs";

// Feature names for highlight scoring
const FEATURE_NAMES = [
  "action_intensity",
  "face_presence",
  "audio_energy",
  "text_density",
  "scene_change",
] as const;

type FeatureName = (typeof FEATURE_NAMES)[number];

interface TrainingConfig {
  /** Learning rate for weight updates */
  learningRate?: number;
  /** Fraction of data to use for validation (0-1) */
  validationSplit?: number;
  /** Minimum improvement required to accept new weights */
  minImprovement?: number;
  /** Maximum number of iterations */
  maxIterations?: number;
  /** Enable auto-rollback if validation performance decreases */
  autoRollback?: boolean;
}

interface FeedbackWithFeatures {
  rating: number;
  features: Record<FeatureName, number>;
  segmentId: string;
  videoId: string;
}

interface TrainingResult {
  previousVersion: number | null;
  newVersion: number;
  feedbackCount: number;
  trainCount: number;
  validationCount: number;
  weights: Record<FeatureName, number>;
  metrics: {
    trainMSE: number;
    validationMSE: number;
    improvement: number;
  };
  rolledBack: boolean;
}

export async function runTrain(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job) throw new Error(`Job not found: ${jobId}`);

  const config: TrainingConfig = (job.config as TrainingConfig) || {};
  const {
    learningRate = 0.01,
    validationSplit = 0.2,
    minImprovement = 0.01,
    maxIterations = 100,
    autoRollback = true,
  } = config;

  await updateProgress(jobId, 5, "loading_feedback");

  // Load all highlight feedback with associated segment features
  const feedbackData = await loadFeedbackWithFeatures();

  if (feedbackData.length < 10) {
    throw new Error(`Insufficient feedback data: ${feedbackData.length} samples (minimum 10 required)`);
  }

  console.log(`[Train] Loaded ${feedbackData.length} feedback samples with features`);

  await updateProgress(jobId, 15, "splitting_data");

  // Split into training and validation sets
  const shuffled = [...feedbackData].sort(() => Math.random() - 0.5);
  const splitIndex = Math.floor(shuffled.length * (1 - validationSplit));
  const trainSet = shuffled.slice(0, splitIndex);
  const validSet = shuffled.slice(splitIndex);

  console.log(`[Train] Train set: ${trainSet.length}, Validation set: ${validSet.length}`);

  await updateProgress(jobId, 25, "loading_current_weights");

  // Load current active weights
  const currentWeights = await prisma.modelWeights.findFirst({
    where: { name: "highlight_scorer", active: true },
    orderBy: { version: "desc" },
  });

  const baseWeights: Record<FeatureName, number> = (currentWeights?.weights as any) || {
    action_intensity: 0.3,
    face_presence: 0.2,
    audio_energy: 0.2,
    text_density: 0.15,
    scene_change: 0.15,
  };

  // Calculate baseline metrics
  const baselineTrainMSE = calculateMSE(trainSet, baseWeights);
  const baselineValidMSE = calculateMSE(validSet, baseWeights);

  console.log(`[Train] Baseline - Train MSE: ${baselineTrainMSE.toFixed(4)}, Valid MSE: ${baselineValidMSE.toFixed(4)}`);

  await updateProgress(jobId, 35, "training");

  // Gradient descent optimization
  let weights = { ...baseWeights };
  let bestWeights = { ...weights };
  let bestValidMSE = baselineValidMSE;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Compute gradients
    const gradients = computeGradients(trainSet, weights);

    // Update weights with learning rate
    for (const feature of FEATURE_NAMES) {
      weights[feature] -= learningRate * gradients[feature];
      // Clamp to [0, 1]
      weights[feature] = Math.max(0, Math.min(1, weights[feature]));
    }

    // Normalize weights to sum to 1
    weights = normalizeWeights(weights);

    // Check validation performance every 10 iterations
    if (iter % 10 === 0) {
      const validMSE = calculateMSE(validSet, weights);
      if (validMSE < bestValidMSE) {
        bestValidMSE = validMSE;
        bestWeights = { ...weights };
      }

      const progress = 35 + Math.floor((iter / maxIterations) * 40);
      await updateProgress(jobId, progress, "training");
    }
  }

  // Use best weights from training
  const newWeights = bestWeights;
  const finalTrainMSE = calculateMSE(trainSet, newWeights);
  const finalValidMSE = calculateMSE(validSet, newWeights);

  console.log(`[Train] Final - Train MSE: ${finalTrainMSE.toFixed(4)}, Valid MSE: ${finalValidMSE.toFixed(4)}`);

  await updateProgress(jobId, 80, "evaluating");

  // Calculate improvement
  const improvement = (baselineValidMSE - finalValidMSE) / baselineValidMSE;
  console.log(`[Train] Improvement: ${(improvement * 100).toFixed(2)}%`);

  // Check if we should rollback
  let rolledBack = false;
  let weightsToSave = newWeights;

  if (autoRollback && improvement < minImprovement) {
    console.log(`[Train] Improvement ${(improvement * 100).toFixed(2)}% < ${(minImprovement * 100).toFixed(2)}%, rolling back`);
    weightsToSave = baseWeights;
    rolledBack = true;
  }

  await updateProgress(jobId, 90, "saving_weights");

  // Create new weights version (even if rolled back, for audit trail)
  const newVersion = (currentWeights?.version || 0) + 1;

  // Deactivate old weights
  if (currentWeights) {
    await prisma.modelWeights.update({
      where: { id: currentWeights.id },
      data: { active: false },
    });
  }

  // Create new active weights
  await prisma.modelWeights.create({
    data: {
      name: "highlight_scorer",
      version: newVersion,
      weights: weightsToSave,
      active: true,
    },
  });

  // Save training metrics as artifact
  const bucket = getDefaultBucket();
  const metricsPath = `training/${jobId}/metrics.json`;
  const metricsUri = buildGcsUri(bucket, metricsPath);

  const trainingMetrics = {
    jobId,
    timestamp: new Date().toISOString(),
    config,
    dataSize: {
      total: feedbackData.length,
      train: trainSet.length,
      validation: validSet.length,
    },
    baseline: {
      trainMSE: baselineTrainMSE,
      validMSE: baselineValidMSE,
      weights: baseWeights,
    },
    final: {
      trainMSE: finalTrainMSE,
      validMSE: finalValidMSE,
      weights: newWeights,
    },
    improvement,
    rolledBack,
    savedWeights: weightsToSave,
    newVersion,
  };

  await uploadJSON(metricsUri, trainingMetrics);

  // Create artifact
  await prisma.artifact.create({
    data: {
      jobId,
      videoId: null,
      type: "TRAINING_METRICS",
      gcsUri: metricsUri,
      metadata: {
        version: newVersion,
        feedbackCount: feedbackData.length,
        improvement,
        rolledBack,
      },
    },
  });

  // Update job result
  const result: TrainingResult = {
    previousVersion: currentWeights?.version || null,
    newVersion,
    feedbackCount: feedbackData.length,
    trainCount: trainSet.length,
    validationCount: validSet.length,
    weights: weightsToSave,
    metrics: {
      trainMSE: finalTrainMSE,
      validationMSE: finalValidMSE,
      improvement,
    },
    rolledBack,
  };

  await prisma.job.update({
    where: { id: jobId },
    data: { result: JSON.parse(JSON.stringify(result)) },
  });

  await updateProgress(jobId, 100, "completed");

  console.log(`[Train] Completed - Version ${newVersion}, Rolled back: ${rolledBack}`);
}

/**
 * Load feedback data with associated segment features
 */
async function loadFeedbackWithFeatures(): Promise<FeedbackWithFeatures[]> {
  const feedbacks = await prisma.highlightFeedback.findMany({
    orderBy: { createdAt: "desc" },
    take: 5000, // Last 5000 feedbacks
  });

  const results: FeedbackWithFeatures[] = [];

  // Group feedbacks by video for efficient artifact loading
  const feedbacksByVideo = new Map<string, typeof feedbacks>();
  for (const fb of feedbacks) {
    const existing = feedbacksByVideo.get(fb.videoId) || [];
    existing.push(fb);
    feedbacksByVideo.set(fb.videoId, existing);
  }

  // Load highlight plans for each video
  for (const [videoId, videoFeedbacks] of Array.from(feedbacksByVideo)) {
    try {
      // Find highlight plan artifact
      const highlightArtifact = await prisma.artifact.findFirst({
        where: { videoId, type: "HIGHLIGHT_PLAN" },
        orderBy: { createdAt: "desc" },
      });

      if (!highlightArtifact?.gcsUri) continue;

      // Download highlight plan
      const plan = await downloadJSON<any>(highlightArtifact.gcsUri);
      if (!plan?.candidates) continue;

      // Build segment lookup
      const segmentMap = new Map<string, any>();
      for (const candidate of plan.candidates) {
        segmentMap.set(candidate.id, candidate);
      }

      // Match feedbacks to segments
      for (const fb of videoFeedbacks) {
        const segment = segmentMap.get(fb.segmentId);
        if (segment?.features) {
          results.push({
            rating: fb.rating,
            features: {
              action_intensity: segment.features.action_intensity || 0,
              face_presence: segment.features.face_presence || 0,
              audio_energy: segment.features.audio_energy || 0,
              text_density: segment.features.text_density || 0,
              scene_change: segment.features.scene_change || 0,
            },
            segmentId: fb.segmentId,
            videoId: fb.videoId,
          });
        }
      }
    } catch (error) {
      console.warn(`[Train] Failed to load features for video ${videoId}:`, error);
    }
  }

  return results;
}

/**
 * Calculate MSE between predicted scores and ratings
 */
function calculateMSE(
  data: FeedbackWithFeatures[],
  weights: Record<FeatureName, number>
): number {
  if (data.length === 0) return 0;

  let sumSquaredError = 0;

  for (const sample of data) {
    // Predicted score (0-1) based on weights
    let predictedScore = 0;
    for (const feature of FEATURE_NAMES) {
      predictedScore += weights[feature] * (sample.features[feature] || 0);
    }

    // Normalize rating to 0-1 (rating is 1-5)
    const normalizedRating = (sample.rating - 1) / 4;

    const error = predictedScore - normalizedRating;
    sumSquaredError += error * error;
  }

  return sumSquaredError / data.length;
}

/**
 * Compute gradients for weight update
 */
function computeGradients(
  data: FeedbackWithFeatures[],
  weights: Record<FeatureName, number>
): Record<FeatureName, number> {
  const gradients: Record<FeatureName, number> = {
    action_intensity: 0,
    face_presence: 0,
    audio_energy: 0,
    text_density: 0,
    scene_change: 0,
  };

  if (data.length === 0) return gradients;

  for (const sample of data) {
    // Predicted score
    let predictedScore = 0;
    for (const feature of FEATURE_NAMES) {
      predictedScore += weights[feature] * (sample.features[feature] || 0);
    }

    // Normalize rating
    const normalizedRating = (sample.rating - 1) / 4;

    // Error
    const error = predictedScore - normalizedRating;

    // Gradient for each feature: 2 * error * feature_value / n
    for (const feature of FEATURE_NAMES) {
      gradients[feature] += (2 * error * (sample.features[feature] || 0)) / data.length;
    }
  }

  return gradients;
}

/**
 * Normalize weights to sum to 1
 */
function normalizeWeights(weights: Record<FeatureName, number>): Record<FeatureName, number> {
  const sum = FEATURE_NAMES.reduce((acc, f) => acc + weights[f], 0);
  if (sum === 0) {
    // Return uniform weights if all are zero
    const uniform = 1 / FEATURE_NAMES.length;
    return FEATURE_NAMES.reduce((acc, f) => ({ ...acc, [f]: uniform }), {} as Record<FeatureName, number>);
  }

  return FEATURE_NAMES.reduce(
    (acc, f) => ({ ...acc, [f]: weights[f] / sum }),
    {} as Record<FeatureName, number>
  );
}
