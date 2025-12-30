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

describe("Highlights API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/videos/[videoId]/highlights", () => {
    it("should return highlight candidates and feedback", async () => {
      const video = testData.video();
      const feedback = [testData.feedback()];

      mockPrisma.video.findUnique.mockResolvedValue({
        ...video,
        projectId: "project-1",
      });
      mockPrisma.artifact.findFirst.mockResolvedValue({
        id: "artifact-1",
        type: "HIGHLIGHT_PLAN",
        gcsUri: "gs://bucket/highlights.json",
      });
      mockPrisma.highlightFeedback.findMany.mockResolvedValue(
        feedback.map((f) => ({
          ...f,
          createdBy: { name: "Test User", email: "test@example.com" },
        }))
      );

      const { GET } = await import("@/app/api/videos/[videoId]/highlights/route");
      const context = { params: Promise.resolve({ videoId: "video-1" }) };

      const response = await GET(createMockNextRequest(), context);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.artifactUri).toBe("gs://bucket/highlights.json");
      expect(data.feedbackMap).toBeDefined();
    });
  });

  describe("POST /api/videos/[videoId]/highlights", () => {
    it("should submit feedback for a segment", async () => {
      const video = testData.video();
      const newFeedback = testData.feedback({ rating: 5, comment: "Excellent" });

      mockPrisma.video.findUnique.mockResolvedValue({
        ...video,
        projectId: "project-1",
      });
      mockPrisma.highlightFeedback.create.mockResolvedValue({
        ...newFeedback,
        createdBy: { name: "Test User", email: "test@example.com" },
      });

      const { POST } = await import("@/app/api/videos/[videoId]/highlights/route");
      const context = { params: Promise.resolve({ videoId: "video-1" }) };
      const request = createMockNextRequest({
        method: "POST",
        body: {
          segmentId: "segment-1",
          rating: 5,
          comment: "Excellent",
        },
      });

      const response = await POST(request, context);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.feedback.rating).toBe(5);
    });

    it("should return 400 if rating is invalid", async () => {
      const video = testData.video();

      mockPrisma.video.findUnique.mockResolvedValue({
        ...video,
        projectId: "project-1",
      });

      const { POST } = await import("@/app/api/videos/[videoId]/highlights/route");
      const context = { params: Promise.resolve({ videoId: "video-1" }) };
      const request = createMockNextRequest({
        method: "POST",
        body: {
          segmentId: "segment-1",
          rating: 10, // Invalid - should be 1-5
        },
      });

      const response = await POST(request, context);

      expect(response.status).toBe(400);
    });

    it("should return 400 if segmentId is missing", async () => {
      const video = testData.video();

      mockPrisma.video.findUnique.mockResolvedValue({
        ...video,
        projectId: "project-1",
      });

      const { POST } = await import("@/app/api/videos/[videoId]/highlights/route");
      const context = { params: Promise.resolve({ videoId: "video-1" }) };
      const request = createMockNextRequest({
        method: "POST",
        body: {
          rating: 4,
        },
      });

      const response = await POST(request, context);

      expect(response.status).toBe(400);
    });
  });
});

describe("Highlight Segment API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/videos/[videoId]/highlights/[segmentId]", () => {
    it("should return segment feedback with average rating", async () => {
      const video = testData.video();
      const feedback = [
        testData.feedback({ rating: 4 }),
        testData.feedback({ id: "feedback-2", rating: 5 }),
      ];

      mockPrisma.video.findUnique.mockResolvedValue({
        ...video,
        projectId: "project-1",
      });
      mockPrisma.highlightFeedback.findMany.mockResolvedValue(
        feedback.map((f) => ({
          ...f,
          createdBy: { name: "Test User", email: "test@example.com" },
        }))
      );

      const { GET } = await import("@/app/api/videos/[videoId]/highlights/[segmentId]/route");
      const context = {
        params: Promise.resolve({ videoId: "video-1", segmentId: "segment-1" }),
      };

      const response = await GET(createMockNextRequest(), context);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.feedback).toHaveLength(2);
      expect(data.averageRating).toBe(4.5);
      expect(data.totalFeedback).toBe(2);
    });
  });

  describe("DELETE /api/videos/[videoId]/highlights/[segmentId]", () => {
    it("should delete user feedback for segment", async () => {
      const video = testData.video();

      mockPrisma.video.findUnique.mockResolvedValue({
        ...video,
        projectId: "project-1",
      });
      mockPrisma.highlightFeedback.deleteMany.mockResolvedValue({ count: 1 });

      const { DELETE } = await import("@/app/api/videos/[videoId]/highlights/[segmentId]/route");
      const context = {
        params: Promise.resolve({ videoId: "video-1", segmentId: "segment-1" }),
      };

      const response = await DELETE(createMockNextRequest(), context);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.deleted).toBe(1);
    });
  });
});
