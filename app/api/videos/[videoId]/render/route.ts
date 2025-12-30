import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasProjectAccess } from "@/lib/rbac";
import { enqueueJob } from "@/lib/queue";

type RouteContext = {
  params: Promise<{ videoId: string }>;
};

// Render configuration schema
interface RenderConfig {
  format: "mp4" | "webm" | "gif";
  quality: "draft" | "standard" | "high" | "ultra";
  aspectRatio: "16:9" | "9:16" | "1:1" | "4:3";
  resolution: "720p" | "1080p" | "1440p" | "4k";
  fps: 24 | 30 | 60;
  codec?: string;
  bitrate?: number;
  includeSubtitles?: boolean;
  subtitleStyle?: "default" | "karaoke" | "minimal";
  watermark?: {
    enabled: boolean;
    position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    opacity: number;
  };
  segments?: string[]; // Selected segment IDs to include
}

const DEFAULT_CONFIG: RenderConfig = {
  format: "mp4",
  quality: "standard",
  aspectRatio: "16:9",
  resolution: "1080p",
  fps: 30,
  includeSubtitles: true,
  subtitleStyle: "default",
};

// GET /api/videos/[videoId]/render - Get render config and history
export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { videoId } = await context.params;

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      projectId: true,
      duration: true,
      width: true,
      height: true,
      fps: true,
      status: true,
    },
  });

  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const hasAccess = await hasProjectAccess(session.user.id, video.projectId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get render jobs history
  const renderJobs = await prisma.job.findMany({
    where: {
      videoId,
      type: "RENDER",
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      createdBy: { select: { name: true, email: true } },
    },
  });

  // Get available highlight segments
  const highlightArtifact = await prisma.artifact.findFirst({
    where: {
      videoId,
      type: "HIGHLIGHT_PLAN",
    },
    orderBy: { createdAt: "desc" },
  });

  // Get outputs from completed renders
  const outputs = await prisma.output.findMany({
    where: { videoId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return NextResponse.json({
    video: {
      id: video.id,
      duration: video.duration,
      resolution: video.width && video.height ? `${video.width}x${video.height}` : null,
      fps: video.fps,
      status: video.status,
    },
    defaultConfig: DEFAULT_CONFIG,
    renderJobs: renderJobs.map((j) => ({
      id: j.id,
      status: j.status,
      progress: j.progress,
      stage: j.stage,
      config: j.config,
      error: j.error,
      createdAt: j.createdAt,
      completedAt: j.completedAt,
      createdBy: j.createdBy,
    })),
    outputs: outputs.map((o) => ({
      id: o.id,
      name: o.name,
      format: o.format,
      duration: o.duration,
      aspectRatio: o.aspectRatio,
      createdAt: o.createdAt,
    })),
    hasHighlights: !!highlightArtifact,
  });
}

// POST /api/videos/[videoId]/render - Start a new render job
export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { videoId } = await context.params;

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      projectId: true,
      status: true,
    },
  });

  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const hasAccess = await hasProjectAccess(session.user.id, video.projectId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (video.status !== "READY") {
    return NextResponse.json(
      { error: "Video must be in READY status to render" },
      { status: 400 }
    );
  }

  // Check for required HIGHLIGHT job
  const highlightJob = await prisma.job.findFirst({
    where: {
      videoId,
      type: "HIGHLIGHT",
      status: "SUCCEEDED",
    },
  });

  if (!highlightJob) {
    return NextResponse.json(
      { error: "HIGHLIGHT job must be completed before rendering" },
      { status: 400 }
    );
  }

  // Check for existing pending/running render job
  const existingJob = await prisma.job.findFirst({
    where: {
      videoId,
      type: "RENDER",
      status: { in: ["PENDING", "QUEUED", "RUNNING"] },
    },
  });

  if (existingJob) {
    return NextResponse.json(
      { error: "A render job is already in progress", jobId: existingJob.id },
      { status: 409 }
    );
  }

  const body = await request.json();
  const config: RenderConfig = {
    ...DEFAULT_CONFIG,
    ...body.config,
  };

  // Validate config
  const validFormats = ["mp4", "webm", "gif"];
  const validQualities = ["draft", "standard", "high", "ultra"];
  const validAspectRatios = ["16:9", "9:16", "1:1", "4:3"];
  const validResolutions = ["720p", "1080p", "1440p", "4k"];
  const validFps = [24, 30, 60];

  if (!validFormats.includes(config.format)) {
    return NextResponse.json(
      { error: `Invalid format. Must be one of: ${validFormats.join(", ")}` },
      { status: 400 }
    );
  }

  if (!validQualities.includes(config.quality)) {
    return NextResponse.json(
      { error: `Invalid quality. Must be one of: ${validQualities.join(", ")}` },
      { status: 400 }
    );
  }

  if (!validAspectRatios.includes(config.aspectRatio)) {
    return NextResponse.json(
      { error: `Invalid aspectRatio. Must be one of: ${validAspectRatios.join(", ")}` },
      { status: 400 }
    );
  }

  if (!validResolutions.includes(config.resolution)) {
    return NextResponse.json(
      { error: `Invalid resolution. Must be one of: ${validResolutions.join(", ")}` },
      { status: 400 }
    );
  }

  if (!validFps.includes(config.fps)) {
    return NextResponse.json(
      { error: `Invalid fps. Must be one of: ${validFps.join(", ")}` },
      { status: 400 }
    );
  }

  // Create render job
  const job = await prisma.job.create({
    data: {
      videoId,
      type: "RENDER",
      status: "QUEUED",
      config: config as any,
      createdById: session.user.id,
    },
  });

  // Enqueue the job
  try {
    await enqueueJob({
      jobId: job.id,
      jobType: "RENDER",
    });
  } catch (error) {
    console.error("Failed to enqueue render job:", error);
  }

  return NextResponse.json(
    {
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        config: job.config,
        createdAt: job.createdAt,
      },
    },
    { status: 201 }
  );
}
