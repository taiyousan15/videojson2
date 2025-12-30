import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasProjectAccess } from "@/lib/rbac";
import { enqueueJob } from "@/lib/queue";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await context.params;

  const hasAccess = await hasProjectAccess(session.user.id, projectId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const videos = await prisma.video.findMany({
    where: { projectId },
    include: {
      _count: { select: { jobs: true, artifacts: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ videos });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await context.params;

  const hasAccess = await hasProjectAccess(session.user.id, projectId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { sourceUrl, sourceType = "URL", autoEnqueue = false } = body;

  if (sourceType === "URL" && !sourceUrl) {
    return NextResponse.json(
      { error: "sourceUrl is required for URL type" },
      { status: 400 }
    );
  }

  // Create video record
  const video = await prisma.video.create({
    data: {
      projectId,
      sourceType: sourceType as "URL" | "UPLOAD",
      sourceUrl: sourceUrl || null,
      status: "PENDING",
    },
  });

  // Create INGEST job automatically
  const job = await prisma.job.create({
    data: {
      videoId: video.id,
      type: "INGEST",
      status: autoEnqueue ? "QUEUED" : "PENDING",
      config: {
        sourceUrl: sourceUrl,
        sourceType: sourceType,
      },
      createdById: session.user.id,
    },
  });

  // Auto-enqueue if requested
  let taskName: string | undefined;
  if (autoEnqueue) {
    try {
      taskName = await enqueueJob({
        jobId: job.id,
        jobType: job.type,
      });

      await prisma.job.update({
        where: { id: job.id },
        data: { taskName },
      });
    } catch (error) {
      console.error("Failed to auto-enqueue job:", error);
      // Revert to PENDING if enqueue fails
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "PENDING" },
      });
    }
  }

  return NextResponse.json(
    {
      video,
      job: {
        id: job.id,
        type: job.type,
        status: autoEnqueue && taskName ? "QUEUED" : "PENDING",
        taskName,
      },
    },
    { status: 201 }
  );
}
