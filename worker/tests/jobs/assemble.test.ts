import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
const mockPrisma = {
  job: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  artifact: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  run: {
    create: vi.fn(),
  },
  output: {
    create: vi.fn(),
  },
};

vi.mock("../../src/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("../../src/tasks/progress", () => ({
  updateProgress: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/utils/gcs", () => ({
  downloadJSON: vi.fn().mockResolvedValue({}),
  downloadFile: vi.fn().mockResolvedValue(undefined),
  uploadFile: vi.fn().mockResolvedValue(undefined),
  getDefaultBucket: vi.fn().mockReturnValue("test-bucket"),
  buildGcsUri: vi.fn((bucket, path) => `gs://${bucket}/${path}`),
}));

vi.mock("../../src/ffmpeg/concat", () => ({
  concat: vi.fn().mockResolvedValue("/tmp/assemble_job123/concat.mp4"),
}));

vi.mock("../../src/ffmpeg/generateAss", () => ({
  generateAssFromAuthoring: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/ffmpeg/burnSubtitles", () => ({
  burnSubtitles: vi.fn().mockResolvedValue("/tmp/assemble_job123/final.mp4"),
}));

vi.mock("../../src/ffmpeg/mixAudio", () => ({
  mixAudio: vi.fn().mockResolvedValue("/tmp/assemble_job123/final.mp4"),
}));

vi.mock("../../src/services/state-json", () => ({
  generateStateJson: vi.fn().mockResolvedValue({ gcsUri: "gs://bucket/state.json" }),
}));

vi.mock("fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

describe("runAssemble", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should throw error if job not found", async () => {
    mockPrisma.job.findUnique.mockResolvedValue(null);

    const { runAssemble } = await import("../../src/jobs/assemble");

    await expect(runAssemble("nonexistent")).rejects.toThrow("Job not found: nonexistent");
  });

  it("should throw error if no render job found", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
    });
    mockPrisma.job.findFirst.mockResolvedValue(null); // No render job

    const { runAssemble } = await import("../../src/jobs/assemble");

    await expect(runAssemble("job123")).rejects.toThrow("No successful render job found");
  });

  it("should throw error if no clips in render result", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
    });
    mockPrisma.job.findFirst.mockResolvedValue({
      id: "render123",
      result: { clips: [] }, // Empty clips
    });

    const { runAssemble } = await import("../../src/jobs/assemble");

    await expect(runAssemble("job123")).rejects.toThrow("No clips found in render result");
  });

  it("should concat clips and create output", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      config: {},
    });
    mockPrisma.job.findFirst
      .mockResolvedValueOnce({
        id: "render123",
        result: { clips: ["gs://bucket/clip1.mp4", "gs://bucket/clip2.mp4"] },
      });
    mockPrisma.artifact.findFirst.mockResolvedValue(null); // No authoring artifact
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.run.create.mockResolvedValue({ id: "run123" });
    mockPrisma.output.create.mockResolvedValue({});

    const { runAssemble } = await import("../../src/jobs/assemble");
    const { concat } = await import("../../src/ffmpeg/concat");

    await runAssemble("job123");

    expect(concat).toHaveBeenCalled();
  });

  it("should create OUTPUT_VIDEO artifact", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      config: {},
    });
    mockPrisma.job.findFirst
      .mockResolvedValueOnce({
        id: "render123",
        result: { clips: ["gs://bucket/clip1.mp4"] },
      });
    mockPrisma.artifact.findFirst.mockResolvedValue(null);
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.run.create.mockResolvedValue({ id: "run123" });
    mockPrisma.output.create.mockResolvedValue({});

    const { runAssemble } = await import("../../src/jobs/assemble");

    await runAssemble("job123");

    expect(mockPrisma.artifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job123",
        videoId: "video123",
        type: "OUTPUT_VIDEO",
      }),
    });
  });

  it("should update progress to 100 on completion", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      config: {},
    });
    mockPrisma.job.findFirst
      .mockResolvedValueOnce({
        id: "render123",
        result: { clips: ["gs://bucket/clip1.mp4"] },
      });
    mockPrisma.artifact.findFirst.mockResolvedValue(null);
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.run.create.mockResolvedValue({ id: "run123" });
    mockPrisma.output.create.mockResolvedValue({});

    const { runAssemble } = await import("../../src/jobs/assemble");
    const { updateProgress } = await import("../../src/tasks/progress");

    await runAssemble("job123");

    expect(updateProgress).toHaveBeenCalledWith("job123", 100, "completed");
  });

  it("should cleanup work directory", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
      videoId: "video123",
      video: { id: "video123" },
      config: {},
    });
    mockPrisma.job.findFirst
      .mockResolvedValueOnce({
        id: "render123",
        result: { clips: ["gs://bucket/clip1.mp4"] },
      });
    mockPrisma.artifact.findFirst.mockResolvedValue(null);
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.run.create.mockResolvedValue({ id: "run123" });
    mockPrisma.output.create.mockResolvedValue({});

    const fs = await import("fs/promises");
    const { runAssemble } = await import("../../src/jobs/assemble");

    await runAssemble("job123");

    expect(fs.rm).toHaveBeenCalledWith(
      expect.stringContaining("/tmp/assemble_"),
      { recursive: true, force: true }
    );
  });
});
