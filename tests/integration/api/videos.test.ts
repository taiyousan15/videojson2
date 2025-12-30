import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrismaClient, createMockSession, createMockNextRequest, testData } from "../../utils/test-helpers";

// Mock prisma
const mockPrisma = createMockPrismaClient();
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
}));

// Mock queue
vi.mock("@/lib/queue", () => ({
  enqueueJob: vi.fn(() => Promise.resolve("task-id")),
}));

describe("Videos API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/videos/[videoId]", () => {
    it("should return video details", async () => {
      const video = testData.video();
      mockPrisma.video.findUnique.mockResolvedValue({
        ...video,
        project: { id: "project-1" },
      });

      const { GET } = await import("@/app/api/videos/[videoId]/route");
      const context = { params: Promise.resolve({ videoId: "video-1" }) };

      const response = await GET(createMockNextRequest(), context);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.video.id).toBe("video-1");
    });

    it("should return 404 if video not found", async () => {
      mockPrisma.video.findUnique.mockResolvedValue(null);

      const { GET } = await import("@/app/api/videos/[videoId]/route");
      const context = { params: Promise.resolve({ videoId: "not-found" }) };

      const response = await GET(createMockNextRequest(), context);

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/videos/[videoId]", () => {
    it("should delete video", async () => {
      const video = testData.video();
      mockPrisma.video.findUnique.mockResolvedValue({
        ...video,
        projectId: "project-1",
      });
      mockPrisma.video.delete.mockResolvedValue(video);

      const { DELETE } = await import("@/app/api/videos/[videoId]/route");
      const context = { params: Promise.resolve({ videoId: "video-1" }) };
      const request = createMockNextRequest({ method: "DELETE" });

      const response = await DELETE(request, context);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.deleted).toBe(true);
    });
  });
});

describe("Video Jobs API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/videos/[videoId]/jobs", () => {
    it("should create a new job", async () => {
      const video = testData.video({ status: "READY" });
      const job = testData.job({ type: "ANALYZE" });

      mockPrisma.video.findUnique.mockResolvedValue({
        ...video,
        jobs: [{ type: "INGEST", status: "SUCCEEDED" }],
      });
      mockPrisma.job.create.mockResolvedValue(job);

      const { POST } = await import("@/app/api/videos/[videoId]/jobs/route");
      const context = { params: Promise.resolve({ videoId: "video-1" }) };
      const request = createMockNextRequest({
        method: "POST",
        body: { type: "ANALYZE" },
      });

      const response = await POST(request, context);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.job.type).toBe("ANALYZE");
    });

    it("should return 400 if video not ready", async () => {
      const video = testData.video({ status: "PENDING" });

      mockPrisma.video.findUnique.mockResolvedValue({
        ...video,
        jobs: [],
      });

      const { POST } = await import("@/app/api/videos/[videoId]/jobs/route");
      const context = { params: Promise.resolve({ videoId: "video-1" }) };
      const request = createMockNextRequest({
        method: "POST",
        body: { type: "ANALYZE" },
      });

      const response = await POST(request, context);

      expect(response.status).toBe(400);
    });

    it("should return 400 if dependencies not met", async () => {
      const video = testData.video({ status: "READY" });

      mockPrisma.video.findUnique.mockResolvedValue({
        ...video,
        jobs: [], // No INGEST job completed
      });

      const { POST } = await import("@/app/api/videos/[videoId]/jobs/route");
      const context = { params: Promise.resolve({ videoId: "video-1" }) };
      const request = createMockNextRequest({
        method: "POST",
        body: { type: "ANALYZE" },
      });

      const response = await POST(request, context);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Missing required jobs");
    });
  });
});
