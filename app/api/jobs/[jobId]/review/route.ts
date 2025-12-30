import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasProjectAccess } from "@/lib/rbac";
import { z } from "zod";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

// Review action schema
const reviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "PATCH"]),
  patch: z.array(z.object({
    op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
    path: z.string(),
    value: z.any().optional(),
    from: z.string().optional(),
  })).optional(),
  comment: z.string().optional(),
});

/**
 * GET /api/jobs/[jobId]/review - Get review history for a job
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await context.params;

    // Get job with video for access check
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        video: {
          select: { projectId: true },
        },
        reviews: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Check access
    const hasAccess = await hasProjectAccess(session.user.id, job.video.projectId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        stage: job.stage,
        error: job.error,
      },
      reviews: job.reviews,
    });
  } catch (error: any) {
    console.error("Get reviews error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/jobs/[jobId]/review - Submit review for a REVIEW_REQUIRED job
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await context.params;

    // Get job with video for access check
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        video: {
          select: { id: true, projectId: true },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Check access
    const hasAccess = await hasProjectAccess(session.user.id, job.video.projectId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if job is in REVIEW_REQUIRED status
    if (job.status !== "REVIEW_REQUIRED") {
      return NextResponse.json(
        { error: `Job is not in REVIEW_REQUIRED status (current: ${job.status})` },
        { status: 400 }
      );
    }

    // Parse and validate body
    const body = await request.json();
    const parsed = reviewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { action, patch, comment } = parsed.data;

    // Validate patch is provided when action is PATCH
    if (action === "PATCH" && (!patch || patch.length === 0)) {
      return NextResponse.json(
        { error: "Patch array is required when action is PATCH" },
        { status: 400 }
      );
    }

    // Create review record and update job status in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create JobReview
      const review = await tx.jobReview.create({
        data: {
          jobId,
          action,
          patch: patch as any,
          comment,
        },
      });

      // Determine next job status based on action
      let nextStatus: string;
      let resultData: any = {};

      switch (action) {
        case "APPROVE":
          // Proceed with current state
          nextStatus = "RUNNING";
          resultData.reviewAction = "APPROVE";
          break;
        case "REJECT":
          // Mark as failed
          nextStatus = "FAILED";
          resultData.reviewAction = "REJECT";
          resultData.error = comment || "Rejected by reviewer";
          break;
        case "PATCH":
          // Apply patch and continue
          nextStatus = "RUNNING";
          resultData.reviewAction = "PATCH";
          resultData.appliedPatch = patch;
          break;
      }

      // Update job status
      const updatedJob = await tx.job.update({
        where: { id: jobId },
        data: {
          status: nextStatus as any,
          result: {
            ...(job.result as object || {}),
            ...resultData,
            lastReviewId: review.id,
            lastReviewedAt: new Date().toISOString(),
          },
          ...(action === "REJECT" && { error: comment || "Rejected by reviewer" }),
        },
      });

      return { review, job: updatedJob };
    });

    return NextResponse.json({
      success: true,
      review: result.review,
      job: {
        id: result.job.id,
        status: result.job.status,
      },
      message: action === "REJECT"
        ? "Job rejected"
        : "Review submitted, job resumed",
    });
  } catch (error: any) {
    console.error("Submit review error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
