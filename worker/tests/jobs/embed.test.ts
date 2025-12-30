import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
const mockPrisma = {
  job: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  artifact: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock("../../src/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("../../src/tasks/progress", () => ({
  updateProgress: vi.fn().mockResolvedValue(undefined),
  setReviewRequired: vi.fn().mockResolvedValue(undefined),
}));

const mockDetections = [
  {
    id: "face_0_0",
    frameIndex: 0,
    timestamp: 1.0,
    bbox: { x: 100, y: 100, width: 80, height: 100 },
    confidence: 0.95,
  },
  {
    id: "face_1_0",
    frameIndex: 1,
    timestamp: 2.0,
    bbox: { x: 105, y: 102, width: 82, height: 102 },
    confidence: 0.92,
  },
];

const mockTracks = [
  {
    id: "track_0",
    detections: mockDetections,
  },
];

const mockEmbeddings = [
  {
    trackId: "track_0",
    embedding: new Array(512).fill(0.1),
    quality: 0.9,
  },
];

const mockClusters = [
  {
    id: "cluster_0",
    embeddings: mockEmbeddings,
    centroid: new Array(512).fill(0.1),
    similarity: 0.92,
  },
];

vi.mock("../../src/providers/embedding/insightface", () => ({
  InsightFaceClient: class {
    detectFaces = vi.fn().mockResolvedValue(mockDetections);
    trackFaces = vi.fn().mockResolvedValue(mockTracks);
    generateEmbeddings = vi.fn().mockResolvedValue(mockEmbeddings);
    clusterEmbeddings = vi.fn().mockResolvedValue(mockClusters);
  },
}));

vi.mock("../../src/ffmpeg/extractFrames", () => ({
  extractEvenlyDistributedFrames: vi.fn().mockResolvedValue([
    { path: "/tmp/frame_0.jpg", timestamp: 1.0, index: 0 },
    { path: "/tmp/frame_1.jpg", timestamp: 2.0, index: 1 },
  ]),
}));

vi.mock("../../src/utils/gcs", () => ({
  downloadFile: vi.fn().mockResolvedValue(undefined),
  uploadJSON: vi.fn().mockResolvedValue(undefined),
  getDefaultBucket: vi.fn().mockReturnValue("test-bucket"),
  buildGcsUri: vi.fn((bucket, path) => `gs://${bucket}/${path}`),
}));

vi.mock("fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

describe("runEmbed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should throw error if job not found", async () => {
    mockPrisma.job.findUnique.mockResolvedValue(null);

    const { runEmbed } = await import("../../src/jobs/embed");

    await expect(runEmbed("nonexistent")).rejects.toThrow("Job not found: nonexistent");
  });

  it("should throw error if normalized video not found", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue(null);

    const { runEmbed } = await import("../../src/jobs/embed");

    await expect(runEmbed("job123")).rejects.toThrow("Normalized video not found");
  });

  it("should extract frames for face detection", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/normalized.mp4",
    });
    mockPrisma.job.update.mockResolvedValue({});
    mockPrisma.artifact.create.mockResolvedValue({});

    const { runEmbed } = await import("../../src/jobs/embed");
    const { extractEvenlyDistributedFrames } = await import("../../src/ffmpeg/extractFrames");

    await runEmbed("job123");

    expect(extractEvenlyDistributedFrames).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      30, // 30 frames
      expect.objectContaining({ format: "jpg" })
    );
  });

  it("should detect and track faces", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/normalized.mp4",
    });
    mockPrisma.job.update.mockResolvedValue({});
    mockPrisma.artifact.create.mockResolvedValue({});

    const { runEmbed } = await import("../../src/jobs/embed");

    await runEmbed("job123");

    expect(mockPrisma.job.update).toHaveBeenCalledWith({
      where: { id: "job123" },
      data: {
        result: expect.objectContaining({
          totalFaces: 2,
          uniquePersons: 1,
        }),
      },
    });
  });

  it("should create EMBED_REPORT artifact", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/normalized.mp4",
    });
    mockPrisma.job.update.mockResolvedValue({});
    mockPrisma.artifact.create.mockResolvedValue({});

    const { runEmbed } = await import("../../src/jobs/embed");

    await runEmbed("job123");

    expect(mockPrisma.artifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job123",
        videoId: "video123",
        type: "EMBED_REPORT",
      }),
    });
  });

  it("should classify clusters by similarity threshold", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/normalized.mp4",
    });
    mockPrisma.job.update.mockResolvedValue({});
    mockPrisma.artifact.create.mockResolvedValue({});

    const { runEmbed } = await import("../../src/jobs/embed");

    await runEmbed("job123");

    // The mock cluster has similarity 0.92 which is >= 0.85 AUTO_MERGE threshold
    expect(mockPrisma.job.update).toHaveBeenCalledWith({
      where: { id: "job123" },
      data: {
        result: expect.objectContaining({
          autoMerged: expect.arrayContaining([
            expect.objectContaining({ similarity: 0.92 }),
          ]),
        }),
      },
    });
  });

  it("should update progress to 100 when no review required", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/normalized.mp4",
    });
    mockPrisma.job.update.mockResolvedValue({});
    mockPrisma.artifact.create.mockResolvedValue({});

    const { runEmbed } = await import("../../src/jobs/embed");
    const { updateProgress } = await import("../../src/tasks/progress");

    await runEmbed("job123");

    expect(updateProgress).toHaveBeenCalledWith("job123", 100, "completed");
  });

  it("should cleanup work directory", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/normalized.mp4",
    });
    mockPrisma.job.update.mockResolvedValue({});
    mockPrisma.artifact.create.mockResolvedValue({});

    const fs = await import("fs/promises");
    const { runEmbed } = await import("../../src/jobs/embed");

    await runEmbed("job123");

    expect(fs.rm).toHaveBeenCalledWith(
      expect.stringContaining("/tmp/embed_"),
      { recursive: true, force: true }
    );
  });
});
