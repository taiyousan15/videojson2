import { dispatch } from "./dispatcher";
import { prisma } from "../db";
import { JobType } from "../../../shared/types";
import {
  notifyJobStarted,
  notifyJobCompleted,
  notifyJobFailed,
} from "../services/webhook";
import { createJobLogger } from "../utils/logger";

export async function executeTask(jobId: string, jobType: string): Promise<void> {
  const startTime = Date.now();

  // Get job with video and project info for webhook notifications
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      video: {
        select: { id: true, projectId: true },
      },
    },
  });

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const videoId = job.video.id;
  const projectId = job.video.projectId;

  // Create job-scoped logger
  const log = createJobLogger(jobId, jobType, videoId, projectId);

  log.jobStarted(jobId, jobType);

  // Update job status to RUNNING
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  // Send job started webhook
  await notifyJobStarted(jobId, videoId, projectId, jobType).catch((err) =>
    log.warn("Webhook notification failed", undefined, err)
  );

  try {
    const result = await dispatch(jobId, jobType as JobType);

    const durationMs = Date.now() - startTime;

    // Mark as succeeded
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "SUCCEEDED",
        completedAt: new Date(),
        progress: 100,
        result: result as any,
      },
    });

    log.jobCompleted(jobId, jobType, durationMs);

    // Send job completed webhook
    await notifyJobCompleted(jobId, videoId, projectId, jobType, result).catch((err) =>
      log.warn("Webhook notification failed", undefined, err)
    );
  } catch (error: any) {
    log.jobFailed(jobId, jobType, error);

    // Mark as failed
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        error: error.message,
        completedAt: new Date(),
      },
    });

    // Send job failed webhook
    await notifyJobFailed(jobId, videoId, projectId, jobType, error.message).catch((err) =>
      log.warn("Webhook notification failed", undefined, err)
    );

    throw error;
  }
}
