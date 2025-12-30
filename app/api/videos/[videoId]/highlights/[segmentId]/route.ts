import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasProjectAccess } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ videoId: string; segmentId: string }>;
};

// GET /api/videos/[videoId]/highlights/[segmentId] - Get feedback for specific segment
export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { videoId, segmentId } = await context.params;

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

  const feedback = await prisma.highlightFeedback.findMany({
    where: {
      videoId,
      segmentId,
    },
    include: {
      createdBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Calculate average rating
  const avgRating =
    feedback.length > 0
      ? feedback.reduce((sum, fb) => sum + fb.rating, 0) / feedback.length
      : null;

  return NextResponse.json({
    segmentId,
    feedback,
    averageRating: avgRating,
    totalFeedback: feedback.length,
  });
}

// DELETE /api/videos/[videoId]/highlights/[segmentId] - Delete user's feedback
export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { videoId, segmentId } = await context.params;

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

  // Delete only the current user's feedback
  const deleted = await prisma.highlightFeedback.deleteMany({
    where: {
      videoId,
      segmentId,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({
    deleted: deleted.count,
    message: `Deleted ${deleted.count} feedback entries`,
  });
}
