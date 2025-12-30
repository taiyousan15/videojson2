import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get projects where user has membership (via workspace or project)
  const projects = await prisma.project.findMany({
    where: {
      OR: [
        // User is a member of the project's workspace
        {
          workspace: {
            members: {
              some: { userId: session.user.id },
            },
          },
        },
        // User is a direct project member
        {
          members: {
            some: { userId: session.user.id },
          },
        },
      ],
    },
    include: {
      workspace: { select: { id: true, name: true, slug: true } },
      _count: { select: { videos: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ projects });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, domain, language, workspaceId } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Verify user has access to the workspace
  let targetWorkspaceId = workspaceId;

  if (!targetWorkspaceId) {
    // Get or create default workspace for user
    let membership = await prisma.membership.findFirst({
      where: { userId: session.user.id },
      include: { workspace: true },
    });

    if (!membership) {
      // Create default workspace for user
      const workspace = await prisma.workspace.create({
        data: {
          name: `${session.user.name || session.user.email}'s Workspace`,
          slug: `user-${session.user.id.slice(0, 8)}`,
          members: {
            create: {
              userId: session.user.id,
              role: "ADMIN",
            },
          },
        },
      });
      targetWorkspaceId = workspace.id;
    } else {
      targetWorkspaceId = membership.workspaceId;
    }
  } else {
    // Verify membership
    const membership = await prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: targetWorkspaceId,
          userId: session.user.id,
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "No access to workspace" },
        { status: 403 }
      );
    }
  }

  const project = await prisma.project.create({
    data: {
      name,
      domain: domain || null,
      language: language || "ja",
      workspaceId: targetWorkspaceId,
    },
    include: {
      workspace: { select: { id: true, name: true, slug: true } },
    },
  });

  return NextResponse.json({ project }, { status: 201 });
}
