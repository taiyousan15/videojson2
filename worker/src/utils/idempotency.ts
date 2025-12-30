import { prisma } from "../db";
import { JobStatus } from "../../../shared/types";

export async function checkIdempotency(jobId: string): Promise<{
  shouldRun: boolean;
  status?: JobStatus;
}> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { status: true },
  });

  if (!job) {
    return { shouldRun: false };
  }

  const status = job.status as JobStatus;

  // Already completed - don't run again
  if (status === "SUCCEEDED" || status === "CANCELED") {
    return { shouldRun: false, status };
  }

  // Can run
  return { shouldRun: true, status };
}

export async function acquireLock(
  jobId: string,
  workerId: string
): Promise<boolean> {
  // Optimistic locking using status update
  try {
    const result = await prisma.job.updateMany({
      where: {
        id: jobId,
        status: { in: ["PENDING", "QUEUED"] },
      },
      data: {
        status: "RUNNING",
        stage: `locked by ${workerId}`,
      },
    });

    return result.count > 0;
  } catch {
    return false;
  }
}

export async function releaseLock(jobId: string): Promise<void> {
  // No explicit release needed - status is updated on completion/failure
}
