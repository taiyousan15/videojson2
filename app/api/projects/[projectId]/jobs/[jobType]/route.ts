import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasProjectAccess } from "@/lib/rbac";
import { enqueueJob } from "@/lib/queue";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

type RouteContext = {
  params: Promise<{ projectId: string; jobType: string }>;
};

const VALID_JOB_TYPES = [
  "INGEST",
  "ANALYZE",
  "OCR",
  "EMBED",
  "HIGHLIGHT",
  "RENDER",
  "ASSEMBLE",
  "TRAIN",
  "GENERATE",
  "COMFYUI",
  "FACE_SWAP",
] as const;

const requestSchema = z.object({
  videoId: z.string().uuid(),
  config: z.record(z.unknown()).optional().default({}),
  autoEnqueue: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, jobType } = await context.params;

  // Validate job type
  const upperJobType = jobType.toUpperCase();
  if (!VALID_JOB_TYPES.includes(upperJobType as (typeof VALID_JOB_TYPES)[number])) {
    return NextResponse.json(
      { error: `Invalid job type: ${jobType}. Must be one of: ${VALID_JOB_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const hasAccess = await hasProjectAccess(session.user.id, projectId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { videoId, config, autoEnqueue } = parsed.data;

  // Verify video belongs to project
  const video = await prisma.video.findFirst({
    where: { id: videoId, projectId },
  });

  if (!video) {
    return NextResponse.json(
      { error: "Video not found in this project" },
      { status: 404 }
    );
  }

  // Check for existing pending/running job of same type
  const existingJob = await prisma.job.findFirst({
    where: {
      videoId,
      type: upperJobType as (typeof VALID_JOB_TYPES)[number],
      status: { in: ["PENDING", "QUEUED", "RUNNING"] },
    },
  });

  if (existingJob) {
    return NextResponse.json(
      { error: `A ${upperJobType} job is already pending or running` },
      { status: 409 }
    );
  }

  try {
    // Create Job record
    const job = await prisma.job.create({
      data: {
        videoId,
        type: upperJobType as (typeof VALID_JOB_TYPES)[number],
        status: autoEnqueue ? "QUEUED" : "PENDING",
        config: config as Prisma.InputJsonValue,
        createdById: session.user.id,
      },
    });

    // Enqueue to Cloud Tasks if requested
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
      } catch (enqueueError) {
        // Revert to PENDING if enqueue fails
        await prisma.job.update({
          where: { id: job.id },
          data: { status: "PENDING" },
        });

        const message = enqueueError instanceof Error ? enqueueError.message : "Unknown error";
        return NextResponse.json(
          {
            job: { id: job.id, type: job.type, status: "PENDING" },
            warning: `Job created but enqueue failed: ${message}`,
          },
          { status: 201 }
        );
      }
    }

    return NextResponse.json(
      {
        job: {
          id: job.id,
          projectId,
          type: job.type,
          status: autoEnqueue && taskName ? "QUEUED" : "PENDING",
          taskName,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to create job: ${message}` },
      { status: 500 }
    );
  }
}
