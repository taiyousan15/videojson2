import { prisma } from "../db";

export async function updateProgress(
  jobId: string,
  progress: number,
  stage?: string
): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      progress: Math.min(100, Math.max(0, progress)),
      stage,
    },
  });
}

export async function setWaitingExternal(
  jobId: string,
  stage: string
): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "WAITING_EXTERNAL",
      stage,
    },
  });
}

export async function setReviewRequired(
  jobId: string,
  stage: string
): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "REVIEW_REQUIRED",
      stage,
    },
  });
}

export async function resumeFromWaiting(jobId: string): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "RUNNING",
    },
  });
}
