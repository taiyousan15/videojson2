import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

// Verify worker secret for security
function verifyWorkerAuth(request: NextRequest): boolean {
  const workerSecret = process.env.WORKER_SECRET;
  if (!workerSecret) {
    // In development, allow without secret
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${workerSecret}`;
}

// Worker callback to update job status
export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!verifyWorkerAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await context.params;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
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

  // If job succeeded, update video status
  if (status === "SUCCEEDED" && job.type === "INGEST") {
    await prisma.video.update({
      where: { id: job.videoId },
      data: { status: "READY" },
    });
  }

  // If job failed and it's INGEST, mark video as failed
  if (status === "FAILED" && job.type === "INGEST") {
    await prisma.video.update({
      where: { id: job.videoId },
      data: { status: "FAILED" },
    });
  }

  return NextResponse.json({ job: updatedJob });
}

// Worker callback to add artifact
export async function POST(request: NextRequest, context: RouteContext) {
  if (!verifyWorkerAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await context.params;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, videoId: true },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const body = await request.json();
  const { type, gcsUri, metadata } = body;

  if (!type || !gcsUri) {
    return NextResponse.json(
      { error: "type and gcsUri are required" },
      { status: 400 }
    );
  }

  const artifact = await prisma.artifact.create({
    data: {
      jobId: job.id,
      videoId: job.videoId,
      type,
      gcsUri,
      metadata: metadata || {},
    },
  });

  return NextResponse.json({ artifact }, { status: 201 });
}
