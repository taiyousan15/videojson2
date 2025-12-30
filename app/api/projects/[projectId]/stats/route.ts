import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasProjectAccess } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

// GET /api/projects/[projectId]/stats - Get project-specific statistics
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

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, createdAt: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Get date ranges
  const now = new Date();
  const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Parallel queries
  const [
    // Video stats
    totalVideos,
    videosThisWeek,
    videosByStatus,

    // Job stats
    totalJobs,
    jobsThisWeek,
    jobsByStatus,
    jobsByType,

    // Output stats
    totalOutputs,
    outputsThisWeek,

    // Feedback stats
    feedbackCount,

    // Total duration
    durationStats,

    // Recent videos
    recentVideos,

    // Recent jobs
    recentJobs,
  ] = await Promise.all([
    // Videos
    prisma.video.count({ where: { projectId } }),
    prisma.video.count({ where: { projectId, createdAt: { gte: thisWeek } } }),
    prisma.video.groupBy({
      by: ["status"],
      where: { projectId },
      _count: { status: true },
    }),

    // Jobs
    prisma.job.count({ where: { video: { projectId } } }),
    prisma.job.count({ where: { video: { projectId }, createdAt: { gte: thisWeek } } }),
    prisma.job.groupBy({
      by: ["status"],
      where: { video: { projectId } },
      _count: { status: true },
    }),
    prisma.job.groupBy({
      by: ["type"],
      where: { video: { projectId } },
      _count: { type: true },
    }),

    // Outputs
    prisma.output.count({ where: { video: { projectId } } }),
    prisma.output.count({ where: { video: { projectId }, createdAt: { gte: thisWeek } } }),

    // Feedback - need to get video IDs first
    prisma.video.findMany({ where: { projectId }, select: { id: true } }).then(async (videos) => {
      const videoIds = videos.map((v) => v.id);
      return prisma.highlightFeedback.count({ where: { videoId: { in: videoIds } } });
    }),

    // Duration
    prisma.video.aggregate({
      where: { projectId, duration: { not: null } },
      _sum: { duration: true },
      _avg: { duration: true },
    }),

    // Recent videos
    prisma.video.findMany({
      where: { projectId },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        sourceUrl: true,
        status: true,
        duration: true,
        createdAt: true,
      },
    }),

    // Recent jobs
    prisma.job.findMany({
      where: { video: { projectId } },
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        status: true,
        progress: true,
        createdAt: true,
        completedAt: true,
        video: { select: { id: true } },
      },
    }),
  ]);

  // Calculate job success rate
  const successfulJobs = jobsByStatus.find((j) => j.status === "SUCCEEDED")?._count.status || 0;
  const failedJobs = jobsByStatus.find((j) => j.status === "FAILED")?._count.status || 0;
  const completedJobs = successfulJobs + failedJobs;
  const successRate = completedJobs > 0 ? (successfulJobs / completedJobs) * 100 : 0;

  // Transform grouped data
  const videoStatusCounts = videosByStatus.reduce(
    (acc, item) => ({ ...acc, [item.status]: item._count.status }),
    {} as Record<string, number>
  );

  const jobStatusCounts = jobsByStatus.reduce(
    (acc, item) => ({ ...acc, [item.status]: item._count.status }),
    {} as Record<string, number>
  );

  const jobTypeCounts = jobsByType.reduce(
    (acc, item) => ({ ...acc, [item.type]: item._count.type }),
    {} as Record<string, number>
  );

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
    },
    stats: {
      videos: {
        total: totalVideos,
        thisWeek: videosThisWeek,
        byStatus: videoStatusCounts,
        totalDuration: durationStats._sum.duration || 0,
        avgDuration: durationStats._avg.duration ? Math.round(durationStats._avg.duration) : 0,
      },
      jobs: {
        total: totalJobs,
        thisWeek: jobsThisWeek,
        byStatus: jobStatusCounts,
        byType: jobTypeCounts,
        successRate: Math.round(successRate * 10) / 10,
      },
      outputs: {
        total: totalOutputs,
        thisWeek: outputsThisWeek,
      },
      feedback: {
        total: feedbackCount,
      },
    },
    recentActivity: {
      videos: recentVideos.map((v) => ({
        id: v.id,
        sourceUrl: v.sourceUrl,
        status: v.status,
        duration: v.duration,
        createdAt: v.createdAt,
      })),
      jobs: recentJobs.map((j) => ({
        id: j.id,
        type: j.type,
        status: j.status,
        progress: j.progress,
        videoId: j.video.id,
        createdAt: j.createdAt,
        completedAt: j.completedAt,
      })),
    },
    generatedAt: new Date().toISOString(),
  });
}
