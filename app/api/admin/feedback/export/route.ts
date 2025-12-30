import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

// GET /api/admin/feedback/export - Export all feedback for model training
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const format = searchParams.get("format") || "json";
  const minRating = parseInt(searchParams.get("minRating") || "0");
  const fromDate = searchParams.get("from");
  const toDate = searchParams.get("to");

  // Build filter
  const where: any = {};
  if (minRating > 0) {
    where.rating = { gte: minRating };
  }
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) {
      where.createdAt.gte = new Date(fromDate);
    }
    if (toDate) {
      where.createdAt.lte = new Date(toDate);
    }
  }

  // Get all feedback with related data
  const feedback = await prisma.highlightFeedback.findMany({
    where,
    include: {
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Get video info for each feedback
  const videoIds = [...new Set(feedback.map((f) => f.videoId))];
  const videos = await prisma.video.findMany({
    where: { id: { in: videoIds } },
    select: {
      id: true,
      sourceUrl: true,
      duration: true,
      artifacts: {
        where: { type: "HIGHLIGHT_PLAN" },
        select: { gcsUri: true },
        take: 1,
      },
    },
  });

  const videoMap = new Map(videos.map((v) => [v.id, v]));

  // Format for training
  const trainingData = feedback.map((f) => {
    const video = videoMap.get(f.videoId);
    return {
      segmentId: f.segmentId,
      videoId: f.videoId,
      rating: f.rating,
      comment: f.comment,
      isPositive: f.rating >= 4, // 4-5 is positive
      isNegative: f.rating <= 2, // 1-2 is negative
      reviewerId: f.createdBy.id,
      createdAt: f.createdAt.toISOString(),
      videoSourceUrl: video?.sourceUrl,
      videoDuration: video?.duration,
      highlightPlanUri: video?.artifacts[0]?.gcsUri,
    };
  });

  // Statistics
  const stats = {
    totalFeedback: feedback.length,
    positiveCount: trainingData.filter((d) => d.isPositive).length,
    negativeCount: trainingData.filter((d) => d.isNegative).length,
    neutralCount: trainingData.filter((d) => !d.isPositive && !d.isNegative).length,
    avgRating: feedback.length > 0
      ? feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length
      : 0,
    uniqueVideos: videoIds.length,
    uniqueReviewers: new Set(feedback.map((f) => f.createdById)).size,
    dateRange: {
      from: feedback.length > 0 ? feedback[feedback.length - 1].createdAt : null,
      to: feedback.length > 0 ? feedback[0].createdAt : null,
    },
  };

  if (format === "csv") {
    // Generate CSV
    const headers = [
      "segmentId",
      "videoId",
      "rating",
      "isPositive",
      "isNegative",
      "comment",
      "createdAt",
    ];
    const rows = trainingData.map((d) => [
      d.segmentId,
      d.videoId,
      d.rating,
      d.isPositive,
      d.isNegative,
      d.comment?.replace(/"/g, '""') || "",
      d.createdAt,
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((r) => r.map((c) => `"${c}"`).join(",")),
    ].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=feedback-export-${new Date().toISOString().split("T")[0]}.csv`,
      },
    });
  }

  return NextResponse.json({
    stats,
    data: trainingData,
    exportedAt: new Date().toISOString(),
  });
}
