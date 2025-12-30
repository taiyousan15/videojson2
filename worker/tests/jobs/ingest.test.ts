import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing the module
const mockPrisma = {
  job: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  video: {
    update: vi.fn(),
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
}));

vi.mock("../../src/ffmpeg/transcode", () => ({
  transcode: vi.fn().mockResolvedValue("/tmp/ingest_job123/normalized.mp4"),
}));

vi.mock("../../src/utils/hashing", () => ({
  computeHash: vi.fn().mockResolvedValue("abc123sha256hash"),
}));

vi.mock("../../src/utils/gcs", () => ({
  downloadFile: vi.fn().mockResolvedValue(undefined),
  uploadFile: vi.fn().mockResolvedValue(undefined),
  getDefaultBucket: vi.fn().mockReturnValue("test-bucket"),
  buildGcsUri: vi.fn((bucket, path) => `gs://${bucket}/${path}`),
}));

vi.mock("fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

describe("runIngest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should throw error if job not found", async () => {
    mockPrisma.job.findUnique.mockResolvedValue(null);

    const { runIngest } = await import("../../src/jobs/ingest");

    await expect(runIngest("nonexistent")).rejects.toThrow("Job not found: nonexistent");
  });

  it("should throw error if no source URI", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123", gcsUri: null, sourceUrl: null },
    });

    const { runIngest } = await import("../../src/jobs/ingest");

    await expect(runIngest("job123")).rejects.toThrow("No source video URI");
  });

  it("should process video from GCS URI", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123", gcsUri: "gs://source-bucket/video.mp4", sourceUrl: null },
    });
    mockPrisma.video.update.mockResolvedValue({});
    mockPrisma.artifact.create.mockResolvedValue({});

    const { runIngest } = await import("../../src/jobs/ingest");
    const { downloadFile, uploadFile } = await import("../../src/utils/gcs");
    const { transcode } = await import("../../src/ffmpeg/transcode");
    const { updateProgress } = await import("../../src/tasks/progress");

    await runIngest("job123");

    expect(downloadFile).toHaveBeenCalled();
    expect(transcode).toHaveBeenCalled();
    expect(uploadFile).toHaveBeenCalled();
    expect(updateProgress).toHaveBeenCalledWith("job123", 100, "completed");
  });

  it("should create normalized video artifact", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123", gcsUri: "gs://bucket/video.mp4" },
    });
    mockPrisma.video.update.mockResolvedValue({});
    mockPrisma.artifact.create.mockResolvedValue({});

    const { runIngest } = await import("../../src/jobs/ingest");

    await runIngest("job123");

    expect(mockPrisma.artifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job123",
        videoId: "video123",
        type: "NORMALIZED_VIDEO",
        gcsUri: expect.stringContaining("gs://"),
      }),
    });
  });

  it("should update video with sha256 hash", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123", gcsUri: "gs://bucket/video.mp4" },
    });
    mockPrisma.video.update.mockResolvedValue({});
    mockPrisma.artifact.create.mockResolvedValue({});

    const { runIngest } = await import("../../src/jobs/ingest");

    await runIngest("job123");

    expect(mockPrisma.video.update).toHaveBeenCalledWith({
      where: { id: "video123" },
      data: expect.objectContaining({
        sha256: "abc123sha256hash",
        status: "READY",
      }),
    });
  });

  it("should clean up work directory on success", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123", gcsUri: "gs://bucket/video.mp4" },
    });
    mockPrisma.video.update.mockResolvedValue({});
    mockPrisma.artifact.create.mockResolvedValue({});

    const fs = await import("fs/promises");
    const { runIngest } = await import("../../src/jobs/ingest");

    await runIngest("job123");

    expect(fs.rm).toHaveBeenCalledWith(
      expect.stringContaining("/tmp/ingest_"),
      { recursive: true, force: true }
    );
  });

  it("should clean up work directory on failure", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123", gcsUri: "gs://bucket/video.mp4" },
    });

    const { transcode } = await import("../../src/ffmpeg/transcode");
    vi.mocked(transcode).mockRejectedValueOnce(new Error("Transcode failed"));

    const fs = await import("fs/promises");
    const { runIngest } = await import("../../src/jobs/ingest");

    await expect(runIngest("job123")).rejects.toThrow("Transcode failed");

    expect(fs.rm).toHaveBeenCalled();
  });
});
