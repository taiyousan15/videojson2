/**
 * State JSON Generator Service
 * Generates complete State JSON for reproducibility and auditing (P1, P7)
 */

import { prisma } from "../db";
import { Storage } from "@google-cloud/storage";

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET || "videojson-bucket";

export interface StateJson {
  version: "1.0";
  runId: string;
  videoId: string;
  projectId: string;
  createdAt: string;
  config: {
    renderMode?: string;
    aspectRatio?: string;
    platform?: string;
    [key: string]: any;
  };
  artifacts: {
    sourceVideo?: string;
    normalizedVideo?: string;
    eventJson?: string;
    authoringJson?: string;
    planJson?: string;
    templateJson?: string;
    renderScript?: string;
    outputVideo?: string;
    thumbnail?: string;
    assSubtitle?: string;
    ocrReport?: string;
    embedReport?: string;
    highlightPlan?: string;
    generatedAssets?: string[];
  };
  jobs: JobSummary[];
  providerVersions: Record<string, string>;
  modelWeightsVersion: number | null;
  feedback: {
    highlightCount: number;
    avgRating: number | null;
  };
  checksums: {
    [artifactType: string]: string;
  };
}

interface JobSummary {
  jobId: string;
  type: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  reviewCount: number;
}

/**
 * Generate complete State JSON for a video run
 */
