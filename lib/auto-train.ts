/**
 * Auto-Training Module
 * Automatically triggers TRAIN job when sufficient feedback is collected
 */

import { prisma } from "./prisma";
import { enqueueJob } from "./queue";

// Configuration
const AUTO_TRAIN_CONFIG = {
  // Minimum feedback count to trigger training
  minFeedbackCount: 50,
  // Minimum positive feedback ratio (rating >= 4)
  minPositiveRatio: 0.3,
  // Minimum time since last training (in hours)
  minHoursSinceLastTrain: 24,
  // Minimum new feedback since last training
  minNewFeedbackSinceLastTrain: 20,
};

export interface AutoTrainResult {
  triggered: boolean;
  reason?: string;
  jobId?: string;
  stats?: {
    totalFeedback: number;
    positiveRatio: number;
    newFeedbackCount: number;
    hoursSinceLastTrain: number | null;
  };
}

/**
 * Check conditions and trigger auto-training if appropriate
 */
export async function checkAndTriggerAutoTrain(): Promise<AutoTrainResult> {
  // Get last completed training job
  const lastTrainingJob = await prisma.job.findFirst({
    where: {
      type: "TRAIN",
      status: "SUCCEEDED",
    },
    orderBy: { completedAt: "desc" },
  });

  const lastTrainTime = lastTrainingJob?.completedAt;
  const hoursSinceLastTrain = lastTrainTime
    ? (Date.now() - lastTrainTime.getTime()) / (1000 * 60 * 60)
    : null;

  // Check if training is already in progress
  const runningTrainJob = await prisma.job.findFirst({
    where: {
      type: "TRAIN",
      status: { in: ["PENDING", "QUEUED", "RUNNING"] },
    },
  });

  if (runningTrainJob) {
    return {
      triggered: false,
      reason: "Training job already in progress",
    };
  }

  // Get feedback statistics
  const allFeedback = await prisma.highlightFeedback.findMany({
    select: { rating: true, createdAt: true },
  });

  const totalFeedback = allFeedback.length;
  const positiveCount = allFeedback.filter((f) => f.rating >= 4).length;
  const positiveRatio = totalFeedback > 0 ? positiveCount / totalFeedback : 0;

  // Count new feedback since last training
  const newFeedbackCount = lastTrainTime
    ? allFeedback.filter((f) => f.createdAt > lastTrainTime).length
    : totalFeedback;

  const stats = {
    totalFeedback,
    positiveRatio,
    newFeedbackCount,
    hoursSinceLastTrain,
  };

  // Check minimum feedback count
  if (totalFeedback < AUTO_TRAIN_CONFIG.minFeedbackCount) {
    return {
      triggered: false,
      reason: `Insufficient feedback (${totalFeedback} < ${AUTO_TRAIN_CONFIG.minFeedbackCount})`,
      stats,
    };
  }

  // Check positive ratio
  if (positiveRatio < AUTO_TRAIN_CONFIG.minPositiveRatio) {
    return {
      triggered: false,
      reason: `Low positive ratio (${(positiveRatio * 100).toFixed(1)}% < ${AUTO_TRAIN_CONFIG.minPositiveRatio * 100}%)`,
      stats,
    };
  }

  // Check time since last training
  if (
    hoursSinceLastTrain !== null &&
    hoursSinceLastTrain < AUTO_TRAIN_CONFIG.minHoursSinceLastTrain
  ) {
    return {
      triggered: false,
      reason: `Too soon since last training (${hoursSinceLastTrain.toFixed(1)}h < ${AUTO_TRAIN_CONFIG.minHoursSinceLastTrain}h)`,
      stats,
    };
  }

  // Check new feedback count
  if (newFeedbackCount < AUTO_TRAIN_CONFIG.minNewFeedbackSinceLastTrain) {
    return {
      triggered: false,
      reason: `Insufficient new feedback (${newFeedbackCount} < ${AUTO_TRAIN_CONFIG.minNewFeedbackSinceLastTrain})`,
      stats,
    };
  }

  // All conditions met - trigger training
  const result = await triggerTraining(stats);

  return {
    triggered: true,
    jobId: result.jobId,
    stats,
  };
}

