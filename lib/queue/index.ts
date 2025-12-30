interface EnqueueJobOptions {
  jobId: string;
  jobType: string;
  delaySeconds?: number;
}

interface QueueConfig {
  projectId: string;
  location: string;
  queue: string;
  workerUrl: string;
  workerSecret?: string;
}

// Cloud Tasks client (lazy initialized with dynamic import)
let tasksClient: unknown = null;

async function getTasksClient() {
  if (!tasksClient) {
    const { CloudTasksClient } = await import("@google-cloud/tasks");
    tasksClient = new CloudTasksClient();
  }
  return tasksClient as {
    queuePath: (project: string, location: string, queue: string) => string;
    createTask: (options: { parent: string; task: unknown }) => Promise<[{ name?: string }]>;
  };
}

// Get queue configuration from environment
function getQueueConfig(): QueueConfig {
  return {
    projectId: process.env.GCP_PROJECT_ID || "",
    location: process.env.GCP_LOCATION || "asia-northeast1",
    queue: process.env.CLOUD_TASKS_QUEUE || "video-jobs",
    workerUrl: process.env.WORKER_URL || "http://localhost:8080",
    workerSecret: process.env.WORKER_SECRET,
  };
}

// Enqueue job to Cloud Tasks
async function enqueueToCloudTasks(options: EnqueueJobOptions): Promise<string> {
  const config = getQueueConfig();
  const client = await getTasksClient();

  const parent = client.queuePath(
    config.projectId,
    config.location,
    config.queue
  );

  const payload = JSON.stringify({
    jobId: options.jobId,
    jobType: options.jobType,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.workerSecret) {
    headers["Authorization"] = `Bearer ${config.workerSecret}`;
  }

  const task = {
    httpRequest: {
      httpMethod: "POST" as const,
      url: `${config.workerUrl}/tasks/execute`,
      headers,
      body: Buffer.from(payload).toString("base64"),
    },
    scheduleTime: options.delaySeconds
      ? {
          seconds: Math.floor(Date.now() / 1000) + options.delaySeconds,
        }
      : undefined,
  };

  const [response] = await client.createTask({ parent, task });
  return response.name || "";
}

// Local development: call worker directly
async function enqueueLocally(options: EnqueueJobOptions): Promise<string> {
  const config = getQueueConfig();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.workerSecret) {
    headers["Authorization"] = `Bearer ${config.workerSecret}`;
  }

  // Fire and forget - don't wait for completion
  fetch(`${config.workerUrl}/tasks/execute`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jobId: options.jobId,
      jobType: options.jobType,
    }),
  }).catch((error) => {
    console.error("Failed to enqueue job locally:", error);
  });

  return `local-${options.jobId}`;
}

// Main enqueue function
export async function enqueueJob(options: EnqueueJobOptions): Promise<string> {
  const useCloudTasks = process.env.USE_CLOUD_TASKS === "true";

  if (useCloudTasks) {
    return enqueueToCloudTasks(options);
  } else {
    return enqueueLocally(options);
  }
}

// Enqueue multiple jobs
export async function enqueueJobs(
  jobs: EnqueueJobOptions[]
): Promise<string[]> {
  return Promise.all(jobs.map((job) => enqueueJob(job)));
}
