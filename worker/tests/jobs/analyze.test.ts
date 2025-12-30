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
  setWaitingExternal: vi.fn().mockResolvedValue(undefined),
  resumeFromWaiting: vi.fn().mockResolvedValue(undefined),
  setReviewRequired: vi.fn().mockResolvedValue(undefined),
}));

const mockAnalysisResult = {
  duration: 120,
  resolution: { width: 1920, height: 1080 },
  fps: 30,
  summary: "Test video summary",
  language: "en",
  tags: ["test", "video"],
  scenes: [{ start: 0, end: 30, description: "Scene 1" }],
  chapters: [],
  entities: [{ id: "e1", type: "PERSON", name: "Test Person", confidence: 0.9 }],
  events: [{ type: "action", timestamp: 10, description: "Test event" }],
  transcript: [{ start: 0, end: 5, text: "Hello world", confidence: 0.95 }],
  onScreenTexts: [],
  pipeline: {
    providersUsed: ["gemini"],
    totalDuration: 5000,
  },
};

const mockTemplate = {
  version: "1.0",
  structure: {
    sections: [{ id: "s1", start: 0, end: 30 }],
    totalDuration: 120,
  },
  placeholders: [{ id: "p1", type: "text", path: "/scenes/0/narration" }],
};

vi.mock("../../src/pipelines/video_analysis", () => ({
  getAnalysisPipeline: vi.fn(() => ({
    analyze: vi.fn().mockResolvedValue(mockAnalysisResult),
  })),
  VideoAnalysisPipeline: class {},
}));

vi.mock("../../src/pipelines/template_extraction", () => ({
  getTemplateExtractor: vi.fn(() => ({
    extract: vi.fn().mockResolvedValue(mockTemplate),
  })),
  TemplateExtractor: class {},
}));

const mockFile = {
  save: vi.fn().mockResolvedValue(undefined),
};

const mockBucket = {
  file: vi.fn(() => mockFile),
};

vi.mock("@google-cloud/storage", () => ({
  Storage: class {
    bucket() {
      return mockBucket;
    }
  },
}));

describe("runAnalyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GCS_BUCKET = "test-bucket";
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should throw error if job not found", async () => {
    mockPrisma.job.findUnique.mockResolvedValue(null);

    const { runAnalyze } = await import("../../src/jobs/analyze");

    await expect(runAnalyze("nonexistent")).rejects.toThrow("Job not found: nonexistent");
  });

  it("should throw error if normalized video not found", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123", title: "Test Video" },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue(null);

    const { runAnalyze } = await import("../../src/jobs/analyze");

    await expect(runAnalyze("job123")).rejects.toThrow("Normalized video not found");
  });

  it("should run analysis pipeline", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123", title: "Test Video" },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/normalized.mp4",
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runAnalyze } = await import("../../src/jobs/analyze");
    const { getAnalysisPipeline } = await import("../../src/pipelines/video_analysis");

    await runAnalyze("job123");

    // Verify pipeline was used
    expect(getAnalysisPipeline).toHaveBeenCalled();

    // Verify job was updated with results
    expect(mockPrisma.job.update).toHaveBeenCalledWith({
      where: { id: "job123" },
      data: {
        result: expect.objectContaining({
          eventJsonUri: expect.any(String),
          templateJsonUri: expect.any(String),
        }),
      },
    });
  });

  it("should create EVENT_JSON artifact", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123", title: "Test Video" },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/normalized.mp4",
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runAnalyze } = await import("../../src/jobs/analyze");

    await runAnalyze("job123");

    expect(mockPrisma.artifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job123",
        videoId: "video123",
        type: "EVENT_JSON",
      }),
    });
  });

  it("should create TEMPLATE_JSON artifact", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123", title: "Test Video" },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/normalized.mp4",
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runAnalyze } = await import("../../src/jobs/analyze");

    await runAnalyze("job123");

    const createCalls = mockPrisma.artifact.create.mock.calls;
    expect(createCalls.some((call: any) => call[0].data.type === "TEMPLATE_JSON")).toBe(true);
  });

  it("should update progress to 100 on completion", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123", title: "Test Video" },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/normalized.mp4",
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runAnalyze } = await import("../../src/jobs/analyze");
    const { updateProgress } = await import("../../src/tasks/progress");

    await runAnalyze("job123");

    expect(updateProgress).toHaveBeenCalledWith("job123", 100, "completed");
  });
});
