import { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { auth } from "./auth";
import { redirect } from "next/navigation";

// ============================================
// Types
// ============================================

export interface UserWithRole {
  id: string;
  role: Role;
}

export interface WorkspaceMember {
  userId: string;
  workspaceId: string;
  role: Role;
}

// ============================================
// Permission Definitions
// ============================================

const PERMISSIONS: Record<Role, string[]> = {
  ADMIN: ["*"],
  EDITOR: [
    "project:read",
    "project:write",
    "video:read",
    "video:write",
    "job:read",
    "job:write",
    "job:review",
    "workspace:read",
  ],
  CREATOR: [
    "project:read",
    "video:read",
    "video:write",
    "job:read",
    "workspace:read",
  ],
};

// ============================================
// Role Checking Functions
// ============================================

export function isAdmin(role: Role): boolean {
  return role === "ADMIN";
}

export function isEditor(role: Role): boolean {
  return role === "ADMIN" || role === "EDITOR";
}

export function isCreator(role: Role): boolean {
  return role === "ADMIN" || role === "EDITOR" || role === "CREATOR";
}

// ============================================
// Permission Checking Functions
// ============================================

export function hasPermission(
  user: UserWithRole,
  action: string,
  resource: string
): boolean {
  const userPermissions = PERMISSIONS[user.role];
  const requiredPermission = `${resource}:${action}`;

  return (
    userPermissions.includes("*") ||
    userPermissions.includes(requiredPermission)
  );
}

export function requirePermission(
  user: UserWithRole,
  action: string,
  resource: string
): void {
  if (!hasPermission(user, action, resource)) {
    throw new Error(`Forbidden: ${resource}:${action}`);
  }
}

// ============================================
// Workspace Role Functions
// ============================================

export async function getWorkspaceRole(
  userId: string,
  workspaceId: string
): Promise<Role | null> {
  const membership = await prisma.membership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
  });

  return membership?.role ?? null;
}

export async function hasWorkspaceAccess(
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const role = await getWorkspaceRole(userId, workspaceId);
  return role !== null;
}

export async function isWorkspaceAdmin(
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const role = await getWorkspaceRole(userId, workspaceId);
  return role === "ADMIN";
}

export async function requireWorkspaceAccess(
  userId: string,
  workspaceId: string
): Promise<Role> {
  const role = await getWorkspaceRole(userId, workspaceId);
  if (!role) {
    throw new Error("Forbidden: No access to workspace");
  }
  return role;
}

// ============================================
// Server Component Helpers
// ============================================

export async function requireAdmin() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN") {
    throw new Error("Forbidden: Admin access required");
  }

  return session;
}

export async function requireAdminOrRedirect() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/projects");
  }

  return session;
}

export async function checkAdminAccess(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "ADMIN";
}

// ============================================
// Project Role Functions
// ============================================

export async function getProjectRole(
  userId: string,
  projectId: string
): Promise<Role | null> {
  const member = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId,
      },
    },
  });

  return member?.role ?? null;
}

export async function hasProjectAccess(
  userId: string,
  projectId: string
): Promise<boolean> {
  // First check project membership
  const projectRole = await getProjectRole(userId, projectId);
  if (projectRole) return true;

  // Then check workspace membership
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });

  if (!project) return false;

  return hasWorkspaceAccess(userId, project.workspaceId);
}

export async function requireProjectAccess(
  userId: string,
  projectId: string
): Promise<void> {
  const hasAccess = await hasProjectAccess(userId, projectId);
  if (!hasAccess) {
    throw new Error("Forbidden: No access to project");
  }
}
