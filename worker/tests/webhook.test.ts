import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as crypto from "crypto";

// Mock dependencies
const mockPrisma = {
  webhook: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  webhookDelivery: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock("../src/db", () => ({
  prisma: mockPrisma,
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Webhook Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("createWebhook", () => {
    it("should create a webhook with generated secret", async () => {
      mockPrisma.webhook.create.mockResolvedValue({ id: "webhook123" });

      const { createWebhook } = await import("../src/services/webhook");

      const webhookId = await createWebhook({
        name: "Test Webhook",
        url: "https://example.com/webhook",
        events: ["job.completed", "job.failed"],
      });

      expect(webhookId).toBe("webhook123");
      expect(mockPrisma.webhook.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Test Webhook",
          url: "https://example.com/webhook",
          events: ["job.completed", "job.failed"],
          secret: expect.any(String), // Auto-generated secret
          retryCount: 3, // Default retry count
        }),
      });
    });

    it("should use provided secret and retry count", async () => {
      mockPrisma.webhook.create.mockResolvedValue({ id: "webhook123" });

      const { createWebhook } = await import("../src/services/webhook");

      await createWebhook({
        name: "Test Webhook",
        url: "https://example.com/webhook",
        events: ["job.completed"],
        secret: "my-custom-secret",
        retryCount: 5,
      });

      expect(mockPrisma.webhook.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          secret: "my-custom-secret",
          retryCount: 5,
        }),
      });
    });
  });

  describe("listWebhooks", () => {
    it("should list all webhooks when no projectId", async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([
        { id: "wh1", name: "Webhook 1" },
        { id: "wh2", name: "Webhook 2" },
      ]);

      const { listWebhooks } = await import("../src/services/webhook");

      const webhooks = await listWebhooks();

      expect(webhooks).toHaveLength(2);
      expect(mockPrisma.webhook.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        })
      );
    });

    it("should filter by projectId when provided", async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([{ id: "wh1", projectId: "proj1" }]);

      const { listWebhooks } = await import("../src/services/webhook");

      await listWebhooks("proj1");

      expect(mockPrisma.webhook.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: "proj1" },
        })
      );
    });
  });

  describe("deleteWebhook", () => {
    it("should delete webhook by id", async () => {
      mockPrisma.webhook.delete.mockResolvedValue({ id: "webhook123" });

      const { deleteWebhook } = await import("../src/services/webhook");

      await deleteWebhook("webhook123");

      expect(mockPrisma.webhook.delete).toHaveBeenCalledWith({
        where: { id: "webhook123" },
      });
    });
  });

  describe("getWebhookDeliveries", () => {
    it("should return delivery history", async () => {
      mockPrisma.webhookDelivery.findMany.mockResolvedValue([
        { id: "d1", status: 200, duration: 100 },
        { id: "d2", status: 500, duration: 200 },
      ]);

      const { getWebhookDeliveries } = await import("../src/services/webhook");

      const deliveries = await getWebhookDeliveries("webhook123", 10);

      expect(deliveries).toHaveLength(2);
      expect(mockPrisma.webhookDelivery.findMany).toHaveBeenCalledWith({
        where: { webhookId: "webhook123" },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
    });
  });

  describe("dispatchWebhook", () => {
    it("should dispatch to matching webhooks", async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([
        {
          id: "wh1",
          url: "https://example.com/webhook1",
          secret: "secret1",
          headers: {},
          retryCount: 1,
        },
      ]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({});

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "OK",
      });

      const { dispatchWebhook } = await import("../src/services/webhook");

      const results = await dispatchWebhook("job.completed", {
        jobId: "job123",
        status: "SUCCEEDED",
      });

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/webhook1",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-Webhook-Event": "job.completed",
          }),
        })
      );
    });

    it("should return empty array when no matching webhooks", async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([]);

      const { dispatchWebhook } = await import("../src/services/webhook");

      const results = await dispatchWebhook("job.completed", { jobId: "job123" });

      expect(results).toHaveLength(0);
    });

    it("should include HMAC signature when secret is provided", async () => {
      mockPrisma.webhook.findMany.mockResolvedValue([
        {
          id: "wh1",
          url: "https://example.com/webhook",
          secret: "test-secret",
          headers: {},
          retryCount: 1,
        },
      ]);
      mockPrisma.webhookDelivery.create.mockResolvedValue({});

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "OK",
      });

      const { dispatchWebhook } = await import("../src/services/webhook");

      await dispatchWebhook("job.completed", { jobId: "job123" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Webhook-Signature": expect.any(String),
          }),
        })
      );
    });
  });

  describe("testWebhook", () => {
    it("should throw if webhook not found", async () => {
      mockPrisma.webhook.findUnique.mockResolvedValue(null);

      const { testWebhook } = await import("../src/services/webhook");

      await expect(testWebhook("nonexistent")).rejects.toThrow("Webhook not found");
    });

    it("should send test payload to webhook", async () => {
      mockPrisma.webhook.findUnique.mockResolvedValue({
        id: "wh1",
        url: "https://example.com/webhook",
        secret: "secret",
        headers: {},
        retryCount: 1,
      });
      mockPrisma.webhookDelivery.create.mockResolvedValue({});

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "OK",
      });

      const { testWebhook } = await import("../src/services/webhook");

      const result = await testWebhook("wh1");

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe("notification helpers", () => {
    beforeEach(() => {
      mockPrisma.webhook.findMany.mockResolvedValue([]);
    });

    it("should notify job started", async () => {
      const { notifyJobStarted } = await import("../src/services/webhook");

      await notifyJobStarted("job123", "video123", "proj123", "INGEST");

      expect(mockPrisma.webhook.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            events: { has: "job.started" },
          }),
        })
      );
    });

    it("should notify job completed", async () => {
      const { notifyJobCompleted } = await import("../src/services/webhook");

      await notifyJobCompleted("job123", "video123", "proj123", "RENDER", { success: true });

      expect(mockPrisma.webhook.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            events: { has: "job.completed" },
          }),
        })
      );
    });

    it("should notify job failed", async () => {
      const { notifyJobFailed } = await import("../src/services/webhook");

      await notifyJobFailed("job123", "video123", "proj123", "ANALYZE", "Processing failed");

      expect(mockPrisma.webhook.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            events: { has: "job.failed" },
          }),
        })
      );
    });

    it("should notify video ready", async () => {
      const { notifyVideoReady } = await import("../src/services/webhook");

      await notifyVideoReady("video123", "proj123", "gs://bucket/output.mp4");

      expect(mockPrisma.webhook.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            events: { has: "video.ready" },
          }),
        })
      );
    });

    it("should notify render completed", async () => {
      const { notifyRenderCompleted } = await import("../src/services/webhook");

      await notifyRenderCompleted("job123", "video123", "proj123", "gs://bucket/video.mp4");

      expect(mockPrisma.webhook.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            events: { has: "render.completed" },
          }),
        })
      );
    });
  });
});
