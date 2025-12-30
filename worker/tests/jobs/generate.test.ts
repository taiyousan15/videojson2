import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
const mockPrisma = {
  job: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
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
}));

const mockGenerationResult = {
  success: true,
  renderScript: {
    duration: 30,
    resolution: { width: 1920, height: 1080 },
    tracks: [{ type: "video", segments: [] }],
  },
  assets: [{ id: "asset1", type: "image", path: "gs://bucket/image.png" }],
  videoUrl: "gs://bucket/output.mp4",
  stats: { generationTime: 5000 },
  errors: [],
};

vi.mock("../../src/pipelines/video_generation", () => ({
  getVideoGenerationPipeline: vi.fn(() => ({
    generate: vi.fn().mockResolvedValue(mockGenerationResult),
  })),
  VideoGenerationPipeline: class {},
}));

const mockFile = {
  download: vi.fn().mockResolvedValue([Buffer.from(JSON.stringify({ name: "Test Template" }))]),
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

describe("runGenerate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GCS_BUCKET = "test-bucket";
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should throw error if job not found", async () => {
    mockPrisma.job.findUnique.mockResolvedValue(null);

    const { runGenerate } = await import("../../src/jobs/generate");

    await expect(runGenerate("nonexistent")).rejects.toThrow("Job not found: nonexistent");
  });

  it("should throw error if template not found", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      payload: { templateId: "template123" },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue(null);

    const { runGenerate } = await import("../../src/jobs/generate");

    await expect(runGenerate("job123")).rejects.toThrow("Template not found");
  });

  it("should generate from template and create artifacts", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      payload: {
        templateId: "template123",
        replacements: { p1: "Hello World" },
      },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/template.json",
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runGenerate } = await import("../../src/jobs/generate");

    await runGenerate("job123");

    // Should create RENDER_SCRIPT artifact
    expect(mockPrisma.artifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job123",
        videoId: "video123",
        type: "RENDER_SCRIPT",
      }),
    });
  });

  it("should update job result on completion", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      payload: {
        templateId: "template123",
        replacements: { p1: "Hello" },
      },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/template.json",
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runGenerate } = await import("../../src/jobs/generate");

    await runGenerate("job123");

    expect(mockPrisma.job.update).toHaveBeenCalledWith({
      where: { id: "job123" },
      data: {
        result: expect.objectContaining({
          success: true,
        }),
      },
    });
  });

  it("should update progress to 100 on completion", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      payload: {
        templateId: "template123",
        replacements: {},
      },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "artifact123",
      gcsUri: "gs://bucket/template.json",
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runGenerate } = await import("../../src/jobs/generate");
    const { updateProgress } = await import("../../src/tasks/progress");

    await runGenerate("job123");

    expect(updateProgress).toHaveBeenCalledWith("job123", 100, "completed");
  });
});

describe("createGenerationJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should create a new generation job", async () => {
    mockPrisma.job.create.mockResolvedValue({ id: "newjob123" });

    const { createGenerationJob } = await import("../../src/jobs/generate");

    const jobId = await createGenerationJob(
      "video123",
      "template123",
      { p1: { value: "Hello World" } },
      { quality: "high" }
    );

    expect(jobId).toBe("newjob123");
    expect(mockPrisma.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        videoId: "video123",
        type: "GENERATE",
        status: "QUEUED",
        payload: expect.objectContaining({
          templateId: "template123",
        }),
      }),
    });
  });
});
