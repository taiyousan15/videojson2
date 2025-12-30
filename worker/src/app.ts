/**
 * Express Application Factory
 *
 * Separated from index.ts for testability
 */

import express, { Express, Request, Response, NextFunction } from "express";
import { prisma } from "./db";
import { createGenerationJob } from "./jobs/generate";
import { createComfyUIJob } from "./jobs/comfyui";
import {
  getPlaceholderReplacementEngine,
  ReplacementValue,
} from "./pipelines/placeholder_replacement";
import { getComfyUIPipeline } from "./pipelines/comfyui";
import { downloadJSON } from "./utils/gcs";
import {
  createWebhook,
  listWebhooks,
  deleteWebhook,
  testWebhook,
  getWebhookDeliveries,
  WebhookEvent,
} from "./services/webhook";
import { executeTask } from "./tasks/execute";
import { requestLoggingMiddleware } from "./utils/logger";

export interface AppConfig {
  enableLogging?: boolean;
}

export function createApp(config: AppConfig = {}): Express {
  const app = express();
  app.use(express.json());

  if (config.enableLogging !== false) {
    app.use(requestLoggingMiddleware());
  }

  // Track startup time for health checks
  const startTime = Date.now();
  let isShuttingDown = false;

  // Shutdown flag setter (for testing)
  app.set("setShuttingDown", (value: boolean) => {
    isShuttingDown = value;
  });

  // ============================================
  // Health & Readiness Checks
  // ============================================

  app.get("/health", (req, res) => {
    if (isShuttingDown) {
      return res.status(503).json({ status: "shutting_down" });
    }
    res.json({ status: "ok", uptime: Date.now() - startTime });
  });

  app.get("/health/ready", async (req, res) => {
    if (isShuttingDown) {
      return res.status(503).json({ status: "shutting_down" });
    }

    const health: any = {
      status: "healthy",
      uptime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: "unknown" },
      },
      version: process.env.npm_package_version || "1.0.0",
    };

    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      health.checks.database = {
        status: "connected",
        latency: Date.now() - dbStart,
      };
    } catch (error) {
      health.checks.database = { status: "disconnected" };
      health.status = "unhealthy";
    }

    if (process.env.COMFYUI_URL) {
      try {
        const comfyStart = Date.now();
        const response = await fetch(`${process.env.COMFYUI_URL}/system_stats`, {
          signal: AbortSignal.timeout(5000),
        });
        health.checks.comfyui = {
          status: response.ok ? "available" : "error",
          latency: Date.now() - comfyStart,
        };
      } catch {
        health.checks.comfyui = { status: "unavailable" };
        health.status = "degraded";
      }
    }

    const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;
    res.status(statusCode).json(health);
  });

  app.get("/health/startup", async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "not_ready" });
    }
  });

  // ============================================
  // Template APIs
  // ============================================

  app.get("/api/templates/:id", async (req, res) => {
    try {
      const artifact = await prisma.artifact.findFirst({
        where: {
          OR: [
            { id: req.params.id },
            { videoId: req.params.id, type: "TEMPLATE_JSON" },
          ],
        },
      });

      if (!artifact) {
        return res.status(404).json({ error: "Template not found" });
      }

      const template = await downloadJSON(artifact.gcsUri);
      res.json({ template, artifact });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/templates/:id/apply", async (req, res) => {
    try {
      const { replacements, options } = req.body as {
        replacements: Record<string, ReplacementValue>;
        options?: {
          generateImages?: boolean;
          generateNarration?: boolean;
          checkQuality?: boolean;
          stylePrefix?: string;
        };
      };

      const artifact = await prisma.artifact.findFirst({
        where: {
          OR: [
            { id: req.params.id },
            { videoId: req.params.id, type: "TEMPLATE_JSON" },
          ],
        },
      });

      if (!artifact) {
        return res.status(404).json({ error: "Template not found" });
      }

      const template = await downloadJSON(artifact.gcsUri);
      const engine = getPlaceholderReplacementEngine();

      const validation = engine.validateReplacements(template, replacements);
      if (!validation.valid) {
        return res.status(400).json({
          error: "Invalid replacements",
          details: validation.errors,
          warnings: validation.warnings,
        });
      }

      const results = await engine.replaceAll(template, replacements, options);

      res.json({
        success: true,
        results,
        warnings: validation.warnings,
        templateId: req.params.id,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/templates/:id/generate", async (req, res) => {
    try {
      const { replacements, outputOptions } = req.body;

      const artifact = await prisma.artifact.findFirst({
        where: {
          OR: [
            { id: req.params.id },
            { videoId: req.params.id, type: "TEMPLATE_JSON" },
          ],
        },
      });

      if (!artifact) {
        return res.status(404).json({ error: "Template not found" });
      }

      const jobId = await createGenerationJob(
        artifact.videoId,
        artifact.id,
        replacements,
        outputOptions
      );

      res.json({
        success: true,
        jobId,
        message: "Generation job created. Poll /api/jobs/:id for status.",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/templates/:id/preview", async (req, res) => {
    try {
      const { replacements } = req.body;

      const artifact = await prisma.artifact.findFirst({
        where: {
          OR: [
            { id: req.params.id },
            { videoId: req.params.id, type: "TEMPLATE_JSON" },
          ],
        },
      });

      if (!artifact) {
        return res.status(404).json({ error: "Template not found" });
      }

      const template = await downloadJSON(artifact.gcsUri);
      const engine = getPlaceholderReplacementEngine();
      const script = await engine.generateScript(template, replacements);

      res.json({ script, template: { name: template.name, duration: template.structure.totalDuration } });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // Job APIs
  // ============================================

  app.get("/api/jobs/:id", async (req, res) => {
    try {
      const job = await prisma.job.findUnique({
        where: { id: req.params.id },
        include: { artifacts: true },
      });

      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json(job);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/render", async (req, res) => {
    try {
      const { videoId, renderScriptUri, options, generateThumbnail } = req.body;

      if (!videoId || !renderScriptUri) {
        return res.status(400).json({ error: "Missing videoId or renderScriptUri" });
      }

      const { createRenderJob } = await import("./jobs/render");
      const jobId = await createRenderJob(videoId, renderScriptUri, options, generateThumbnail);

      res.json({
        success: true,
        jobId,
        message: "Render job created. Poll /api/jobs/:id for status.",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/outputs/:videoId", async (req, res) => {
    try {
      const outputs = await prisma.artifact.findMany({
        where: {
          videoId: req.params.videoId,
          type: { in: ["OUTPUT_VIDEO", "THUMBNAIL"] },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({ outputs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // ComfyUI APIs
  // ============================================

  app.get("/api/comfyui/status", async (req, res) => {
    try {
      const pipeline = getComfyUIPipeline();
      const status = await pipeline.getStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/comfyui/workflows", async (req, res) => {
    try {
      const pipeline = getComfyUIPipeline();
      const workflows = pipeline.listWorkflows();
      res.json({ workflows });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/comfyui/models", async (req, res) => {
    try {
      const pipeline = getComfyUIPipeline();
      const models = await pipeline.getModels();
      res.json({ models });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/comfyui/generate", async (req, res) => {
    try {
      const { videoId, type, request, outputBucket, outputPrefix } = req.body;

      if (!videoId || !type || !request) {
        return res.status(400).json({ error: "Missing videoId, type, or request" });
      }

      const validTypes = ["text-to-image", "image-to-image", "image-to-video", "workflow", "batch", "placeholder"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: "Invalid type. Must be one of: " + validTypes.join(", ") });
      }

      const jobId = await createComfyUIJob(videoId, type, request, { outputBucket, outputPrefix });

      res.json({
        success: true,
        jobId,
        message: "ComfyUI job created. Poll /api/jobs/:id for status.",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/comfyui/text-to-image", async (req, res) => {
    try {
      const { prompt, negativePrompt, width, height, steps, cfg, seed, model } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: "Missing prompt" });
      }

      const pipeline = getComfyUIPipeline();
      const result = await pipeline.generateImage({
        prompt,
        negativePrompt,
        width,
        height,
        steps,
        cfg,
        seed,
        model,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/comfyui/workflow", async (req, res) => {
    try {
      const { workflowName, inputs } = req.body;

      if (!workflowName) {
        return res.status(400).json({ error: "Missing workflowName" });
      }

      const pipeline = getComfyUIPipeline();
      const result = await pipeline.executeWorkflow(workflowName, inputs || {});

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // Webhook APIs
  // ============================================

  app.get("/api/webhooks", async (req, res) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const webhooks = await listWebhooks(projectId);
      res.json({ webhooks });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/webhooks", async (req, res) => {
    try {
      const { projectId, name, url, secret, events, headers, retryCount } = req.body;

      if (!name || !url || !events || events.length === 0) {
        return res.status(400).json({ error: "Missing name, url, or events" });
      }

      const validEvents: WebhookEvent[] = [
        "job.started", "job.progress", "job.completed", "job.failed",
        "video.ready", "video.failed", "render.completed"
      ];
      const invalidEvents = events.filter((e: string) => !validEvents.includes(e as WebhookEvent));
      if (invalidEvents.length > 0) {
        return res.status(400).json({ error: "Invalid events: " + invalidEvents.join(", ") });
      }

      const webhookId = await createWebhook({
        projectId,
        name,
        url,
        secret,
        events,
        headers,
        retryCount,
      });

      res.json({ success: true, webhookId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/webhooks/:id", async (req, res) => {
    try {
      const webhook = await prisma.webhook.findUnique({
        where: { id: req.params.id },
        include: { _count: { select: { deliveries: true } } },
      });

      if (!webhook) {
        return res.status(404).json({ error: "Webhook not found" });
      }

      res.json(webhook);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/webhooks/:id", async (req, res) => {
    try {
      await deleteWebhook(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/webhooks/:id/test", async (req, res) => {
    try {
      const result = await testWebhook(req.params.id);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/webhooks/:id/deliveries", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const deliveries = await getWebhookDeliveries(req.params.id, limit);
      res.json({ deliveries });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/webhooks/:id", async (req, res) => {
    try {
      const { name, url, secret, events, headers, active, retryCount } = req.body;

      const webhook = await prisma.webhook.update({
        where: { id: req.params.id },
        data: {
          ...(name && { name }),
          ...(url && { url }),
          ...(secret && { secret }),
          ...(events && { events }),
          ...(headers !== undefined && { headers }),
          ...(active !== undefined && { active }),
          ...(retryCount !== undefined && { retryCount }),
        },
      });

      res.json(webhook);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // Cloud Tasks Endpoint
  // ============================================

  app.post("/tasks/execute", async (req, res) => {
    try {
      const taskName = req.headers["x-cloudtasks-taskname"];
      if (!taskName && process.env.NODE_ENV === "production") {
        return res.status(403).json({ error: "Forbidden" });
      }

      const { jobId, jobType } = req.body;
      if (!jobId || !jobType) {
        return res.status(400).json({ error: "Missing jobId or jobType" });
      }

      await executeTask(jobId, jobType);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return app;
}
