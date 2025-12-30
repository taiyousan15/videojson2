/**
 * E2E API Tests
 *
 * Tests the complete API flows
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import request from "supertest";
import { Express } from "express";

// Mock dependencies before importing app
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
};

vi.mock("../../src/db", () => ({
  prisma: mockPrisma,
}));

const mockDownloadJSON = vi.fn();
vi.mock("../../src/utils/gcs", () => ({
  downloadJSON: mockDownloadJSON,
  uploadJSON: vi.fn().mockResolvedValue(undefined),
  downloadFile: vi.fn().mockResolvedValue(undefined),
  uploadFile: vi.fn().mockResolvedValue(undefined),
  getDefaultBucket: vi.fn().mockReturnValue("test-bucket"),
  buildGcsUri: vi.fn((bucket: string, path: string) => `gs://${bucket}/${path}`),
}));

vi.mock("../../src/services/webhook", () => ({
  createWebhook: vi.fn().mockResolvedValue("webhook_new123"),
  listWebhooks: vi.fn().mockResolvedValue([]),
  deleteWebhook: vi.fn().mockResolvedValue(undefined),
  testWebhook: vi.fn().mockResolvedValue({ success: true, statusCode: 200 }),
  getWebhookDeliveries: vi.fn().mockResolvedValue([]),
  notifyJobStarted: vi.fn().mockResolvedValue(undefined),
  notifyJobCompleted: vi.fn().mockResolvedValue(undefined),
  notifyJobFailed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/jobs/generate", () => ({
  createGenerationJob: vi.fn().mockResolvedValue("job_gen123"),
}));

vi.mock("../../src/jobs/render", () => ({
  createRenderJob: vi.fn().mockResolvedValue("job_render123"),
}));

vi.mock("../../src/jobs/comfyui", () => ({
  createComfyUIJob: vi.fn().mockResolvedValue("job_comfy123"),
}));

vi.mock("../../src/pipelines/comfyui", () => ({
  getComfyUIPipeline: vi.fn(() => ({
    getStatus: vi.fn().mockResolvedValue({ connected: true, queueSize: 0 }),
    listWorkflows: vi.fn().mockReturnValue(["workflow1", "workflow2"]),
    getModels: vi.fn().mockResolvedValue([{ name: "model1" }]),
    generateImage: vi.fn().mockResolvedValue({ images: ["image1.png"] }),
    executeWorkflow: vi.fn().mockResolvedValue({ success: true }),
  })),
}));

vi.mock("../../src/pipelines/placeholder_replacement", () => ({
  getPlaceholderReplacementEngine: vi.fn(() => ({
    validateReplacements: vi.fn().mockReturnValue({ valid: true, errors: [], warnings: [] }),
    replaceAll: vi.fn().mockResolvedValue({ modified: true }),
    generateScript: vi.fn().mockResolvedValue({ duration: 30 }),
  })),
}));

vi.mock("../../src/tasks/execute", () => ({
  executeTask: vi.fn().mockResolvedValue(undefined),
}));

describe("E2E API Tests", () => {
  let app: Express;

  beforeAll(async () => {
    const { createApp } = await import("../../src/app");
    app = createApp({ enableLogging: false });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Health Check APIs", () => {
    it("GET /health - should return ok status", async () => {
      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it("GET /health/ready - should return healthy when DB is connected", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);

      const res = await request(app).get("/health/ready");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
      expect(res.body.checks.database.status).toBe("connected");
    });

    it("GET /health/ready - should return unhealthy when DB fails", async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error("DB connection failed"));

      const res = await request(app).get("/health/ready");

      expect(res.status).toBe(503);
      expect(res.body.status).toBe("unhealthy");
      expect(res.body.checks.database.status).toBe("disconnected");
    });

    it("GET /health/startup - should return ready when DB is connected", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);

      const res = await request(app).get("/health/startup");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ready");
    });
  });

  describe("Job APIs", () => {
    it("GET /api/jobs/:id - should return job details", async () => {
      const mockJob = {
        id: "job123",
        videoId: "video123",
        type: "INGEST",
        status: "SUCCEEDED",
        progress: 100,
        artifacts: [
          { id: "art1", type: "NORMALIZED_VIDEO", gcsUri: "gs://bucket/video.mp4" },
        ],
      };
      mockPrisma.job.findUnique.mockResolvedValue(mockJob);

      const res = await request(app).get("/api/jobs/job123");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("job123");
      expect(res.body.status).toBe("SUCCEEDED");
      expect(res.body.artifacts).toHaveLength(1);
    });

    it("GET /api/jobs/:id - should return 404 for non-existent job", async () => {
      mockPrisma.job.findUnique.mockResolvedValue(null);

      const res = await request(app).get("/api/jobs/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Job not found");
    });
  });

  describe("Template APIs", () => {
    const mockTemplate = {
      version: "1.0",
      name: "Test Template",
      structure: { totalDuration: 60 },
      placeholders: [{ id: "p1", type: "text" }],
    };

    it("GET /api/templates/:id - should return template", async () => {
      mockPrisma.artifact.findFirst.mockResolvedValue({
        id: "art123",
        gcsUri: "gs://bucket/template.json",
      });
      mockDownloadJSON.mockResolvedValue(mockTemplate);

      const res = await request(app).get("/api/templates/template123");

      expect(res.status).toBe(200);
      expect(res.body.template.name).toBe("Test Template");
      expect(res.body.artifact.id).toBe("art123");
    });

    it("GET /api/templates/:id - should return 404 for non-existent template", async () => {
      mockPrisma.artifact.findFirst.mockResolvedValue(null);

      const res = await request(app).get("/api/templates/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Template not found");
    });

    it("POST /api/templates/:id/apply - should apply replacements", async () => {
      mockPrisma.artifact.findFirst.mockResolvedValue({
        id: "art123",
        gcsUri: "gs://bucket/template.json",
      });
      mockDownloadJSON.mockResolvedValue(mockTemplate);

      const res = await request(app)
        .post("/api/templates/template123/apply")
        .send({
          replacements: { p1: { value: "Hello World" } },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("POST /api/templates/:id/generate - should create generation job", async () => {
      mockPrisma.artifact.findFirst.mockResolvedValue({
        id: "art123",
        videoId: "video123",
        gcsUri: "gs://bucket/template.json",
      });

      const res = await request(app)
        .post("/api/templates/template123/generate")
        .send({
          replacements: { p1: { value: "Hello" } },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.jobId).toBe("job_gen123");
    });

    it("POST /api/templates/:id/preview - should generate preview script", async () => {
      mockPrisma.artifact.findFirst.mockResolvedValue({
        id: "art123",
        gcsUri: "gs://bucket/template.json",
      });
      mockDownloadJSON.mockResolvedValue(mockTemplate);

      const res = await request(app)
        .post("/api/templates/template123/preview")
        .send({
          replacements: { p1: { value: "Hello" } },
        });

      expect(res.status).toBe(200);
      expect(res.body.script).toBeDefined();
    });
  });

  describe("Render APIs", () => {
    it("POST /api/render - should create render job", async () => {
      const res = await request(app)
        .post("/api/render")
        .send({
          videoId: "video123",
          renderScriptUri: "gs://bucket/script.json",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.jobId).toBe("job_render123");
    });

    it("POST /api/render - should return 400 if missing required fields", async () => {
      const res = await request(app)
        .post("/api/render")
        .send({
          videoId: "video123",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Missing");
    });

    it("GET /api/outputs/:videoId - should return video outputs", async () => {
      mockPrisma.artifact.findMany.mockResolvedValue([
        { id: "out1", type: "OUTPUT_VIDEO", gcsUri: "gs://bucket/output.mp4" },
        { id: "out2", type: "THUMBNAIL", gcsUri: "gs://bucket/thumb.jpg" },
      ]);

      const res = await request(app).get("/api/outputs/video123");

      expect(res.status).toBe(200);
      expect(res.body.outputs).toHaveLength(2);
    });
  });

  describe("Webhook APIs", () => {
    it("GET /api/webhooks - should list webhooks", async () => {
      const { listWebhooks } = await import("../../src/services/webhook");
      (listWebhooks as any).mockResolvedValue([
        { id: "wh1", name: "Webhook 1" },
        { id: "wh2", name: "Webhook 2" },
      ]);

      const res = await request(app).get("/api/webhooks");

      expect(res.status).toBe(200);
      expect(res.body.webhooks).toHaveLength(2);
    });

    it("POST /api/webhooks - should create webhook", async () => {
      const res = await request(app)
        .post("/api/webhooks")
        .send({
          name: "Test Webhook",
          url: "https://example.com/webhook",
          events: ["job.completed"],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.webhookId).toBe("webhook_new123");
    });

    it("POST /api/webhooks - should return 400 for invalid events", async () => {
      const res = await request(app)
        .post("/api/webhooks")
        .send({
          name: "Test Webhook",
          url: "https://example.com/webhook",
          events: ["invalid.event"],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid events");
    });

    it("POST /api/webhooks - should return 400 if missing required fields", async () => {
      const res = await request(app)
        .post("/api/webhooks")
        .send({
          name: "Test Webhook",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Missing");
    });

    it("GET /api/webhooks/:id - should return webhook details", async () => {
      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: "wh123",
        name: "Test Webhook",
        url: "https://example.com/webhook",
        _count: { deliveries: 5 },
      });

      const res = await request(app).get("/api/webhooks/wh123");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("wh123");
    });

    it("DELETE /api/webhooks/:id - should delete webhook", async () => {
      const res = await request(app).delete("/api/webhooks/wh123");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("POST /api/webhooks/:id/test - should test webhook", async () => {
      const res = await request(app).post("/api/webhooks/wh123/test");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("GET /api/webhooks/:id/deliveries - should return delivery history", async () => {
      const { getWebhookDeliveries } = await import("../../src/services/webhook");
      (getWebhookDeliveries as any).mockResolvedValue([
        { id: "d1", status: 200 },
        { id: "d2", status: 500 },
      ]);

      const res = await request(app).get("/api/webhooks/wh123/deliveries");

      expect(res.status).toBe(200);
      expect(res.body.deliveries).toHaveLength(2);
    });

    it("PATCH /api/webhooks/:id - should update webhook", async () => {
      mockPrisma.webhook.update.mockResolvedValue({
        id: "wh123",
        name: "Updated Webhook",
        active: false,
      });

      const res = await request(app)
        .patch("/api/webhooks/wh123")
        .send({
          name: "Updated Webhook",
          active: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Updated Webhook");
    });
  });

  describe("ComfyUI APIs", () => {
    it("GET /api/comfyui/status - should return ComfyUI status", async () => {
      const res = await request(app).get("/api/comfyui/status");

      expect(res.status).toBe(200);
      expect(res.body.connected).toBe(true);
    });

    it("GET /api/comfyui/workflows - should list workflows", async () => {
      const res = await request(app).get("/api/comfyui/workflows");

      expect(res.status).toBe(200);
      expect(res.body.workflows).toContain("workflow1");
    });

    it("GET /api/comfyui/models - should list models", async () => {
      const res = await request(app).get("/api/comfyui/models");

      expect(res.status).toBe(200);
      expect(res.body.models).toHaveLength(1);
    });

    it("POST /api/comfyui/generate - should create ComfyUI job", async () => {
      const res = await request(app)
        .post("/api/comfyui/generate")
        .send({
          videoId: "video123",
          type: "text-to-image",
          request: { prompt: "a beautiful sunset" },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.jobId).toBe("job_comfy123");
    });

    it("POST /api/comfyui/generate - should return 400 for invalid type", async () => {
      const res = await request(app)
        .post("/api/comfyui/generate")
        .send({
          videoId: "video123",
          type: "invalid-type",
          request: {},
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid type");
    });

    it("POST /api/comfyui/text-to-image - should generate image directly", async () => {
      const res = await request(app)
        .post("/api/comfyui/text-to-image")
        .send({
          prompt: "a beautiful sunset",
        });

      expect(res.status).toBe(200);
      expect(res.body.images).toBeDefined();
    });

    it("POST /api/comfyui/workflow - should execute workflow", async () => {
      const res = await request(app)
        .post("/api/comfyui/workflow")
        .send({
          workflowName: "workflow1",
          inputs: { key: "value" },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("Cloud Tasks Endpoint", () => {
    it("POST /tasks/execute - should execute task", async () => {
      const res = await request(app)
        .post("/tasks/execute")
        .set("x-cloudtasks-taskname", "task123")
        .send({
          jobId: "job123",
          jobType: "INGEST",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("POST /tasks/execute - should return 400 if missing jobId or jobType", async () => {
      const res = await request(app)
        .post("/tasks/execute")
        .set("x-cloudtasks-taskname", "task123")
        .send({
          jobId: "job123",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Missing");
    });
  });
});
