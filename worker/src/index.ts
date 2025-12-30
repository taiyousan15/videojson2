import "dotenv/config";
import express from "express";
import { executeTask } from "./tasks/execute";
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
import { Server } from "http";
import { validateEnvOrExit } from "./utils/env";
import { logger, requestLoggingMiddleware } from "./utils/logger";

// P2: Validate environment variables at startup
const envConfig = validateEnvOrExit();

const app = express();
app.use(express.json());

// P2: Structured logging middleware
app.use(requestLoggingMiddleware());

const PORT = envConfig.PORT;

// Track server and shutdown state
let server: Server | null = null;
let isShuttingDown = false;
const startTime = Date.now();

// ============================================
// Health & Readiness Checks
// ============================================

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  timestamp: string;
  checks: {
    database: { status: string; latency?: number };
    comfyui?: { status: string; latency?: number };
  };
  version: string;
}

// Liveness probe - basic check
app.get("/health", (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ status: "shutting_down" });
  }
  res.json({ status: "ok", uptime: Date.now() - startTime });
});

// Readiness probe - detailed check
app.get("/health/ready", async (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ status: "shutting_down" });
  }

  const health: HealthStatus = {
    status: "healthy",
    uptime: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    checks: {
      database: { status: "unknown" },
    },
    version: process.env.npm_package_version || "1.0.0",
  };

  // Check database connection
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

  // Check ComfyUI if configured
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

// Startup probe
app.get("/health/startup", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not_ready" });
  }
});

// ============================================
// Template Application API
// ============================================

/**
 * GET /api/templates/:id - Get template by ID
 */
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
    console.error("Get template error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/templates/:id/apply - Apply replacements to template
 */
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

    // Get template
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

    // Apply replacements
    const engine = getPlaceholderReplacementEngine();

    // Validate
    const validation = engine.validateReplacements(template, replacements);
    if (!validation.valid) {
      return res.status(400).json({
        error: "Invalid replacements",
        details: validation.errors,
        warnings: validation.warnings,
      });
    }

    // Apply
    const results = await engine.replaceAll(template, replacements, options);

    res.json({
      success: true,
      results,
      warnings: validation.warnings,
      templateId: req.params.id,
    });
  } catch (error: any) {
    console.error("Apply template error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/templates/:id/generate - Generate video from template
 */
app.post("/api/templates/:id/generate", async (req, res) => {
  try {
    const { replacements, outputOptions } = req.body;

    // Get template artifact
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

    // Create generation job
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
    console.error("Generate from template error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/templates/:id/preview - Generate preview script
 */
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
    console.error("Preview error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/jobs/:id - Get job status
 */
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
    console.error("Get job error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/render - Create render job from render script
 */
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
    console.error("Create render job error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/outputs/:videoId - Get video outputs
 */
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
    console.error("Get outputs error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ComfyUI API
// ============================================

/**
 * GET /api/comfyui/status - Get ComfyUI status
 */
app.get("/api/comfyui/status", async (req, res) => {
  try {
    const pipeline = getComfyUIPipeline();
    const status = await pipeline.getStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/comfyui/workflows - List available workflows
 */
app.get("/api/comfyui/workflows", async (req, res) => {
  try {
    const pipeline = getComfyUIPipeline();
    const workflows = pipeline.listWorkflows();
    res.json({ workflows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/comfyui/models - List available models
 */
app.get("/api/comfyui/models", async (req, res) => {
  try {
    const pipeline = getComfyUIPipeline();
    const models = await pipeline.getModels();
    res.json({ models });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/comfyui/generate - Create ComfyUI generation job
 */
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
    console.error("Create ComfyUI job error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/comfyui/text-to-image - Quick text-to-image generation
 */
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
    console.error("Text-to-image error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/comfyui/workflow - Execute named workflow
 */
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
    console.error("Workflow execution error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Webhook API
// ============================================

/**
 * GET /api/webhooks - List webhooks
 */
app.get("/api/webhooks", async (req, res) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const webhooks = await listWebhooks(projectId);
    res.json({ webhooks });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/webhooks - Create webhook
 */
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
    console.error("Create webhook error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/webhooks/:id - Get webhook details
 */
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

/**
 * DELETE /api/webhooks/:id - Delete webhook
 */
app.delete("/api/webhooks/:id", async (req, res) => {
  try {
    await deleteWebhook(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/webhooks/:id/test - Test webhook
 */
app.post("/api/webhooks/:id/test", async (req, res) => {
  try {
    const result = await testWebhook(req.params.id);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/webhooks/:id/deliveries - Get webhook delivery history
 */
app.get("/api/webhooks/:id/deliveries", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const deliveries = await getWebhookDeliveries(req.params.id, limit);
    res.json({ deliveries });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/webhooks/:id - Update webhook
 */
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

// Cloud Tasks endpoint
app.post("/tasks/execute", async (req, res) => {
  try {
    // Verify Cloud Tasks header
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
    console.error("Task execution error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Graceful Shutdown
// ============================================

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info("Starting graceful shutdown", { signal });
  isShuttingDown = true;

  // Stop accepting new connections
  if (server) {
    logger.info("Closing HTTP server");
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => {
        if (err) {
          logger.error("Error closing server", undefined, err);
          reject(err);
        } else {
          logger.info("HTTP server closed");
          resolve();
        }
      });
    });
  }

  // Close database connection
  logger.info("Disconnecting from database");
  try {
    await prisma.$disconnect();
    logger.info("Database disconnected");
  } catch (error) {
    logger.error("Error disconnecting database", undefined, error);
  }

  logger.info("Graceful shutdown complete");
  process.exit(0);
}

// Register signal handlers
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  logger.critical("Uncaught exception", undefined, error);
  gracefulShutdown("uncaughtException").catch(() => process.exit(1));
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection", { promise: String(promise) }, reason);
  // Don't exit for unhandled rejections, just log
});

// Start server
server = app.listen(PORT, () => {
  logger.info("Worker started", {
    port: PORT,
    nodeEnv: envConfig.NODE_ENV,
    gcsBucket: envConfig.GCS_BUCKET,
  });
});
