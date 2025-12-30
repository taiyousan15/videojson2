import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasProjectAccess } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ videoId: string }>;
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

  const outputs = await prisma.output.findMany({
    where: { videoId },
    include: {
      run: {
        select: { id: true, config: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ outputs });
}

export async function POST(request: NextRequest, context: RouteContext) {
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

  const body = await request.json();
  const { name, gcsUri, duration, format, aspectRatio, runId } = body;

  if (!name || !gcsUri || !runId) {
    return NextResponse.json(
      { error: "name, gcsUri, and runId are required" },
      { status: 400 }
    );
  }

  const output = await prisma.output.create({
    data: {
      videoId,
      runId,
      name,
      gcsUri,
      duration: duration || null,
      format: format || "mp4",
      aspectRatio: aspectRatio || null,
    },
  });

  return NextResponse.json({ output }, { status: 201 });
}
