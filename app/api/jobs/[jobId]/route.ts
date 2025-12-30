import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasProjectAccess } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await context.params;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      video: {
        select: { id: true, projectId: true, sourceUrl: true },
      },
      artifacts: {
        orderBy: { createdAt: "desc" },
      },
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      reviews: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const hasAccess = await hasProjectAccess(session.user.id, job.video.projectId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ job });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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

  const body = await request.json();
  const { status, progress, stage, error, result } = body;

  const updateData: Record<string, unknown> = {};

  if (status !== undefined) {
    updateData.status = status;
    if (status === "RUNNING" && !job.startedAt) {
      updateData.startedAt = new Date();
    }
    if (status === "SUCCEEDED" || status === "FAILED" || status === "CANCELED") {
      updateData.completedAt = new Date();
    }
  }
  if (progress !== undefined) updateData.progress = progress;
  if (stage !== undefined) updateData.stage = stage;
  if (error !== undefined) updateData.error = error;
  if (result !== undefined) updateData.result = result;

  const updatedJob = await prisma.job.update({
    where: { id: jobId },
    data: updateData,
  });

  return NextResponse.json({ job: updatedJob });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
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

  // Only allow canceling pending/queued jobs
  if (!["PENDING", "QUEUED"].includes(job.status)) {
    return NextResponse.json(
      { error: "Can only cancel pending or queued jobs" },
      { status: 400 }
    );
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "CANCELED",
      completedAt: new Date(),
    },
  });

  return NextResponse.json({ canceled: true });
}
