import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

const TERMINAL_STATUSES = ["SUCCEEDED", "FAILED", "CANCELED"];
const POLL_INTERVAL_MS = 2000;
const MAX_DURATION_MS = 5 * 60 * 1000; // 5 minutes max

function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { jobId } = await context.params;
  const encoder = new TextEncoder();

  // Verify job exists before starting stream
  const initialJob = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, status: true, progress: true, stage: true, error: true, result: true },
  });

  if (!initialJob) {
    return new Response(
      JSON.stringify({ error: "Job not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      let lastStatus = "";
      let lastProgress = -1;

      const sendEvent = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(formatSseEvent(event, data)));
        } catch {
          // Controller may be closed if client disconnected
        }
      };

      // Send initial connected event
      sendEvent("connected", { jobId });

      const poll = async (): Promise<void> => {
        // Check if max duration exceeded
        if (Date.now() - startTime > MAX_DURATION_MS) {
          sendEvent("timeout", { jobId, message: "Stream timeout exceeded" });
          controller.close();
          return;
        }

        // Check if client disconnected
        if (request.signal.aborted) {
          controller.close();
          return;
        }

        try {
          const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: {
              id: true,
              status: true,
              progress: true,
              stage: true,
              error: true,
              result: true,
              completedAt: true,
            },
          });

          if (!job) {
            sendEvent("error", { jobId, message: "Job not found" });
            controller.close();
            return;
          }

          // Only send update when status or progress changed
          const statusChanged = job.status !== lastStatus;
          const progressChanged = job.progress !== lastProgress;

          if (statusChanged || progressChanged) {
            lastStatus = job.status;
            lastProgress = job.progress;

            sendEvent("progress", {
              jobId: job.id,
              status: job.status,
              progress: job.progress,
              stage: job.stage,
            });
          }

          // Close stream on terminal status
          if (TERMINAL_STATUSES.includes(job.status)) {
            const eventType = job.status === "SUCCEEDED" ? "completed" : "failed";
            sendEvent(eventType, {
              jobId: job.id,
              status: job.status,
              progress: job.progress,
              result: job.result,
              error: job.error,
              completedAt: job.completedAt?.toISOString(),
            });
            controller.close();
            return;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          sendEvent("error", { jobId, message });
          controller.close();
          return;
        }

        // Schedule next poll
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        return poll();
      };

      await poll();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
