import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasProjectAccess } from "@/lib/rbac";
import { enqueueJob } from "@/lib/queue";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await context.params;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      video: { select: { projectId: true } },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const hasAccess = await hasProjectAccess(session.user.id, job.video.projectId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only allow enqueuing pending jobs
  if (job.status !== "PENDING") {
    return NextResponse.json(
      { error: "Can only enqueue pending jobs" },
      { status: 400 }
    );
  }

  // Update job status to QUEUED
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "QUEUED" },
  });

  // Enqueue to worker
  try {
    const taskName = await enqueueJob({
      jobId: job.id,
      jobType: job.type,
    });

    // Store task name for tracking
    await prisma.job.update({
      where: { id: jobId },
      data: { taskName },
    });

    return NextResponse.json({
      queued: true,
      taskName,
    });
  } catch (error) {
    // Revert status on failure
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "PENDING" },
    });

    console.error("Failed to enqueue job:", error);
    return NextResponse.json(
      { error: "Failed to enqueue job" },
      { status: 500 }
    );
  }
}
