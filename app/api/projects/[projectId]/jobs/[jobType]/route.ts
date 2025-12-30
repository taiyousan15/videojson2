import { NextRequest, NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ projectId: string; jobType: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId, jobType } = await context.params;

  // TODO: Implement job creation & Cloud Tasks enqueue
  // jobType: INGEST, ANALYZE, OCR, EMBED, HIGHLIGHT, RENDER, ASSEMBLE, TRAIN
  const body = await request.json();
  return NextResponse.json(
    {
      jobId: "new-job-id",
      projectId,
      type: jobType,
      status: "QUEUED",
      ...body,
    },
    { status: 201 }
  );
}
