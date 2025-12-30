import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasProjectAccess } from "@/lib/rbac";
import { enqueueJob } from "@/lib/queue";

type RouteContext = {
  params: Promise<{ videoId: string }>;
};

const VALID_JOB_TYPES = [
  "ANALYZE",
  "OCR",
  "EMBED",
  "HIGHLIGHT",
  "RENDER",
  "ASSEMBLE",
  "FACE_SWAP",
] as const;

type JobType = (typeof VALID_JOB_TYPES)[number];

// Job dependencies - which jobs must be completed before this job can run
const JOB_DEPENDENCIES: Record<JobType, string[]> = {
  ANALYZE: ["INGEST"],
  OCR: ["INGEST"],
  EMBED: ["ANALYZE"],
  HIGHLIGHT: ["ANALYZE", "OCR"],
  RENDER: ["HIGHLIGHT"],
  ASSEMBLE: ["RENDER"],
  FACE_SWAP: ["INGEST"],
};

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

  const jobs = await prisma.job.findMany({
    where: { videoId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { artifacts: true } },
    },
  });

  return NextResponse.json({ jobs });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { videoId } = await context.params;

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      jobs: {
        select: { type: true, status: true },
      },
    },
  });

  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const hasAccess = await hasProjectAccess(session.user.id, video.projectId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { type, config = {}, autoEnqueue = true } = body;

  // Validate job type
  if (!VALID_JOB_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `Invalid job type. Must be one of: ${VALID_JOB_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Check video status
  if (video.status !== "READY" && type !== "INGEST") {
    return NextResponse.json(
      { error: "Video must be in READY status to run analysis jobs" },
      { status: 400 }
    );
  }

  // Check job dependencies
  const dependencies = JOB_DEPENDENCIES[type as JobType];
  const completedJobs = video.jobs
    .filter((j) => j.status === "SUCCEEDED")
    .map((j) => j.type as string);

  const missingDeps = dependencies.filter((dep) => !completedJobs.includes(dep));
  if (missingDeps.length > 0) {
    return NextResponse.json(
      { error: `Missing required jobs: ${missingDeps.join(", ")}` },
      { status: 400 }
    );
  }

  // Check for existing pending/running job of same type
  const existingJob = video.jobs.find(
    (j) =>
      j.type === type &&
      ["PENDING", "QUEUED", "RUNNING"].includes(j.status)
  );

  if (existingJob) {
    return NextResponse.json(
      { error: `A ${type} job is already pending or running` },
      { status: 409 }
    );
  }

  // Build payload for specific job types
  let payload: Record<string, unknown> | undefined;

  if (type === "RENDER") {
    // Find the latest HIGHLIGHT_PLAN artifact to generate render script
    const highlightArtifact = await prisma.artifact.findFirst({
      where: { videoId, type: "HIGHLIGHT_PLAN" },
      orderBy: { createdAt: "desc" },
    });

    if (!highlightArtifact) {
      return NextResponse.json(
        { error: "HIGHLIGHT_PLAN artifact not found. Run HIGHLIGHT job first." },
        { status: 400 }
      );
    }

    // Use the highlight plan URI as the render script source
    // The render job will need to convert this to a render script
    payload = {
      highlightPlanUri: highlightArtifact.gcsUri,
      outputOptions: config.outputOptions || { quality: "standard" },
      generateThumbnail: config.generateThumbnail !== false,
    };
  }

  if (type === "FACE_SWAP") {
    // Validate targetFaceUri is provided
    if (!config.targetFaceUri) {
      return NextResponse.json(
        { error: "targetFaceUri is required for FACE_SWAP job" },
        { status: 400 }
      );
    }

    payload = {
      targetFaceUri: config.targetFaceUri,
      sourceVideoUri: config.sourceVideoUri,
      sourceFaceId: config.sourceFaceId,
      outputOptions: config.outputOptions || { quality: "standard", preserveAudio: true },
    };
  }

  // Create the job
  const job = await prisma.job.create({
    data: {
      videoId,
      type: type,
      status: autoEnqueue ? "QUEUED" : "PENDING",
      config,
      payload: payload as any,
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
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "PENDING" },
      });
    }
  }

  return NextResponse.json(
    {
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
