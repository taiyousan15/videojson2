import { prisma } from "./prisma";

export type ArtifactType =
  | "SOURCE_VIDEO"
  | "NORMALIZED_VIDEO"
  | "EVENT_JSON"
  | "AUTHORING_JSON"
  | "PLAN_JSON"
  | "STATE_JSON"
  | "OUTPUT_VIDEO"
  | "THUMBNAIL"
  | "ASS_SUBTITLE";

export async function createArtifact(data: {
  jobId: string;
  videoId: string;
  type: ArtifactType;
  gcsUri: string;
  metadata?: object;
}) {
  return prisma.artifact.create({
    data: {
      jobId: data.jobId,
      videoId: data.videoId,
      type: data.type,
      gcsUri: data.gcsUri,
      metadata: data.metadata ?? {},
    },
  });
}

export async function getArtifactsByVideo(videoId: string) {
  return prisma.artifact.findMany({
    where: { videoId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLatestArtifact(
  videoId: string,
  type: ArtifactType
) {
  return prisma.artifact.findFirst({
    where: { videoId, type },
    orderBy: { createdAt: "desc" },
  });
}
