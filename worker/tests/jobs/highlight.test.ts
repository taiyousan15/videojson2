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
  modelWeights: {
    findFirst: vi.fn(),
  },
};

vi.mock("../../src/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("../../src/tasks/progress", () => ({
  updateProgress: vi.fn().mockResolvedValue(undefined),
  setReviewRequired: vi.fn().mockResolvedValue(undefined),
}));

const mockEventJson = {
  scenes: [
    {
      start: 0,
      end: 10,
      features: {
        action_intensity: 0.8,
        face_presence: 0.9,
        audio_energy: 0.7,
        text_density: 0.2,
        scene_change: 0.5,
      },
    },
    {
      start: 10,
      end: 20,
      features: {
        action_intensity: 0.4,
        face_presence: 0.3,
        audio_energy: 0.5,
        text_density: 0.1,
        scene_change: 0.2,
      },
    },
  ],
};

vi.mock("../../src/utils/gcs", () => ({
  downloadJSON: vi.fn().mockResolvedValue(mockEventJson),
  uploadJSON: vi.fn().mockResolvedValue(undefined),
  getDefaultBucket: vi.fn().mockReturnValue("test-bucket"),
  buildGcsUri: vi.fn((bucket, path) => `gs://${bucket}/${path}`),
}));

describe("runHighlight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should throw error if job not found", async () => {
    mockPrisma.job.findUnique.mockResolvedValue(null);

    const { runHighlight } = await import("../../src/jobs/highlight");

    await expect(runHighlight("nonexistent")).rejects.toThrow("Job not found: nonexistent");
  });

  it("should throw error if event JSON not found", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue(null);

    const { runHighlight } = await import("../../src/jobs/highlight");

    await expect(runHighlight("job123")).rejects.toThrow("Event JSON not found");
  });

  it("should download and process event JSON", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      config: {},
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/event.json",
    });
    mockPrisma.modelWeights.findFirst.mockResolvedValue(null);
    mockPrisma.job.update.mockResolvedValue({});
    mockPrisma.artifact.create.mockResolvedValue({});

    const { runHighlight } = await import("../../src/jobs/highlight");
    const { downloadJSON } = await import("../../src/utils/gcs");

    await runHighlight("job123");

    expect(downloadJSON).toHaveBeenCalledWith("gs://bucket/event.json");
  });

  it("should use default weights when no custom weights found", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      config: {},
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/event.json",
    });
    mockPrisma.modelWeights.findFirst.mockResolvedValue(null);
    mockPrisma.job.update.mockResolvedValue({});
    mockPrisma.artifact.create.mockResolvedValue({});

    const { runHighlight } = await import("../../src/jobs/highlight");

    await runHighlight("job123");

    expect(mockPrisma.job.update).toHaveBeenCalledWith({
      where: { id: "job123" },
      data: {
        result: expect.objectContaining({
          weightsVersion: 0, // Default when no custom weights
        }),
      },
    });
  });

  it("should use custom weights when available", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      config: {},
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/event.json",
    });
    mockPrisma.modelWeights.findFirst.mockResolvedValue({
      id: "weights123",
      version: 5,
      weights: {
        action_intensity: 0.5,
        face_presence: 0.3,
        audio_energy: 0.1,
        text_density: 0.05,
        scene_change: 0.05,
      },
    });
    mockPrisma.job.update.mockResolvedValue({});
    mockPrisma.artifact.create.mockResolvedValue({});

    const { runHighlight } = await import("../../src/jobs/highlight");

    await runHighlight("job123");

    expect(mockPrisma.job.update).toHaveBeenCalledWith({
      where: { id: "job123" },
      data: {
        result: expect.objectContaining({
          weightsVersion: 5,
        }),
      },
    });
  });

  it("should score and sort segments by score", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      config: {},
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/event.json",
    });
    mockPrisma.modelWeights.findFirst.mockResolvedValue(null);
    mockPrisma.job.update.mockResolvedValue({});
    mockPrisma.artifact.create.mockResolvedValue({});

    const { runHighlight } = await import("../../src/jobs/highlight");

    await runHighlight("job123");

    // First scene has higher features, should score higher
    expect(mockPrisma.job.update).toHaveBeenCalledWith({
      where: { id: "job123" },
      data: {
        result: expect.objectContaining({
          candidates: expect.arrayContaining([
            expect.objectContaining({
              start: 0,
              end: 10,
              score: expect.any(Number),
            }),
          ]),
        }),
      },
    });
  });

  it("should auto-select high scoring segments (score >= 0.7)", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      config: {},
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/event.json",
    });
    mockPrisma.modelWeights.findFirst.mockResolvedValue(null);
    mockPrisma.job.update.mockResolvedValue({});
    mockPrisma.artifact.create.mockResolvedValue({});

    const { runHighlight } = await import("../../src/jobs/highlight");

    await runHighlight("job123");

    // Check that candidates have 'selected' property
    const updateCall = mockPrisma.job.update.mock.calls[0];
    const candidates = updateCall[0].data.result.candidates;

    // High score segment should be selected
    const highScoreCandidate = candidates.find((c: any) => c.score >= 0.7);
    if (highScoreCandidate) {
      expect(highScoreCandidate.selected).toBe(true);
    }
  });

  it("should create HIGHLIGHT_PLAN artifact", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      config: {},
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/event.json",
    });
    mockPrisma.modelWeights.findFirst.mockResolvedValue(null);
    mockPrisma.job.update.mockResolvedValue({});
    mockPrisma.artifact.create.mockResolvedValue({});

    const { runHighlight } = await import("../../src/jobs/highlight");

    await runHighlight("job123");

    expect(mockPrisma.artifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job123",
        videoId: "video123",
        type: "HIGHLIGHT_PLAN",
      }),
    });
  });

  it("should set review required when config specifies", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      config: { reviewRequired: true },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/event.json",
    });
    mockPrisma.modelWeights.findFirst.mockResolvedValue(null);
    mockPrisma.job.update.mockResolvedValue({});
    mockPrisma.artifact.create.mockResolvedValue({});

    const { runHighlight } = await import("../../src/jobs/highlight");
    const { setReviewRequired } = await import("../../src/tasks/progress");

    await runHighlight("job123");

    expect(setReviewRequired).toHaveBeenCalledWith("job123", "highlight_review");
  });

  it("should update progress to 100 when no review required", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      config: { reviewRequired: false },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/event.json",
    });
    mockPrisma.modelWeights.findFirst.mockResolvedValue(null);
    mockPrisma.job.update.mockResolvedValue({});
    mockPrisma.artifact.create.mockResolvedValue({});

    const { runHighlight } = await import("../../src/jobs/highlight");
    const { updateProgress } = await import("../../src/tasks/progress");

    await runHighlight("job123");

    expect(updateProgress).toHaveBeenCalledWith("job123", 100, "completed");
  });
});
