import { StateJson, JobSummary } from "../../../../shared/types";
import { prisma } from "../../db";

export async function buildStateJson(
  runId: string,
  videoId: string
): Promise<StateJson> {
  // Get all artifacts for this video
  const artifacts = await prisma.artifact.findMany({
    where: { videoId },
    orderBy: { createdAt: "desc" },
  });

  // Get all jobs for this video
  const jobs = await prisma.job.findMany({
    where: { videoId },
    orderBy: { createdAt: "desc" },
  });

  // Get active model weights
  const weights = await prisma.modelWeights.findFirst({
    where: { active: true },
    orderBy: { version: "desc" },
  });

  // Get provider configs
  const providers = await prisma.providerConfig.findMany({
    where: { active: true },
  });

  const stateArtifacts: StateJson["artifacts"] = {};

  for (const artifact of artifacts) {
    switch (artifact.type) {
      case "SOURCE_VIDEO":
        if (!stateArtifacts.sourceVideo) stateArtifacts.sourceVideo = artifact.gcsUri;
        break;
      case "NORMALIZED_VIDEO":
        if (!stateArtifacts.normalizedVideo) stateArtifacts.normalizedVideo = artifact.gcsUri;
        break;
      case "EVENT_JSON":
        if (!stateArtifacts.eventJson) stateArtifacts.eventJson = artifact.gcsUri;
        break;
      case "AUTHORING_JSON":
        if (!stateArtifacts.authoringJson) stateArtifacts.authoringJson = artifact.gcsUri;
        break;
      case "PLAN_JSON":
        if (!stateArtifacts.planJson) stateArtifacts.planJson = artifact.gcsUri;
        break;
      case "OUTPUT_VIDEO":
        if (!stateArtifacts.outputVideo) stateArtifacts.outputVideo = artifact.gcsUri;
        break;
    }
  }

  const jobSummaries: JobSummary[] = jobs.map((job) => ({
    jobId: job.id,
    type: job.type as any,
    status: job.status as any,
    startedAt: job.startedAt?.toISOString(),
    completedAt: job.completedAt?.toISOString(),
  }));

  const providerVersions: Record<string, string> = {};
  for (const provider of providers) {
    providerVersions[provider.name] = provider.type;
  }

  return {
    version: "1.0",
    runId,
    videoId,
    createdAt: new Date().toISOString(),
    artifacts: stateArtifacts,
    jobs: jobSummaries,
    providerVersions,
    modelWeightsVersion: weights?.version,
  };
}
