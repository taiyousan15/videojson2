import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { hasProjectAccess } from "@/lib/rbac";
import { RenderPanel } from "./render-panel";

export default async function RenderPage({
  params,
}: {
  params: Promise<{ projectId: string; videoId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { projectId, videoId } = await params;

  const hasAccess = await hasProjectAccess(session.user.id, projectId);
  if (!hasAccess) {
    redirect("/projects");
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      project: { select: { id: true, name: true } },
      jobs: {
        where: { type: { in: ["HIGHLIGHT", "RENDER"] } },
        orderBy: { createdAt: "desc" },
      },
      outputs: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!video) {
    notFound();
  }

  const highlightJob = video.jobs.find(
    (j) => j.type === "HIGHLIGHT" && j.status === "SUCCEEDED"
  );
  const activeRenderJob = video.jobs.find(
    (j) => j.type === "RENDER" && ["PENDING", "QUEUED", "RUNNING"].includes(j.status)
  );
  const recentRenderJobs = video.jobs.filter((j) => j.type === "RENDER").slice(0, 5);

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link
            href={`/projects/${projectId}/videos/${videoId}`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; {video.project.name} / Video
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Render Video
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            レンダリング設定を選択してビデオを生成します
          </p>
        </div>

        {!highlightJob ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <p className="text-yellow-800">
              レンダリングを行うには、まずHIGHLIGHTジョブを完了させてください。
            </p>
            <Link
              href={`/projects/${projectId}/videos/${videoId}`}
              className="mt-4 inline-block text-blue-600 hover:underline"
            >
              ジョブ管理に戻る
            </Link>
          </div>
        ) : (
          <RenderPanel
            videoId={videoId}
            videoInfo={{
              duration: video.duration,
              width: video.width,
              height: video.height,
              fps: video.fps,
              status: video.status,
            }}
            activeJob={activeRenderJob ? {
              id: activeRenderJob.id,
              status: activeRenderJob.status,
              progress: activeRenderJob.progress,
              stage: activeRenderJob.stage,
            } : null}
            recentJobs={recentRenderJobs.map((j) => ({
              id: j.id,
              status: j.status,
              config: j.config as Record<string, unknown>,
              createdAt: j.createdAt.toISOString(),
              completedAt: j.completedAt?.toISOString(),
            }))}
            outputs={video.outputs.map((o) => ({
              id: o.id,
              name: o.name,
              format: o.format,
              duration: o.duration,
              aspectRatio: o.aspectRatio,
              createdAt: o.createdAt.toISOString(),
            }))}
          />
        )}
      </div>
    </main>
  );
}
