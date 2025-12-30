import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { enqueueJob } from "@/lib/queue";

// POST /api/admin/train - Trigger model training with feedback data
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { minFeedbackCount = 100, minPositiveRatio = 0.3 } = body;

  // Get feedback statistics
  const feedback = await prisma.highlightFeedback.findMany({
    select: { rating: true },
  });

  const totalFeedback = feedback.length;
  const positiveCount = feedback.filter((f) => f.rating >= 4).length;
  const positiveRatio = totalFeedback > 0 ? positiveCount / totalFeedback : 0;

  // Validate training conditions
  if (totalFeedback < minFeedbackCount) {
    return NextResponse.json(
      {
        error: "Insufficient feedback data",
        currentCount: totalFeedback,
        requiredCount: minFeedbackCount,
      },
      { status: 400 }
    );
  }

  if (positiveRatio < minPositiveRatio) {
    return NextResponse.json(
      {
        error: "Insufficient positive feedback ratio",
        currentRatio: positiveRatio,
        requiredRatio: minPositiveRatio,
      },
      { status: 400 }
    );
  }

  // Get current model weights
  const currentWeights = await prisma.modelWeights.findFirst({
    where: { active: true },
    orderBy: { version: "desc" },
  });

  const newVersion = currentWeights ? currentWeights.version + 1 : 1;

  // Get system project for training jobs
  const systemProject = await prisma.project.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!systemProject) {
    return NextResponse.json(
      { error: "No project available for training job" },
      { status: 400 }
    );
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
        feedbackCount: totalFeedback,
        positiveRatio,
        targetVersion: newVersion,
        baseWeightsId: currentWeights?.id,
      },
      createdById: session.user.id,
    },
  });

  // Enqueue the job
  try {
    await enqueueJob({
      jobId: job.id,
      jobType: "TRAIN",
    });
  } catch (error) {
    console.error("Failed to enqueue training job:", error);
  }

  return NextResponse.json(
    {
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        config: job.config,
      },
      trainingStats: {
        feedbackCount: totalFeedback,
        positiveCount,
        positiveRatio,
        targetVersion: newVersion,
      },
    },
    { status: 201 }
  );
}

// GET /api/admin/train - Get training status and history
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get training jobs
  const trainingJobs = await prisma.job.findMany({
    where: { type: "TRAIN" },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      createdBy: { select: { name: true, email: true } },
    },
  });

  // Get model weights history
  const modelWeights = await prisma.modelWeights.findMany({
    orderBy: { version: "desc" },
    take: 5,
  });

  // Get feedback stats
  const feedback = await prisma.highlightFeedback.findMany({
    select: { rating: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const stats = {
    totalFeedback: feedback.length,
    positiveCount: feedback.filter((f) => f.rating >= 4).length,
    negativeCount: feedback.filter((f) => f.rating <= 2).length,
    avgRating: feedback.length > 0
      ? feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length
      : 0,
    lastFeedback: feedback.length > 0 ? feedback[0].createdAt : null,
  };

  return NextResponse.json({
    stats,
    trainingJobs: trainingJobs.map((j) => ({
      id: j.id,
      status: j.status,
      progress: j.progress,
      config: j.config,
      createdAt: j.createdAt,
      createdBy: j.createdBy,
    })),
    modelWeights: modelWeights.map((w) => ({
      id: w.id,
      name: w.name,
      version: w.version,
      active: w.active,
      createdAt: w.createdAt,
    })),
  });
}
