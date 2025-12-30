import { CloudTasksClient } from "@google-cloud/tasks";

const client = new CloudTasksClient();

const PROJECT = process.env.GCP_PROJECT_ID!;
const LOCATION = process.env.GCP_LOCATION || "asia-northeast1";
const WORKER_URL = process.env.WORKER_URL!;

export type QueueType = "cpu-queue" | "gpu-queue";

export async function enqueueJob(
  jobId: string,
  jobType: string,
  queue: QueueType = "cpu-queue"
): Promise<string> {
  const parent = client.queuePath(PROJECT, LOCATION, queue);
  const taskName = `${parent}/tasks/jobs-${jobId}`;

  const task = {
    name: taskName,
    httpRequest: {
      httpMethod: "POST" as const,
      url: `${WORKER_URL}/tasks/execute`,
      headers: {
        "Content-Type": "application/json",
      },
      body: Buffer.from(JSON.stringify({ jobId, jobType })).toString("base64"),
      oidcToken: {
        serviceAccountEmail: process.env.GCP_SERVICE_ACCOUNT_EMAIL,
      },
    },
  };

  try {
    const [response] = await client.createTask({ parent, task });
    return response.name!;
  } catch (error: any) {
    // ALREADY_EXISTS means idempotent - task already queued
    if (error.code === 6) {
      return taskName;
    }
    throw error;
  }
}
