import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { hasProjectAccess } from "@/lib/rbac";
import { JobActions } from "./job-actions";
import { OutputList } from "./output-list";

const VIDEO_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  INGESTING: "bg-blue-100 text-blue-800",
  READY: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

const JOB_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-800",
  QUEUED: "bg-yellow-100 text-yellow-800",
  RUNNING: "bg-blue-100 text-blue-800",
  WAITING_EXTERNAL: "bg-purple-100 text-purple-800",
  REVIEW_REQUIRED: "bg-orange-100 text-orange-800",
  SUCCEEDED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  CANCELED: "bg-gray-100 text-gray-600",
};

const JOB_TYPE_LABELS: Record<string, string> = {
  INGEST: "取り込み",
  ANALYZE: "分析",
  OCR: "OCR",
  EMBED: "埋め込み",
  HIGHLIGHT: "ハイライト",
  RENDER: "レンダリング",
  ASSEMBLE: "アセンブル",
  TRAIN: "学習",
};

export default async function VideoPage({
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
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: { select: { name: true, email: true } },
        },
      },
      artifacts: {
        orderBy: { createdAt: "desc" },
      },
      outputs: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!video) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link
            href={`/projects/${projectId}`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; {video.project.name}
          </Link>
        </div>

        {/* Video Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {video.sourceUrl
                  ? new URL(video.sourceUrl).hostname
                  : `Video ${video.id.slice(0, 8)}`}
              </h1>
              <p className="text-sm text-gray-500 mt-1 break-all">
                {video.sourceUrl || "No source URL"}
              </p>
            </div>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                VIDEO_STATUS_COLORS[video.status] || "bg-gray-100 text-gray-800"
              }`}
            >
              {video.status}
            </span>
          </div>

          {/* Video Metadata */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Type:</span>
              <span className="ml-2 font-medium">{video.sourceType}</span>
            </div>
            {video.duration && (
              <div>
                <span className="text-gray-500">Duration:</span>
                <span className="ml-2 font-medium">
                  {Math.floor(video.duration / 60)}:{String(Math.floor(video.duration % 60)).padStart(2, "0")}
                </span>
              </div>
            )}
            {video.width && video.height && (
              <div>
                <span className="text-gray-500">Resolution:</span>
                <span className="ml-2 font-medium">
                  {video.width}x{video.height}
                </span>
              </div>
            )}
            {video.fps && (
              <div>
                <span className="text-gray-500">FPS:</span>
                <span className="ml-2 font-medium">{video.fps}</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/projects/${projectId}/videos/${videoId}/analysis`}
              className="inline-flex items-center px-4 py-2 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 transition-colors"
            >
              <span className="mr-2">🔍</span>
              Analysis Review
            </Link>
            <Link
              href={`/projects/${projectId}/videos/${videoId}/highlights`}
              className="inline-flex items-center px-4 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors"
            >
              <span className="mr-2">✨</span>
              Highlights Review
            </Link>
            <Link
              href={`/projects/${projectId}/videos/${videoId}/render`}
              className="inline-flex items-center px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <span className="mr-2">🎬</span>
              Render Settings
            </Link>
            <Link
              href={`/projects/${projectId}/videos/${videoId}/outputs`}
              className="inline-flex items-center px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
            >
              <span className="mr-2">📁</span>
              Outputs
            </Link>
          </div>
        </div>

        {/* Job Actions */}
        <JobActions
          videoId={videoId}
          videoStatus={video.status}
          jobs={video.jobs.map((j) => ({
            id: j.id,
            type: j.type,
            status: j.status,
          }))}
        />

        {/* Jobs Section */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Jobs ({video.jobs.length})
            </h2>
          </div>

          {video.jobs.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              ジョブがありません
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {video.jobs.map((job) => (
                <li key={job.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                          JOB_STATUS_COLORS[job.status] || "bg-gray-100"
                        }`}
                      >
                        {job.status}
                      </span>
                      <span className="font-medium text-gray-900">
                        {JOB_TYPE_LABELS[job.type] || job.type}
                      </span>
                      {job.progress > 0 && job.progress < 100 && (
                        <span className="text-sm text-gray-500">
                          {job.progress}%
                        </span>
                      )}
                      {job.status === "REVIEW_REQUIRED" && (
                        <Link
                          href={`/projects/${projectId}/videos/${videoId}/analysis`}
                          className="inline-flex items-center px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                        >
                          レビューする →
                        </Link>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(job.createdAt).toLocaleString("ja-JP")}
                    </div>
                  </div>
                  {job.stage && (
                    <p className="mt-1 text-sm text-gray-500">{job.stage}</p>
                  )}
                  {job.error && (
                    <p className="mt-1 text-sm text-red-600">{job.error}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Artifacts Section */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Artifacts ({video.artifacts.length})
            </h2>
          </div>

          {video.artifacts.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              アーティファクトがありません
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {video.artifacts.map((artifact) => (
                <li key={artifact.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                        {artifact.type}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(artifact.createdAt).toLocaleString("ja-JP")}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-gray-400 truncate">
                    {artifact.gcsUri}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Outputs Section */}
        <OutputList
          outputs={video.outputs.map((output) => ({
            id: output.id,
            name: output.name,
            format: output.format,
            duration: output.duration,
            aspectRatio: output.aspectRatio,
            createdAt: output.createdAt.toISOString(),
          }))}
        />
      </div>
    </main>
  );
}
