import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasProjectAccess } from "@/lib/rbac";
import { checkAndTriggerAutoTrain } from "@/lib/auto-train";

type RouteContext = {
  params: Promise<{ videoId: string }>;
};

// Highlight candidate from HIGHLIGHT_PLAN artifact
interface HighlightCandidate {
  segmentId: string;
  startTime: number;
  endTime: number;
  score: number;
  category: string;
  description: string;
  thumbnailUri?: string;
}

// GET /api/videos/[videoId]/highlights - Get highlight candidates with feedback
export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { videoId } = await context.params;

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { projectId: true },
  });

  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const hasAccess = await hasProjectAccess(session.user.id, video.projectId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get highlight plan artifact
  const highlightArtifact = await prisma.artifact.findFirst({
    where: {
      videoId,
      type: "HIGHLIGHT_PLAN",
    },
    orderBy: { createdAt: "desc" },
  });

  // Get all feedback for this video
  const feedback = await prisma.highlightFeedback.findMany({
    where: { videoId },
    include: {
      createdBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Create feedback map by segmentId
  const feedbackMap: Record<string, typeof feedback> = {};
  for (const fb of feedback) {
    if (!feedbackMap[fb.segmentId]) {
      feedbackMap[fb.segmentId] = [];
    }
    feedbackMap[fb.segmentId].push(fb);
  }

  // If no artifact, return empty with feedback
  if (!highlightArtifact) {
    return NextResponse.json({
      candidates: [],
      feedbackMap,
      artifactUri: null,
    });
  }

  // In production, fetch highlight candidates from GCS
  // For now, return artifact info and let frontend fetch
  return NextResponse.json({
    candidates: [], // Would be populated from GCS in production
    feedbackMap,
    artifactUri: highlightArtifact.gcsUri,
    artifactMetadata: highlightArtifact.metadata,
  });
}

// POST /api/videos/[videoId]/highlights - Submit feedback for a highlight
export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { videoId } = await context.params;

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { projectId: true },
  });

  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const hasAccess = await hasProjectAccess(session.user.id, video.projectId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { segmentId, rating, comment } = body;

  if (!segmentId || rating === undefined) {
    return NextResponse.json(
      { error: "segmentId and rating are required" },
      { status: 400 }
    );
  }

  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    return NextResponse.json(
      { error: "rating must be a number between 1 and 5" },
      { status: 400 }
    );
  }

  // Create feedback
  const feedback = await prisma.highlightFeedback.create({
    data: {
      videoId,
      segmentId,
      rating,
      comment: comment || null,
      createdById: session.user.id,
    },
    include: {
      createdBy: { select: { name: true, email: true } },
    },
  });

  // Check if auto-training should be triggered
  const autoTrainResult = await checkAndTriggerAutoTrain().catch((err) => {
    console.error("Auto-train check failed:", err);
    return null;
  });

  return NextResponse.json({
    feedback,
    autoTrain: autoTrainResult,
  }, { status: 201 });
}
