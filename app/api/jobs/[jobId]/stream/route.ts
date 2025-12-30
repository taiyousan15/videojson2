import { NextRequest } from "next/server";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { jobId } = await context.params;

  // TODO: Implement SSE for job progress streaming
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const data = `data: ${JSON.stringify({ jobId, status: "RUNNING", progress: 0 })}\n\n`;
      controller.enqueue(encoder.encode(data));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
