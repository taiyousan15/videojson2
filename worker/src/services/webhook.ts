/**
 * Webhook Service - ジョブ完了時の外部通知
 */

import { prisma } from "../db";
import * as crypto from "crypto";

export type WebhookEvent =
  | "job.started"
  | "job.progress"
  | "job.completed"
  | "job.failed"
  | "video.ready"
  | "video.failed"
  | "render.completed";

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: {
    jobId?: string;
    videoId?: string;
    projectId?: string;
    type?: string;
    status?: string;
    progress?: number;
    result?: any;
    error?: string;
    outputUri?: string;
  };
}

export interface WebhookDeliveryResult {
  success: boolean;
  webhookId: string;
  status: number;
  duration: number;
  error?: string;
}

/**
 * Generate HMAC signature for webhook payload
 */
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Send webhook notification
 */
async function sendWebhook(
  webhook: {
    id: string;
    url: string;
    secret: string | null;
    headers: any;
    retryCount: number;
  },
  event: WebhookEvent,
  payload: WebhookPayload
): Promise<WebhookDeliveryResult> {
  const startTime = Date.now();
  const body = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Webhook-Event": event,
    "X-Webhook-Timestamp": payload.timestamp,
    ...(webhook.headers || {}),
  };

  if (webhook.secret) {
    headers["X-Webhook-Signature"] = generateSignature(body, webhook.secret);
  }

  let lastError: string | undefined;
  let status = 0;
  let response = "";

  for (let attempt = 1; attempt <= webhook.retryCount; attempt++) {
    try {
      const res = await fetch(webhook.url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(30000),
      });

      status = res.status;
      response = await res.text();

      if (res.ok) {
        const duration = Date.now() - startTime;

        await prisma.webhookDelivery.create({
          data: {
            webhookId: webhook.id,
            event,
            payload: payload as any,
            status,
            response: response.slice(0, 1000),
            duration,
            attempts: attempt,
          },
        });

        return { success: true, webhookId: webhook.id, status, duration };
      }

      lastError = "HTTP " + status + ": " + response.slice(0, 200);
    } catch (error: any) {
      lastError = error.message;
      status = 0;
    }

    // Wait before retry (exponential backoff)
    if (attempt < webhook.retryCount) {
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }

  const duration = Date.now() - startTime;

  await prisma.webhookDelivery.create({
    data: {
      webhookId: webhook.id,
      event,
      payload: payload as any,
      status,
      response: lastError?.slice(0, 1000),
      duration,
      attempts: webhook.retryCount,
    },
  });

  return { success: false, webhookId: webhook.id, status, duration, error: lastError };
}

/**
 * Dispatch webhook to all subscribers
 */
export async function dispatchWebhook(
  event: WebhookEvent,
  data: WebhookPayload["data"],
  projectId?: string
): Promise<WebhookDeliveryResult[]> {
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  // Find matching webhooks
  const webhooks = await prisma.webhook.findMany({
    where: {
      active: true,
      events: { has: event },
      OR: [
        { projectId: null }, // Global webhooks
        { projectId: projectId || undefined },
      ],
    },
  });

  if (webhooks.length === 0) {
    console.log("[Webhook] No webhooks registered for event: " + event);
    return [];
  }

  console.log("[Webhook] Dispatching " + event + " to " + webhooks.length + " webhooks");

  const results = await Promise.all(
    webhooks.map((webhook) => sendWebhook(webhook, event, payload))
  );

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log("[Webhook] Dispatch complete: " + succeeded + " succeeded, " + failed + " failed");

  return results;
}

/**
 * Notify job started
 */
export async function notifyJobStarted(
  jobId: string,
  videoId: string,
  projectId: string,
  jobType: string
): Promise<void> {
  await dispatchWebhook(
    "job.started",
    { jobId, videoId, projectId, type: jobType, status: "RUNNING" },
    projectId
  );
}

/**
 * Notify job completed
 */
export async function notifyJobCompleted(
  jobId: string,
  videoId: string,
  projectId: string,
  jobType: string,
  result?: any
): Promise<void> {
  await dispatchWebhook(
    "job.completed",
    { jobId, videoId, projectId, type: jobType, status: "SUCCEEDED", result },
    projectId
  );
}

/**
 * Notify job failed
 */
export async function notifyJobFailed(
  jobId: string,
  videoId: string,
  projectId: string,
  jobType: string,
  error: string
): Promise<void> {
  await dispatchWebhook(
    "job.failed",
    { jobId, videoId, projectId, type: jobType, status: "FAILED", error },
    projectId
  );
}

/**
 * Notify video ready
 */
export async function notifyVideoReady(
  videoId: string,
  projectId: string,
  outputUri?: string
): Promise<void> {
  await dispatchWebhook(
    "video.ready",
    { videoId, projectId, status: "READY", outputUri },
    projectId
  );
}

/**
 * Notify render completed
 */
export async function notifyRenderCompleted(
  jobId: string,
  videoId: string,
  projectId: string,
  outputUri: string,
  result?: any
): Promise<void> {
  await dispatchWebhook(
    "render.completed",
    { jobId, videoId, projectId, status: "COMPLETED", outputUri, result },
    projectId
  );
}

/**
 * Create a webhook
 */
export async function createWebhook(data: {
  projectId?: string;
  name: string;
  url: string;
  secret?: string;
  events: WebhookEvent[];
  headers?: Record<string, string>;
  retryCount?: number;
}): Promise<string> {
  const webhook = await prisma.webhook.create({
    data: {
      projectId: data.projectId,
      name: data.name,
      url: data.url,
      secret: data.secret || crypto.randomBytes(32).toString("hex"),
      events: data.events,
      headers: data.headers as any,
      retryCount: data.retryCount || 3,
    },
  });

  return webhook.id;
}

/**
 * List webhooks for a project
 */
export async function listWebhooks(projectId?: string) {
  return prisma.webhook.findMany({
    where: projectId ? { projectId } : {},
    include: {
      _count: { select: { deliveries: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get webhook delivery history
 */
export async function getWebhookDeliveries(
  webhookId: string,
  limit: number = 50
) {
  return prisma.webhookDelivery.findMany({
    where: { webhookId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Delete a webhook
 */
export async function deleteWebhook(webhookId: string): Promise<void> {
  await prisma.webhook.delete({ where: { id: webhookId } });
}

/**
 * Test webhook by sending a ping
 */
export async function testWebhook(webhookId: string): Promise<WebhookDeliveryResult> {
  const webhook = await prisma.webhook.findUnique({ where: { id: webhookId } });
  if (!webhook) throw new Error("Webhook not found");

  return sendWebhook(
    webhook,
    "job.completed",
    {
      event: "job.completed",
      timestamp: new Date().toISOString(),
      data: {
        jobId: "test-" + Date.now(),
        type: "TEST",
        status: "SUCCEEDED",
      },
    }
  );
}