/**
 * Actually create and enqueue the training job
 */
async function triggerTraining(stats: {
  totalFeedback: number;
  positiveRatio: number;
}): Promise<{ jobId: string }> {
  // Get current model weights
  const currentWeights = await prisma.modelWeights.findFirst({
    where: { active: true },
    orderBy: { version: "desc" },
  });

  const newVersion = (currentWeights?.version || 0) + 1;

  // Get system project for training jobs
  let systemProject = await prisma.project.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!systemProject) {
    throw new Error("No project available for training job");
  }

  // Find or create a system video for training jobs
  let systemVideo = await prisma.video.findFirst({
    where: {
      projectId: systemProject.id,
      sourceUrl: "system://training",
    },
  });

  if (!systemVideo) {
    systemVideo = await prisma.video.create({
      data: {
        projectId: systemProject.id,
        sourceType: "URL",
        sourceUrl: "system://training",
        status: "READY",
      },
    });
  }

  // Create the training job
  const job = await prisma.job.create({
    data: {
      videoId: systemVideo.id,
      type: "TRAIN",
      status: "QUEUED",
      config: {
        feedbackCount: stats.totalFeedback,
        positiveRatio: stats.positiveRatio,
        targetVersion: newVersion,
        baseWeightsId: currentWeights?.id,
        triggeredBy: "auto",
      },
    },
  });

  // Enqueue the job
  try {
    await enqueueJob({
      jobId: job.id,
      jobType: "TRAIN",
    });
  } catch (error) {
    console.error("Failed to enqueue auto-training job:", error);
    // Update job status to indicate queue failure
    await prisma.job.update({
      where: { id: job.id },
      data: { error: "Failed to enqueue" },
    });
  }

  console.log(`[Auto-Train] Triggered training job ${job.id} (version ${newVersion})`);

  return { jobId: job.id };
}

/**
 * Get auto-training status and configuration
 */
export async function getAutoTrainStatus(): Promise<{
  config: typeof AUTO_TRAIN_CONFIG;
  lastTraining: {
    jobId: string;
    completedAt: string;
    version: number;
  } | null;
  currentStats: {
    totalFeedback: number;
    positiveRatio: number;
    activeVersion: number | null;
  };
  nextTrainingEligible: boolean;
}> {
  // Get last training
  const lastTrainingJob = await prisma.job.findFirst({
    where: {
      type: "TRAIN",
      status: "SUCCEEDED",
    },
    orderBy: { completedAt: "desc" },
    select: {
      id: true,
      completedAt: true,
      result: true,
    },
  });

  // Get current weights
  const activeWeights = await prisma.modelWeights.findFirst({
    where: { active: true },
    orderBy: { version: "desc" },
  });

  // Get feedback stats
  const feedback = await prisma.highlightFeedback.findMany({
    select: { rating: true },
  });

  const totalFeedback = feedback.length;
  const positiveRatio =
    totalFeedback > 0
      ? feedback.filter((f) => f.rating >= 4).length / totalFeedback
      : 0;

  // Check eligibility
  const checkResult = await checkAndTriggerAutoTrain().catch(() => ({
    triggered: false,
  }));

  return {
    config: AUTO_TRAIN_CONFIG,
    lastTraining: lastTrainingJob
      ? {
          jobId: lastTrainingJob.id,
          completedAt: lastTrainingJob.completedAt?.toISOString() || "",
          version: (lastTrainingJob.result as any)?.newVersion || 0,
        }
      : null,
    currentStats: {
      totalFeedback,
      positiveRatio,
      activeVersion: activeWeights?.version || null,
    },
    nextTrainingEligible: !checkResult.triggered,
  };
}
