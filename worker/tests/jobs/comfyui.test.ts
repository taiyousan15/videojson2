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

const mockGeneratedImages = [
  { path: "gs://bucket/image1.png", seed: 12345 },
  { path: "gs://bucket/image2.png", seed: 12346 },
];

vi.mock("../../src/pipelines/comfyui", () => ({
  getComfyUIPipeline: vi.fn(() => ({
    getStatus: vi.fn().mockResolvedValue({ connected: true, queueSize: 0 }),
    generateImage: vi.fn().mockResolvedValue({
      success: true,
      images: [{ filename: "image1.png", localPath: "/tmp/image1.png" }],
      promptId: "prompt123",
    }),
    transformImage: vi.fn().mockResolvedValue({
      success: true,
      images: [{ filename: "image1.png", localPath: "/tmp/image1.png" }],
    }),
    generateVideo: vi.fn().mockResolvedValue({
      success: true,
      images: [{ filename: "video.mp4", localPath: "/tmp/video.mp4" }],
    }),
    batchGenerate: vi.fn().mockResolvedValue({
      success: true,
      tasks: [],
      failedCount: 0,
      outputUris: ["gs://bucket/image1.png"],
      totalTime: 1000,
    }),
    executeWorkflow: vi.fn().mockResolvedValue({
      success: true,
      images: [{ filename: "output.png", localPath: "/tmp/output.png" }],
      promptId: "workflow123",
    }),
    generatePlaceholderAssets: vi.fn().mockResolvedValue({
      success: true,
      results: [{ placeholderId: "p1", gcsUri: "gs://bucket/placeholder.png" }],
    }),
  })),
}));

vi.mock("../../src/utils/gcs", () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
  getDefaultBucket: vi.fn().mockReturnValue("test-bucket"),
  buildGcsUri: vi.fn((bucket, path) => `gs://${bucket}/${path}`),
}));

const mockBucket = {
  upload: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@google-cloud/storage", () => ({
  Storage: class {
    bucket() {
      return mockBucket;
    }
  },
}));

vi.mock("fs", () => ({
  existsSync: vi.fn().mockReturnValue(false), // No local files to upload
  unlinkSync: vi.fn(),
}));

describe("runComfyUI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should throw error if job not found", async () => {
    mockPrisma.job.findUnique.mockResolvedValue(null);

    const { runComfyUI } = await import("../../src/jobs/comfyui");

    await expect(runComfyUI("nonexistent")).rejects.toThrow("Job not found");
  });

  it("should process text-to-image request", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      payload: {
        type: "text-to-image",
        request: {
          prompt: "A beautiful sunset",
          negativePrompt: "ugly, blurry",
        },
      },
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runComfyUI } = await import("../../src/jobs/comfyui");

    await runComfyUI("job123");

    // Verify job was updated with success result
    expect(mockPrisma.job.update).toHaveBeenCalledWith({
      where: { id: "job123" },
      data: {
        result: expect.objectContaining({
          success: true,
          type: "text-to-image",
        }),
      },
    });
  });

  it("should process batch request", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      payload: {
        type: "batch",
        request: {
          tasks: [{ type: "text-to-image", request: { prompt: "sunset" } }],
        },
      },
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runComfyUI } = await import("../../src/jobs/comfyui");

    await runComfyUI("job123");

    expect(mockPrisma.job.update).toHaveBeenCalledWith({
      where: { id: "job123" },
      data: {
        result: expect.objectContaining({
          type: "batch",
        }),
      },
    });
  });

  it("should process workflow request", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      payload: {
        type: "workflow",
        request: {
          workflowName: "custom_workflow",
          inputs: { param1: "value1" },
        },
      },
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runComfyUI } = await import("../../src/jobs/comfyui");

    await runComfyUI("job123");

    expect(mockPrisma.job.update).toHaveBeenCalledWith({
      where: { id: "job123" },
      data: {
        result: expect.objectContaining({
          success: true,
          type: "workflow",
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
        type: "text-to-image",
        request: { prompt: "test" },
      },
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runComfyUI } = await import("../../src/jobs/comfyui");
    const { updateProgress } = await import("../../src/tasks/progress");

    await runComfyUI("job123");

    expect(updateProgress).toHaveBeenCalledWith("job123", 100, "completed");
  });
});

describe("createComfyUIJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should create a new ComfyUI job", async () => {
    mockPrisma.job.create.mockResolvedValue({ id: "newjob123" });

    const { createComfyUIJob } = await import("../../src/jobs/comfyui");

    const jobId = await createComfyUIJob(
      "video123",
      "text-to-image",
      { prompt: "A beautiful sunset" },
      { outputBucket: "custom-bucket" }
    );

    expect(jobId).toBe("newjob123");
    expect(mockPrisma.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        videoId: "video123",
        type: "COMFYUI",
        status: "QUEUED",
      }),
    });
  });
});
