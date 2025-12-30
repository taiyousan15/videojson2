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

const mockOcrResults = [
  {
    id: "ocr_0_0",
    text: "Hello World",
    bbox: { x: 100, y: 100, width: 200, height: 50 },
    timestamp: 1.0,
    confidence: 0.95,
  },
  {
    id: "ocr_1_0",
    text: "Test Text",
    bbox: { x: 150, y: 200, width: 150, height: 40 },
    timestamp: 2.0,
    confidence: 0.88,
  },
];

vi.mock("../../src/providers/ocr/vision", () => ({
  CloudVisionOcr: class {
    processFrames = vi.fn().mockResolvedValue(mockOcrResults);
  },
}));

vi.mock("../../src/ffmpeg/extractFrames", () => ({
  extractFrames: vi.fn().mockResolvedValue([
    { path: "/tmp/frame_0.jpg", timestamp: 1.0, index: 0 },
    { path: "/tmp/frame_1.jpg", timestamp: 2.0, index: 1 },
    { path: "/tmp/frame_2.jpg", timestamp: 3.0, index: 2 },
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

describe("runOcr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should throw error if job not found", async () => {
    mockPrisma.job.findUnique.mockResolvedValue(null);

    const { runOcr } = await import("../../src/jobs/ocr");

    await expect(runOcr("nonexistent")).rejects.toThrow("Job not found: nonexistent");
  });

  it("should throw error if normalized video not found", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
    });
    mockPrisma.artifact.findFirst.mockResolvedValue(null);

    const { runOcr } = await import("../../src/jobs/ocr");

    await expect(runOcr("job123")).rejects.toThrow("Normalized video not found");
  });

  it("should extract frames from video", async () => {
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

    const { runOcr } = await import("../../src/jobs/ocr");
    const { extractFrames } = await import("../../src/ffmpeg/extractFrames");

    await runOcr("job123");

    expect(extractFrames).toHaveBeenCalledWith(
      expect.stringContaining("video.mp4"),
      expect.any(String),
      expect.objectContaining({ fps: 1 })
    );
  });

  it("should process frames with Cloud Vision OCR", async () => {
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

    const { runOcr } = await import("../../src/jobs/ocr");

    await runOcr("job123");

    // Verify artifact was created with OCR_REPORT type
    expect(mockPrisma.artifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "OCR_REPORT",
      }),
    });
  });

  it("should upload OCR results to GCS", async () => {
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

    const { runOcr } = await import("../../src/jobs/ocr");
    const { uploadJSON } = await import("../../src/utils/gcs");

    await runOcr("job123");

    expect(uploadJSON).toHaveBeenCalled();
  });

  it("should create OCR_RESULT artifact", async () => {
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

    const { runOcr } = await import("../../src/jobs/ocr");

    await runOcr("job123");

    expect(mockPrisma.artifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job123",
        videoId: "video123",
        type: "OCR_REPORT",
      }),
    });
  });

  it("should set review required after processing", async () => {
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

    const { runOcr } = await import("../../src/jobs/ocr");
    const { setReviewRequired } = await import("../../src/tasks/progress");

    await runOcr("job123");

    // OCR results always require review (P4: Human-in-the-loop)
    expect(setReviewRequired).toHaveBeenCalledWith("job123", "ocr_review_required");
  });

  it("should cleanup work directory after processing", async () => {
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
    const { runOcr } = await import("../../src/jobs/ocr");

    await runOcr("job123");

    expect(fs.rm).toHaveBeenCalledWith(
      expect.stringContaining("/tmp/ocr_"),
      { recursive: true, force: true }
    );
  });
});
