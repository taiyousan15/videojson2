import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { hasProjectAccess } from "@/lib/rbac";
import { AnalysisReview } from "./analysis-review";

export default async function AnalysisPage({
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

  // Get video with ANALYZE jobs and EVENT_JSON artifact
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      project: { select: { id: true, name: true } },
      jobs: {
        where: { type: "ANALYZE" },
        orderBy: { createdAt: "desc" },
        include: {
          reviews: {
            orderBy: { createdAt: "desc" },
          },
        },
      },
      artifacts: {
        where: { type: "EVENT_JSON" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!video) {
    notFound();
  }

  const latestJob = video.jobs[0];
  const eventJsonArtifact = video.artifacts[0];

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Link
            href={`/projects/${projectId}/videos/${videoId}`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; ビデオ詳細に戻る
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Event JSON Analysis
          </h1>
          <p className="text-gray-600">
            動画解析結果の確認とレビュー
          </p>
        </div>

        {!latestJob ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500 mb-4">解析ジョブがありません</p>
            <Link
              href={`/projects/${projectId}/videos/${videoId}`}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              ビデオ詳細で解析を開始
            </Link>
          </div>
        ) : (
          <AnalysisReview
            job={{
              id: latestJob.id,
              type: latestJob.type,
              status: latestJob.status,
              stage: latestJob.stage,
              progress: latestJob.progress,
              result: latestJob.result as any,
              error: latestJob.error,
              createdAt: latestJob.createdAt.toISOString(),
              updatedAt: latestJob.updatedAt.toISOString(),
            }}
            reviews={latestJob.reviews.map((r) => ({
              id: r.id,
              action: r.action,
              patch: r.patch as any,
              comment: r.comment,
              createdAt: r.createdAt.toISOString(),
            }))}
            eventJsonUri={eventJsonArtifact?.gcsUri}
            projectId={projectId}
            videoId={videoId}
          />
        )}
      </div>
    </main>
  );
}
