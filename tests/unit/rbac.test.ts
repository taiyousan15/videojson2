import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSession } from "../utils/test-helpers";

// Create mock prisma with all necessary methods
const mockPrisma = {
  project: {
    findUnique: vi.fn(),
  },
  workspaceMember: {
    findFirst: vi.fn(),
  },
  projectMember: {
    findUnique: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
};

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

// Mock auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

describe("RBAC Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe("hasProjectAccess", () => {
    it("should return true for project member", async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue({
        userId: "user-1",
        projectId: "project-1",
        role: "EDITOR",
      });

      const { hasProjectAccess } = await import("@/lib/rbac");
      const result = await hasProjectAccess("user-1", "project-1");

      expect(result).toBe(true);
    });

    it("should return false for non-member", async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);

      const { hasProjectAccess } = await import("@/lib/rbac");
      const result = await hasProjectAccess("user-2", "project-1");

      expect(result).toBe(false);
    });

    it("should return false if project member not found", async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);

      const { hasProjectAccess } = await import("@/lib/rbac");
      const result = await hasProjectAccess("user-1", "not-found");

      expect(result).toBe(false);
    });
  });

  describe("requireAdmin", () => {
    it("should not throw for admin user", async () => {
      const authModule = await import("@/lib/auth");
      (vi.mocked(authModule.auth) as any).mockResolvedValue(
        createMockSession({ role: "ADMIN" })
      );

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        role: "ADMIN",
      });

      const { requireAdmin } = await import("@/lib/rbac");
      await expect(requireAdmin()).resolves.not.toThrow();
    });

    it("should throw for non-admin user", async () => {
      const authModule = await import("@/lib/auth");
      (vi.mocked(authModule.auth) as any).mockResolvedValue(
        createMockSession({ role: "EDITOR" })
      );

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        role: "EDITOR",
      });

      const { requireAdmin } = await import("@/lib/rbac");
      await expect(requireAdmin()).rejects.toThrow();
    });

    it("should throw if not authenticated", async () => {
      const authModule = await import("@/lib/auth");
      (vi.mocked(authModule.auth) as any).mockResolvedValue(null);

      const { requireAdmin } = await import("@/lib/rbac");
      await expect(requireAdmin()).rejects.toThrow();
    });
  });
});
