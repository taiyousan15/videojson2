import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
const mockPrisma = {
  job: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  modelWeights: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  highlightFeedback: {
    findMany: vi.fn(),
  },
};

vi.mock("../../src/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("../../src/tasks/progress", () => ({
  updateProgress: vi.fn().mockResolvedValue(undefined),
}));

const mockFeedbackData = [
  {
    id: "fb1",
    videoId: "video1",
    rating: 4,
    createdAt: new Date(),
  },
  {
    id: "fb2",
    videoId: "video2",
    rating: 5,
    createdAt: new Date(),
  },
];

describe("runTrain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should throw error if job not found", async () => {
    mockPrisma.job.findUnique.mockResolvedValue(null);

    const { runTrain } = await import("../../src/jobs/train");

    await expect(runTrain("nonexistent")).rejects.toThrow("Job not found: nonexistent");
  });

  it("should collect feedback for training", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
    });
    mockPrisma.highlightFeedback.findMany.mockResolvedValue(mockFeedbackData);
    mockPrisma.modelWeights.findFirst.mockResolvedValue(null);
    mockPrisma.modelWeights.create.mockResolvedValue({ id: "weights1", version: 1 });
    mockPrisma.job.update.mockResolvedValue({});

    const { runTrain } = await import("../../src/jobs/train");

    await runTrain("job123");

    expect(mockPrisma.highlightFeedback.findMany).toHaveBeenCalled();
  });

  it("should throw error if no feedback data", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
    });
    mockPrisma.highlightFeedback.findMany.mockResolvedValue([]); // No feedback
    mockPrisma.job.update.mockResolvedValue({});

    const { runTrain } = await import("../../src/jobs/train");

    await expect(runTrain("job123")).rejects.toThrow("No feedback data available");
  });

  it("should create new model weights when none exist", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
    });
    mockPrisma.highlightFeedback.findMany.mockResolvedValue(mockFeedbackData);
    mockPrisma.modelWeights.findFirst.mockResolvedValue(null);
    mockPrisma.modelWeights.create.mockResolvedValue({ id: "weights1", version: 1 });
    mockPrisma.job.update.mockResolvedValue({});

    const { runTrain } = await import("../../src/jobs/train");

    await runTrain("job123");

    expect(mockPrisma.modelWeights.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "highlight_scorer",
        version: 1,
        active: true,
      }),
    });
  });

  it("should update existing model weights", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
    });
    mockPrisma.highlightFeedback.findMany.mockResolvedValue(mockFeedbackData);
    mockPrisma.modelWeights.findFirst.mockResolvedValue({
      id: "weights1",
      name: "highlight_scorer",
      version: 5,
      weights: {
        action_intensity: 0.3,
        face_presence: 0.2,
        audio_energy: 0.2,
        text_density: 0.15,
        scene_change: 0.15,
      },
    });
    mockPrisma.modelWeights.create.mockResolvedValue({ id: "weights2", version: 6 });
    mockPrisma.modelWeights.update.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runTrain } = await import("../../src/jobs/train");

    await runTrain("job123");

    // Should deactivate old weights
    expect(mockPrisma.modelWeights.update).toHaveBeenCalledWith({
      where: { id: "weights1" },
      data: { active: false },
    });

    // Should create new weights with incremented version
    expect(mockPrisma.modelWeights.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "highlight_scorer",
        version: 6,
        active: true,
      }),
    });
  });

  it("should update job result with training metrics", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
    });
    mockPrisma.highlightFeedback.findMany.mockResolvedValue(mockFeedbackData);
    mockPrisma.modelWeights.findFirst.mockResolvedValue(null);
    mockPrisma.modelWeights.create.mockResolvedValue({ id: "weights1", version: 1 });
    mockPrisma.job.update.mockResolvedValue({});

    const { runTrain } = await import("../../src/jobs/train");

    await runTrain("job123");

    expect(mockPrisma.job.update).toHaveBeenCalledWith({
      where: { id: "job123" },
      data: {
        result: expect.objectContaining({
          newVersion: 1,
          feedbackCount: 2,
        }),
      },
    });
  });

  it("should update progress to 100 on completion", async () => {
    mockPrisma.job.findUnique.mockResolvedValue({
      id: "job123",
    });
    mockPrisma.highlightFeedback.findMany.mockResolvedValue(mockFeedbackData);
    mockPrisma.modelWeights.findFirst.mockResolvedValue(null);
    mockPrisma.modelWeights.create.mockResolvedValue({ id: "weights1", version: 1 });
    mockPrisma.job.update.mockResolvedValue({});

    const { runTrain } = await import("../../src/jobs/train");
    const { updateProgress } = await import("../../src/tasks/progress");

    await runTrain("job123");

    expect(updateProgress).toHaveBeenCalledWith("job123", 100, "completed");
  });
});
