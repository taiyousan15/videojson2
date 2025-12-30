/**
 * E2E Workflow Tests
 *
 * Tests complete end-to-end workflows:
 * - Video ingest → analyze flow
 * - Template apply → generate flow
 * - Webhook notification flow
 * - Error handling scenarios
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock all external dependencies
const mockPrisma = {
  $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  $disconnect: vi.fn().mockResolvedValue(undefined),
  job: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  video: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  artifact: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  webhook: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  webhookDelivery: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  modelWeights: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  highlightFeedback: {
    findMany: vi.fn(),
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

// Mock GCS
const mockGcs = {
  downloadFile: vi.fn().mockResolvedValue(undefined),
  uploadFile: vi.fn().mockResolvedValue(undefined),
  downloadJSON: vi.fn().mockResolvedValue({}),
  uploadJSON: vi.fn().mockResolvedValue(undefined),
  getDefaultBucket: vi.fn().mockReturnValue("test-bucket"),
  buildGcsUri: vi.fn((bucket: string, path: string) => `gs://${bucket}/${path}`),
  parseGcsUri: vi.fn((uri: string) => {
    const match = uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
    return match ? { bucket: match[1], path: match[2] } : null;
  }),
};

vi.mock("../../src/utils/gcs", () => mockGcs);

// Mock FFmpeg
vi.mock("../../src/ffmpeg/normalize", () => ({
  normalizeVideo: vi.fn().mockResolvedValue("/tmp/normalized.mp4"),
}));

vi.mock("../../src/ffmpeg/transcode", () => ({
  transcode: vi.fn().mockResolvedValue("/tmp/transcoded.mp4"),
}));

vi.mock("../../src/ffmpeg/extractFrames", () => ({
  extractFrames: vi.fn().mockResolvedValue([
    { path: "/tmp/frame_0.jpg", timestamp: 0, index: 0 },
    { path: "/tmp/frame_1.jpg", timestamp: 1, index: 1 },
  ]),
  extractEvenlyDistributedFrames: vi.fn().mockResolvedValue([
    { path: "/tmp/frame_0.jpg", timestamp: 0, index: 0 },
    { path: "/tmp/frame_1.jpg", timestamp: 4, index: 1 },
    { path: "/tmp/frame_2.jpg", timestamp: 8, index: 2 },
  ]),
}));

vi.mock("../../src/ffmpeg/render", () => ({
  FFmpegRenderer: class {
    render = vi.fn().mockResolvedValue("/tmp/output.mp4");
  },
}));

vi.mock("../../src/pipelines/ffmpeg", () => ({
  getFFmpegRenderer: vi.fn(() => ({
    render: vi.fn().mockResolvedValue({
      outputPath: "/tmp/output.mp4",
      duration: 30,
      fileSize: 1000000,
      format: "mp4",
      resolution: { width: 1920, height: 1080 },
    }),
    renderToGCS: vi.fn().mockResolvedValue({
      outputPath: "gs://bucket/output.mp4",
      duration: 30,
      fileSize: 1000000,
      format: "mp4",
      resolution: { width: 1920, height: 1080 },
    }),
  })),
}));

vi.mock("../../src/utils/hashing", () => ({
  computeHash: vi.fn().mockResolvedValue("abc123sha256hash"),
}));

// Mock AI pipelines
const mockAnalysisResult = {
  duration: 120,
  resolution: { width: 1920, height: 1080 },
  fps: 30,
  summary: "Test video",
  language: "en",
  scenes: [{ id: "s1", start: 0, end: 60, description: "Scene 1" }],
  entities: [{ id: "e1", type: "PERSON", name: "Speaker", confidence: 0.9 }],
  transcript: [{ start: 0, end: 5, text: "Hello", confidence: 0.95 }],
  events: [{ type: "action", timestamp: 10, description: "Test event", importance: 0.8 }],
  onScreenTexts: [],
  chapters: [],
  tags: ["test"],
  pipeline: { providersUsed: ["gemini"], totalDuration: 5000 },
};

const mockTemplate = {
  version: "1.0",
  name: "Test Template",
  structure: {
    sections: [{ id: "s1", start: 0, end: 60 }],
    totalDuration: 60,
  },
  placeholders: [{ id: "p1", type: "text", path: "/sections/0/title" }],
};

const mockRenderScript = {
  version: "1.0",
  duration: 30,
  resolution: { width: 1920, height: 1080 },
  fps: 30,
  tracks: [
    { type: "video", segments: [{ start: 0, end: 30, source: "gs://bucket/clip.mp4" }] },
    { type: "audio", segments: [{ start: 0, end: 30, source: "gs://bucket/audio.mp3" }] },
  ],
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

vi.mock("../../src/pipelines/video_generation", () => ({
  getVideoGenerationPipeline: vi.fn(() => ({
    generate: vi.fn().mockResolvedValue({
      success: true,
      renderScript: mockRenderScript,
      assets: [{ id: "asset1", type: "image", path: "gs://bucket/image.png" }],
      videoUrl: "gs://bucket/output.mp4",
      stats: { generationTime: 5000 },
      errors: [],
    }),
  })),
}));

vi.mock("../../src/pipelines/placeholder_replacement", () => ({
  getPlaceholderReplacementEngine: vi.fn(() => ({
    validateReplacements: vi.fn().mockReturnValue({ valid: true, errors: [], warnings: [] }),
    replaceAll: vi.fn().mockResolvedValue({ modified: {} }),
    generateScript: vi.fn().mockResolvedValue({ duration: 30 }),
  })),
}));

// Mock OCR/Embed providers
vi.mock("../../src/providers/ocr/vision", () => ({
  CloudVisionOcr: class {
    processFrames = vi.fn().mockResolvedValue([
      { id: "ocr1", text: "Hello", timestamp: 0 },
    ]);
  },
}));

vi.mock("../../src/providers/embedding/insightface", () => ({
  InsightFaceClient: class {
    detectFaces = vi.fn().mockResolvedValue([]);
    trackFaces = vi.fn().mockResolvedValue({ tracks: [], stats: {} });
    generateEmbeddings = vi.fn().mockResolvedValue([]);
    clusterEmbeddings = vi.fn().mockResolvedValue([]);
    classifyClusters = vi.fn().mockResolvedValue([]);
  },
}));

// Mock GCloud Storage
vi.mock("@google-cloud/storage", () => ({
  Storage: class {
    bucket() {
      return {
        file: () => ({
          download: vi.fn().mockResolvedValue([Buffer.from("{}")]),
          save: vi.fn().mockResolvedValue(undefined),
        }),
      };
    }
  },
}));

// Mock fs for cleanup
vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from("{}")),
    unlink: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ size: 1000 }),
    access: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock fetch for webhooks
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("E2E Workflow: Video Analyze Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    process.env.GCS_BUCKET = "test-bucket";
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should complete analyze workflow with normalized video", async () => {
    const video = {
      id: "video123",
      projectId: "proj123",
      title: "Test Video",
    };

    const analyzeJob = {
      id: "job_analyze",
      videoId: "video123",
      type: "ANALYZE",
      status: "QUEUED",
      video,
    };

    mockPrisma.job.findUnique.mockResolvedValue(analyzeJob);
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "art_normalized",
      gcsUri: "gs://test-bucket/normalized.mp4",
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runAnalyze } = await import("../../src/jobs/analyze");
    await runAnalyze("job_analyze");

    // Verify analyze created EVENT_JSON and TEMPLATE_JSON artifacts
    const createCalls = mockPrisma.artifact.create.mock.calls;
    const artifactTypes = createCalls.map((c: any) => c[0].data.type);
    expect(artifactTypes).toContain("EVENT_JSON");
    expect(artifactTypes).toContain("TEMPLATE_JSON");
  });

  it("should handle missing normalized video", async () => {
    const job = {
      id: "job_fail",
      videoId: "video123",
      type: "ANALYZE",
      video: { id: "video123", projectId: "proj123", title: "Test" },
    };

    mockPrisma.job.findUnique.mockResolvedValue(job);
    mockPrisma.artifact.findFirst.mockResolvedValue(null);

    const { runAnalyze } = await import("../../src/jobs/analyze");

    await expect(runAnalyze("job_fail")).rejects.toThrow("Normalized video not found");
  });
});

describe("E2E Workflow: Template Apply → Generate → Render", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GCS_BUCKET = "test-bucket";
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should complete template apply → generate → render workflow", async () => {
    const video = {
      id: "video123",
      projectId: "proj123",
    };

    // Setup template artifact
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "art_template",
      videoId: "video123",
      type: "TEMPLATE_JSON",
      gcsUri: "gs://test-bucket/template.json",
    });

    mockGcs.downloadJSON.mockResolvedValue(mockTemplate);

    // Step 1: Apply replacements
    const { getPlaceholderReplacementEngine } = await import(
      "../../src/pipelines/placeholder_replacement"
    );
    const engine = getPlaceholderReplacementEngine();

    const validation = engine.validateReplacements(mockTemplate, {
      p1: { value: "New Title" },
    });
    expect(validation.valid).toBe(true);

    const applied = await engine.replaceAll(mockTemplate, { p1: { value: "New Title" } });
    expect(applied).toBeDefined();

    // Step 2: Generate job
    const generateJob = {
      id: "job_generate",
      videoId: "video123",
      type: "GENERATE",
      status: "QUEUED",
      video,
      payload: {
        templateId: "art_template",
        replacements: { p1: { value: "New Title" } },
      },
    };

    mockPrisma.job.findUnique.mockResolvedValue(generateJob);
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runGenerate } = await import("../../src/jobs/generate");
    await runGenerate("job_generate");

    // Verify RENDER_SCRIPT artifact created
    expect(mockPrisma.artifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "RENDER_SCRIPT",
      }),
    });

    // Step 3: Render job
    vi.clearAllMocks();
    const renderJob = {
      id: "job_render",
      videoId: "video123",
      type: "RENDER",
      status: "QUEUED",
      video,
      payload: {
        renderScriptUri: "gs://test-bucket/render_script.json",
      },
    };

    mockPrisma.job.findUnique.mockResolvedValue(renderJob);
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    mockGcs.downloadJSON.mockResolvedValue({
      version: "1.0",
      duration: 30,
      resolution: { width: 1920, height: 1080 },
      tracks: [{ type: "video", segments: [] }],
    });

    const { runRender } = await import("../../src/jobs/render");
    await runRender("job_render");

    // Verify OUTPUT_VIDEO artifact created
    expect(mockPrisma.artifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "OUTPUT_VIDEO",
      }),
    });
  });
});

describe("E2E Workflow: Webhook Notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should send webhook on job completion", async () => {
    // Setup webhook
    const webhook = {
      id: "wh123",
      projectId: "proj123",
      url: "https://example.com/webhook",
      secret: "test-secret",
      events: ["job.completed"],
      headers: {},
      active: true,
      retryCount: 3,
    };

    mockPrisma.webhook.findMany.mockResolvedValue([webhook]);
    mockPrisma.webhookDelivery.create.mockResolvedValue({});

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "OK",
    });

    const { dispatchWebhook } = await import("../../src/services/webhook");

    const results = await dispatchWebhook("job.completed", {
      jobId: "job123",
      videoId: "video123",
      projectId: "proj123",
      type: "ANALYZE",
      status: "SUCCEEDED",
    });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);

    // Verify fetch was called with correct parameters
    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/webhook",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Webhook-Event": "job.completed",
          "X-Webhook-Signature": expect.any(String),
        }),
      })
    );
  });

  it("should record failed webhook delivery", async () => {
    const webhook = {
      id: "wh123",
      projectId: "proj123",
      url: "https://example.com/webhook",
      secret: "test-secret",
      events: ["job.failed"],
      headers: {},
      active: true,
      retryCount: 1,
    };

    mockPrisma.webhook.findMany.mockResolvedValue([webhook]);
    mockPrisma.webhookDelivery.create.mockResolvedValue({});

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const { dispatchWebhook } = await import("../../src/services/webhook");

    const results = await dispatchWebhook("job.failed", {
      jobId: "job123",
      error: "Processing failed",
    });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);

    // Verify delivery was recorded
    expect(mockPrisma.webhookDelivery.create).toHaveBeenCalled();
  });

  it("should not send webhook for non-matching events", async () => {
    mockPrisma.webhook.findMany.mockResolvedValue([]);

    const { dispatchWebhook } = await import("../../src/services/webhook");

    const results = await dispatchWebhook("job.started", { jobId: "job123" });

    expect(results).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("E2E Error Handling Scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GCS_BUCKET = "test-bucket";
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should handle job not found error for analyze", async () => {
    mockPrisma.job.findUnique.mockResolvedValue(null);

    const { runAnalyze } = await import("../../src/jobs/analyze");

    await expect(runAnalyze("nonexistent")).rejects.toThrow("Job not found");
  });

  it("should handle missing artifact error", async () => {
    const job = {
      id: "job123",
      videoId: "video123",
      type: "ANALYZE",
      video: { id: "video123", projectId: "proj123", title: "Test" },
    };

    mockPrisma.job.findUnique.mockResolvedValue(job);
    mockPrisma.artifact.findFirst.mockResolvedValue(null);

    const { runAnalyze } = await import("../../src/jobs/analyze");

    await expect(runAnalyze("job123")).rejects.toThrow("Normalized video not found");
  });

  it("should handle job not found for generate", async () => {
    mockPrisma.job.findUnique.mockResolvedValue(null);

    const { runGenerate } = await import("../../src/jobs/generate");

    await expect(runGenerate("nonexistent")).rejects.toThrow("Job not found");
  });

  it("should handle webhook delivery timeout", async () => {
    const webhook = {
      id: "wh123",
      url: "https://slow.example.com/webhook",
      secret: "secret",
      events: ["job.completed"],
      headers: {},
      active: true,
      retryCount: 1,
    };

    mockPrisma.webhook.findMany.mockResolvedValue([webhook]);
    mockPrisma.webhookDelivery.create.mockResolvedValue({});

    mockFetch.mockRejectedValue(new Error("Request timeout"));

    const { dispatchWebhook } = await import("../../src/services/webhook");

    const results = await dispatchWebhook("job.completed", { jobId: "job123" });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain("timeout");
  });
});

describe("E2E Workflow: Complete Analysis Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    process.env.GCS_BUCKET = "test-bucket";
  });

  it("should complete analyze → OCR → embed → highlight pipeline", async () => {
    const video = {
      id: "video_full",
      projectId: "proj123",
      title: "Full Pipeline Test",
    };

    // 1. ANALYZE
    const analyzeJob = { id: "job_1", videoId: video.id, type: "ANALYZE", video };
    mockPrisma.job.findUnique.mockResolvedValueOnce(analyzeJob);
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "art_norm",
      gcsUri: "gs://bucket/normalized.mp4",
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runAnalyze } = await import("../../src/jobs/analyze");
    await runAnalyze("job_1");
    expect(mockPrisma.artifact.create).toHaveBeenCalled();

    // 2. OCR
    vi.clearAllMocks();
    const ocrJob = { id: "job_2", videoId: video.id, type: "OCR", video };
    mockPrisma.job.findUnique.mockResolvedValueOnce(ocrJob);
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "art_norm",
      gcsUri: "gs://bucket/normalized.mp4",
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runOcr } = await import("../../src/jobs/ocr");
    await runOcr("job_2");
    expect(mockPrisma.artifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "OCR_REPORT" }),
    });

    // 3. EMBED (face detection)
    vi.clearAllMocks();
    const embedJob = { id: "job_3", videoId: video.id, type: "EMBED", video };
    mockPrisma.job.findUnique.mockResolvedValueOnce(embedJob);
    mockPrisma.artifact.findFirst.mockResolvedValue({
      id: "art_norm",
      gcsUri: "gs://bucket/normalized.mp4",
    });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runEmbed } = await import("../../src/jobs/embed");
    await runEmbed("job_3");
    expect(mockPrisma.artifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "EMBED_REPORT" }),
    });

    // 4. HIGHLIGHT
    vi.clearAllMocks();
    const highlightJob = {
      id: "job_4",
      videoId: video.id,
      type: "HIGHLIGHT",
      video,
      payload: { duration: 60 },
    };
    mockPrisma.job.findUnique.mockResolvedValueOnce(highlightJob);
    mockPrisma.artifact.findFirst
      .mockResolvedValueOnce({ id: "art_event", gcsUri: "gs://bucket/event.json" })
      .mockResolvedValueOnce({ id: "art_face", gcsUri: "gs://bucket/faces.json" })
      .mockResolvedValueOnce({ id: "art_ocr", gcsUri: "gs://bucket/ocr.json" });
    mockGcs.downloadJSON
      .mockResolvedValueOnce(mockAnalysisResult)
      .mockResolvedValueOnce({ tracks: [] })
      .mockResolvedValueOnce({ results: [] });
    mockPrisma.artifact.create.mockResolvedValue({});
    mockPrisma.job.update.mockResolvedValue({});

    const { runHighlight } = await import("../../src/jobs/highlight");
    await runHighlight("job_4");
    expect(mockPrisma.artifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "HIGHLIGHT_PLAN" }),
    });
  });
});
