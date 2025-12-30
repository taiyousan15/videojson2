import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { hasProjectAccess } from "@/lib/rbac";
import { HighlightReview } from "./highlight-review";

export default async function HighlightsPage({
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
      artifacts: {
        where: { type: "HIGHLIGHT_PLAN" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!video) {
    notFound();
  }

  // Get feedback for this video
  const feedback = await prisma.highlightFeedback.findMany({
    where: { videoId },
    include: {
      createdBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Group feedback by segmentId
  const feedbackBySegment: Record<
    string,
    { avgRating: number; count: number }
  > = {};

  for (const fb of feedback) {
    if (!feedbackBySegment[fb.segmentId]) {
      feedbackBySegment[fb.segmentId] = { avgRating: 0, count: 0 };
    }
    feedbackBySegment[fb.segmentId].count++;
    feedbackBySegment[fb.segmentId].avgRating =
      (feedbackBySegment[fb.segmentId].avgRating *
        (feedbackBySegment[fb.segmentId].count - 1) +
        fb.rating) /
      feedbackBySegment[fb.segmentId].count;
  }

  const highlightArtifact = video.artifacts[0] || null;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
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
            Highlight Review
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            ハイライト候補を確認し、フィードバックを送信してください
          </p>
        </div>

        {!highlightArtifact ? (
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <p className="text-gray-500">
              ハイライト候補がありません。
              <br />
              HIGHLIGHTジョブを実行してください。
            </p>
            <Link
              href={`/projects/${projectId}/videos/${videoId}`}
              className="mt-4 inline-block text-blue-600 hover:underline"
            >
              ジョブ管理に戻る
            </Link>
          </div>
        ) : (
          <HighlightReview
            videoId={videoId}
            artifactUri={highlightArtifact.gcsUri}
            feedbackBySegment={feedbackBySegment}
          />
        )}
      </div>
    </main>
  );
}
