import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

// GET /api/admin/stats - Get system-wide statistics
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get date ranges
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Parallel queries for performance
  const [
    // User stats
    totalUsers,
    usersThisWeek,
    usersByRole,

    // Project stats
    totalProjects,
    projectsThisWeek,

    // Video stats
    totalVideos,
    videosThisWeek,
    videosByStatus,

    // Job stats
    totalJobs,
    jobsToday,
    jobsByStatus,
    jobsByType,

    // Output stats
    totalOutputs,
    outputsThisWeek,

    // Feedback stats
    totalFeedback,
    feedbackThisWeek,
    avgRating,

    // Recent activity
    recentJobs,
    recentVideos,
  ] = await Promise.all([
    // Users
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: thisWeek } } }),
    prisma.user.groupBy({ by: ["role"], _count: { role: true } }),

    // Projects
    prisma.project.count(),
    prisma.project.count({ where: { createdAt: { gte: thisWeek } } }),

    // Videos
    prisma.video.count(),
    prisma.video.count({ where: { createdAt: { gte: thisWeek } } }),
    prisma.video.groupBy({ by: ["status"], _count: { status: true } }),

    // Jobs
    prisma.job.count(),
    prisma.job.count({ where: { createdAt: { gte: today } } }),
    prisma.job.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.job.groupBy({ by: ["type"], _count: { type: true } }),

    // Outputs
    prisma.output.count(),
    prisma.output.count({ where: { createdAt: { gte: thisWeek } } }),

    // Feedback
    prisma.highlightFeedback.count(),
    prisma.highlightFeedback.count({ where: { createdAt: { gte: thisWeek } } }),
    prisma.highlightFeedback.aggregate({ _avg: { rating: true } }),

    // Recent activity
    prisma.job.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        video: { select: { id: true, sourceUrl: true } },
        createdBy: { select: { name: true, email: true } },
      },
    }),
    prisma.video.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Calculate job success rate
  const successfulJobs = jobsByStatus.find((j) => j.status === "SUCCEEDED")?._count.status || 0;
  const failedJobs = jobsByStatus.find((j) => j.status === "FAILED")?._count.status || 0;
  const completedJobs = successfulJobs + failedJobs;
  const successRate = completedJobs > 0 ? (successfulJobs / completedJobs) * 100 : 0;

  // Transform grouped data
  const userRoleCounts = usersByRole.reduce(
    (acc, item) => ({ ...acc, [item.role]: item._count.role }),
    {} as Record<string, number>
  );

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
    overview: {
      users: {
        total: totalUsers,
        thisWeek: usersThisWeek,
        byRole: userRoleCounts,
      },
      projects: {
        total: totalProjects,
        thisWeek: projectsThisWeek,
      },
      videos: {
        total: totalVideos,
        thisWeek: videosThisWeek,
        byStatus: videoStatusCounts,
      },
      jobs: {
        total: totalJobs,
        today: jobsToday,
        byStatus: jobStatusCounts,
        byType: jobTypeCounts,
        successRate: Math.round(successRate * 10) / 10,
      },
      outputs: {
        total: totalOutputs,
        thisWeek: outputsThisWeek,
      },
      feedback: {
        total: totalFeedback,
        thisWeek: feedbackThisWeek,
        avgRating: avgRating._avg.rating ? Math.round(avgRating._avg.rating * 10) / 10 : null,
      },
    },
    recentActivity: {
      jobs: recentJobs.map((j) => ({
        id: j.id,
        type: j.type,
        status: j.status,
        progress: j.progress,
        videoId: j.video?.id,
        videoUrl: j.video?.sourceUrl,
        createdBy: j.createdBy?.name || j.createdBy?.email,
        createdAt: j.createdAt,
      })),
      videos: recentVideos.map((v) => ({
        id: v.id,
        status: v.status,
        sourceUrl: v.sourceUrl,
        projectId: v.project?.id,
        projectName: v.project?.name,
        createdAt: v.createdAt,
      })),
    },
    generatedAt: new Date().toISOString(),
  });
}
