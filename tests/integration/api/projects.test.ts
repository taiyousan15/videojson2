import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrismaClient, createMockSession, createMockNextRequest, testData } from "../../utils/test-helpers";

// Mock prisma with all needed methods
const mockPrisma = {
  ...createMockPrismaClient(),
  membership: {
    findFirst: vi.fn(),
  },
  workspace: {
    create: vi.fn(),
  },
};
vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

// Mock auth
const mockSession = createMockSession();
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}));

// Mock RBAC
vi.mock("@/lib/rbac", () => ({
  hasProjectAccess: vi.fn(() => Promise.resolve(true)),
  requireAdmin: vi.fn(() => Promise.resolve()),
}));

describe("Projects API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/projects", () => {
    it("should return user projects", async () => {
      const projects = [
        testData.project({ id: "p1", name: "Project 1" }),
        testData.project({ id: "p2", name: "Project 2" }),
      ];

      mockPrisma.workspaceMember.findMany.mockResolvedValue([
        { workspaceId: "ws-1" },
      ]);
      mockPrisma.project.findMany.mockResolvedValue(projects);

      // Import after mocking
      const { GET } = await import("@/app/api/projects/route");
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.projects).toHaveLength(2);
    });

    it("should return 401 if not authenticated", async () => {
      const authModule = await import("@/lib/auth");
      (vi.mocked(authModule.auth) as any).mockResolvedValueOnce(null);

      const { GET } = await import("@/app/api/projects/route");
      const response = await GET();

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/projects", () => {
    it("should create a new project", async () => {
      const newProject = testData.project({ name: "New Project" });

      // Mock membership for workspace access
      mockPrisma.membership.findFirst.mockResolvedValue({
        workspaceId: "ws-1",
        role: "ADMIN",
        workspace: { id: "ws-1" },
      });
      mockPrisma.project.create.mockResolvedValue(newProject);

      const { POST } = await import("@/app/api/projects/route");
      const request = createMockNextRequest({
        method: "POST",
        url: "http://localhost:3000/api/projects",
        body: { name: "New Project" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.project.name).toBe("New Project");
    });

    it("should return 400 if name is missing", async () => {
      mockPrisma.membership.findFirst.mockResolvedValue({
        workspaceId: "ws-1",
        workspace: { id: "ws-1" },
      });

      const { POST } = await import("@/app/api/projects/route");
      const request = createMockNextRequest({
        method: "POST",
        url: "http://localhost:3000/api/projects",
        body: {},
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });
  });
});

describe("Project Detail API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/projects/[projectId]", () => {
    it("should return project details", async () => {
      const project = testData.project();

      mockPrisma.project.findUnique.mockResolvedValue(project);

      const { GET } = await import("@/app/api/projects/[projectId]/route");
      const context = { params: Promise.resolve({ projectId: "project-1" }) };

      const response = await GET(createMockNextRequest(), context);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.project.id).toBe("project-1");
    });

    it("should return 404 if project not found", async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      const { GET } = await import("@/app/api/projects/[projectId]/route");
      const context = { params: Promise.resolve({ projectId: "not-found" }) };

      const response = await GET(createMockNextRequest(), context);

      expect(response.status).toBe(404);
    });
  });
});
