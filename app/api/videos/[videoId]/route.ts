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
    include: {
      project: { select: { id: true, name: true, workspaceId: true } },
      jobs: {
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { artifacts: true } },
        },
      },
      artifacts: {
        orderBy: { createdAt: "desc" },
      },
      outputs: {
        orderBy: { createdAt: "desc" },
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

  return NextResponse.json({ video });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
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

  await prisma.video.delete({
    where: { id: videoId },
  });

  return NextResponse.json({ deleted: true });
}
