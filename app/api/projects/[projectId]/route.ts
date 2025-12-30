import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasProjectAccess } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await context.params;

  const hasAccess = await hasProjectAccess(session.user.id, projectId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      workspace: { select: { id: true, name: true, slug: true } },
      videos: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          _count: { select: { jobs: true } },
        },
      },
      _count: { select: { videos: true } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ project });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await context.params;

  const hasAccess = await hasProjectAccess(session.user.id, projectId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { name, domain, language } = body;

  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(name && { name }),
      ...(domain !== undefined && { domain }),
      ...(language && { language }),
    },
    include: {
      workspace: { select: { id: true, name: true, slug: true } },
    },
  });

  return NextResponse.json({ project });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await context.params;

  const hasAccess = await hasProjectAccess(session.user.id, projectId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.project.delete({
    where: { id: projectId },
  });

  return NextResponse.json({ deleted: true });
}