export async function generateStateJson(
  runId: string,
  videoId: string,
  config: Record<string, any> = {}
): Promise<{ stateJson: StateJson; gcsUri: string }> {
  // Get video with project
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      project: { select: { id: true } },
    },
  });

  if (!video) throw new Error(`Video not found: ${videoId}`);

  // Get all artifacts for this video
  const artifacts = await prisma.artifact.findMany({
    where: { videoId },
    orderBy: { createdAt: "desc" },
  });

  // Get all jobs for this video
  const jobs = await prisma.job.findMany({
    where: { videoId },
    include: {
      _count: { select: { reviews: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Get active model weights
  const activeWeights = await prisma.modelWeights.findFirst({
    where: { active: true },
    orderBy: { version: "desc" },
  });

  // Get highlight feedback statistics
  const feedbackStats = await prisma.highlightFeedback.aggregate({
    where: { videoId },
    _count: true,
    _avg: { rating: true },
  });

  // Get provider configs for version tracking
  const providerConfigs = await prisma.providerConfig.findMany({
    where: { active: true },
  });

  // Build artifacts map (latest of each type)
  const artifactsByType: Record<string, string> = {};
  const checksums: Record<string, string> = {};

  for (const artifact of artifacts) {
    if (!artifactsByType[artifact.type]) {
      artifactsByType[artifact.type] = artifact.gcsUri;

      // Extract checksum if available in metadata
      const metadata = artifact.metadata as any;
      if (metadata?.sha256) {
        checksums[artifact.type] = metadata.sha256;
      }
    }
  }

  // Build provider versions map
  const providerVersions: Record<string, string> = {};
  for (const provider of providerConfigs) {
    const config = provider.config as any;
    providerVersions[provider.name] = config?.version || config?.model || "unknown";
  }

  // Build job summaries
  const jobSummaries: JobSummary[] = jobs.map((job) => ({
    jobId: job.id,
    type: job.type,
    status: job.status,
    startedAt: job.startedAt?.toISOString() || null,
    completedAt: job.completedAt?.toISOString() || null,
    error: job.error,
    reviewCount: job._count.reviews,
  }));

  // Build State JSON
  const stateJson: StateJson = {
    version: "1.0",
    runId,
    videoId,
    projectId: video.projectId,
    createdAt: new Date().toISOString(),
    config,
    artifacts: {
      sourceVideo: artifactsByType.SOURCE_VIDEO,
      normalizedVideo: artifactsByType.NORMALIZED_VIDEO,
      eventJson: artifactsByType.EVENT_JSON,
      authoringJson: artifactsByType.AUTHORING_JSON,
      planJson: artifactsByType.PLAN_JSON,
      templateJson: artifactsByType.TEMPLATE_JSON,
      renderScript: artifactsByType.RENDER_SCRIPT,
      outputVideo: artifactsByType.OUTPUT_VIDEO,
      thumbnail: artifactsByType.THUMBNAIL,
      assSubtitle: artifactsByType.ASS_SUBTITLE,
      ocrReport: artifactsByType.OCR_REPORT,
      embedReport: artifactsByType.EMBED_REPORT,
      highlightPlan: artifactsByType.HIGHLIGHT_PLAN,
      generatedAssets: artifacts
        .filter((a) => a.type === "GENERATED_ASSETS")
        .map((a) => a.gcsUri),
    },
    jobs: jobSummaries,
    providerVersions,
    modelWeightsVersion: activeWeights?.version || null,
    feedback: {
      highlightCount: feedbackStats._count,
      avgRating: feedbackStats._avg.rating,
    },
    checksums,
  };

  // Upload to GCS
  const timestamp = Date.now();
  const gcsPath = `states/${videoId}/${runId}_${timestamp}.json`;
  const gcsUri = `gs://${bucketName}/${gcsPath}`;

  try {
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(gcsPath);

    await file.save(JSON.stringify(stateJson, null, 2), {
      contentType: "application/json",
      metadata: {
        runId,
        videoId,
        createdAt: stateJson.createdAt,
      },
    });

    console.log(`[StateJson] Saved to ${gcsUri}`);
  } catch (error) {
    console.error("[StateJson] Failed to upload to GCS:", error);
    // Continue even if upload fails - return the state JSON anyway
  }

  // Update Run record with state JSON URI
  await prisma.run.update({
    where: { id: runId },
    data: { stateJsonUri: gcsUri },
  }).catch((err) => {
    console.error("[StateJson] Failed to update Run record:", err);
  });

  // Create STATE_JSON artifact
  const latestJob = jobs.find((j) => j.status === "SUCCEEDED");
  if (latestJob) {
    await prisma.artifact.create({
      data: {
        jobId: latestJob.id,
        videoId,
        type: "STATE_JSON",
        gcsUri,
        metadata: {
          runId,
          version: stateJson.version,
          jobCount: jobs.length,
          artifactCount: artifacts.length,
        },
      },
    }).catch((err) => {
      console.error("[StateJson] Failed to create artifact:", err);
    });
  }

  return { stateJson, gcsUri };
}

/**
 * Load State JSON from GCS
 */
export async function loadStateJson(gcsUri: string): Promise<StateJson | null> {
  try {
    const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!match) throw new Error(`Invalid GCS URI: ${gcsUri}`);

    const [, bucket, path] = match;
    const file = storage.bucket(bucket).file(path);
    const [contents] = await file.download();

    return JSON.parse(contents.toString()) as StateJson;
  } catch (error) {
    console.error("[StateJson] Failed to load:", error);
    return null;
  }
}

/**
 * Compare two State JSONs for debugging/auditing
 */
export function compareStateJsons(
  stateA: StateJson,
  stateB: StateJson
): {
  artifactsDiff: string[];
  jobsDiff: string[];
  configDiff: string[];
} {
  const artifactsDiff: string[] = [];
  const jobsDiff: string[] = [];
  const configDiff: string[] = [];

  // Compare artifacts
  const allArtifactKeys = new Set([
    ...Object.keys(stateA.artifacts),
    ...Object.keys(stateB.artifacts),
  ]);

  for (const key of allArtifactKeys) {
    const valA = (stateA.artifacts as any)[key];
    const valB = (stateB.artifacts as any)[key];
    if (JSON.stringify(valA) !== JSON.stringify(valB)) {
      artifactsDiff.push(`${key}: ${valA} → ${valB}`);
    }
  }

  // Compare jobs
  const jobsA = new Map(stateA.jobs.map((j) => [j.jobId, j]));
  const jobsB = new Map(stateB.jobs.map((j) => [j.jobId, j]));

  for (const [jobId, jobA] of jobsA) {
    const jobB = jobsB.get(jobId);
    if (!jobB) {
      jobsDiff.push(`Removed: ${jobA.type} (${jobId})`);
    } else if (jobA.status !== jobB.status) {
      jobsDiff.push(`${jobA.type}: ${jobA.status} → ${jobB.status}`);
    }
  }

  for (const [jobId, jobB] of jobsB) {
    if (!jobsA.has(jobId)) {
      jobsDiff.push(`Added: ${jobB.type} (${jobId})`);
    }
  }

  // Compare config
  const allConfigKeys = new Set([
    ...Object.keys(stateA.config),
    ...Object.keys(stateB.config),
  ]);

  for (const key of allConfigKeys) {
    const valA = stateA.config[key];
    const valB = stateB.config[key];
    if (JSON.stringify(valA) !== JSON.stringify(valB)) {
      configDiff.push(`${key}: ${JSON.stringify(valA)} → ${JSON.stringify(valB)}`);
    }
  }

  return { artifactsDiff, jobsDiff, configDiff };
}
