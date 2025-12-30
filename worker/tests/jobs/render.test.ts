import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
const mockPrisma = {
  job: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  artifact: {
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

const mockRenderResult = {
  duration: 30.5,
  fileSize: 1024000,
  format: "mp4",
  resolution: { width: 1920, height: 1080 },
};

vi.mock("../../src/pipelines/ffmpeg", () => ({
  getFFmpegRenderer: vi.fn(() => ({
    renderToGCS: vi.fn().mockImplementation(async (script, bucket, path, options, progressCallback) => {
      // Simulate progress
      progressCallback({ percent: 50, time: "00:15.000", speed: "2.5x" });
      progressCallback({ percent: 100, time: "00:30.500", speed: "2.5x" });
      return mockRenderResult;
    }),
    generateThumbnail: vi.fn().mockResolvedValue(undefined),
  })),
}));

const mockRenderScript = {
  duration: 30,
  tracks: [
    {
      type: "video",
      segments: [{ start: 0, end: 30, source: "gs://bucket/source.mp4" }],
    },
  ],
};

vi.mock("../../src/utils/gcs", () => ({
  downloadJSON: vi.fn().mockResolvedValue(mockRenderScript),
}));

const mockFile = {
  download: vi.fn().mockResolvedValue(undefined),
};

const mockBucket = {
  file: vi.fn(() => mockFile),
  upload: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@google-cloud/storage", () => ({
  Storage: class {
    bucket() {
      return mockBucket;
    }
  },
}));

vi.mock("../../src/services/webhook", () => ({
  notifyRenderCompleted: vi.fn().mockResolvedValue(undefined),
}));

describe("runRender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GCS_BUCKET = "test-bucket";
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should throw error if job not found", async () => {
    mockPrisma.job.findUnique.mockResolvedValue(null);

    const { runRender } = await import("../../src/jobs/render");

    await expect(runRender("nonexistent")).rejects.toThrow("Job not found: nonexistent");
  });

  it("should download and process render script", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      payload: {
        renderScriptUri: "gs://bucket/script.json",
      },
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runRender } = await import("../../src/jobs/render");
    const { downloadJSON } = await import("../../src/utils/gcs");

    await runRender("job123");

    expect(downloadJSON).toHaveBeenCalledWith("gs://bucket/script.json");
  });

  it("should render video using FFmpeg", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      payload: {
        renderScriptUri: "gs://bucket/script.json",
        outputOptions: { quality: "high" },
      },
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runRender } = await import("../../src/jobs/render");

    await runRender("job123");

    // Just verify the job was updated with result
    expect(mockPrisma.job.update).toHaveBeenCalledWith({
      where: { id: "job123" },
      data: {
        result: expect.objectContaining({
          success: true,
        }),
      },
    });
  });

  it("should create OUTPUT_VIDEO artifact", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      payload: {
        renderScriptUri: "gs://bucket/script.json",
      },
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runRender } = await import("../../src/jobs/render");

    await runRender("job123");

    expect(mockPrisma.artifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job123",
        videoId: "video123",
        type: "OUTPUT_VIDEO",
        metadata: expect.objectContaining({
          duration: mockRenderResult.duration,
          fileSize: mockRenderResult.fileSize,
        }),
      }),
    });
  });

  it("should update job with render result", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      payload: {
        renderScriptUri: "gs://bucket/script.json",
      },
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runRender } = await import("../../src/jobs/render");

    await runRender("job123");

    expect(mockPrisma.job.update).toHaveBeenCalledWith({
      where: { id: "job123" },
      data: {
        result: expect.objectContaining({
          success: true,
          renderDuration: mockRenderResult.duration,
          fileSize: mockRenderResult.fileSize,
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
        renderScriptUri: "gs://bucket/script.json",
      },
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runRender } = await import("../../src/jobs/render");
    const { updateProgress } = await import("../../src/tasks/progress");

    await runRender("job123");

    expect(updateProgress).toHaveBeenCalledWith("job123", 100, "completed");
  });
});

describe("createRenderJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should create a new render job", async () => {
    mockPrisma.job.create.mockResolvedValue({ id: "newjob123" });

    const { createRenderJob } = await import("../../src/jobs/render");

    const jobId = await createRenderJob(
      "video123",
      "gs://bucket/script.json",
      { quality: "high" },
      true
    );

    expect(jobId).toBe("newjob123");
    expect(mockPrisma.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        videoId: "video123",
        type: "RENDER",
        status: "QUEUED",
        payload: expect.objectContaining({
          renderScriptUri: "gs://bucket/script.json",
          generateThumbnail: true,
        }),
      }),
    });
  });

  it("should default generateThumbnail to true", async () => {
    mockPrisma.job.create.mockResolvedValue({ id: "newjob123" });

    const { createRenderJob } = await import("../../src/jobs/render");

    await createRenderJob("video123", "gs://bucket/script.json");

    expect(mockPrisma.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          generateThumbnail: true,
        }),
      }),
    });
  });
});
