import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { hasProjectAccess } from "@/lib/rbac";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  INGESTING: "bg-blue-100 text-blue-800",
  READY: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { projectId } = await params;

  const hasAccess = await hasProjectAccess(session.user.id, projectId);
  if (!hasAccess) {
    redirect("/projects");
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      workspace: { select: { name: true } },
      videos: {
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { jobs: true } },
        },
      },
    },
  });

  if (!project) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link
            href="/projects"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Projects
          </Link>
        </div>

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {project.workspace.name}
              {project.domain && ` / ${project.domain}`}
            </p>
          </div>
          <Link
            href={`/projects/${projectId}/videos/new`}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 動画を追加
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Videos ({project.videos.length})
            </h2>
          </div>

          {project.videos.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-gray-500 mb-4">動画がありません</p>
              <Link
                href={`/projects/${projectId}/videos/new`}
                className="text-blue-600 hover:underline"
              >
                最初の動画を追加
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {project.videos.map((video) => (
                <li key={video.id}>
                  <Link
                    href={`/projects/${projectId}/videos/${video.id}`}
                    className="block p-6 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {video.sourceUrl || `Video ${video.id.slice(0, 8)}`}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {video.sourceType} /{" "}
                          {new Date(video.createdAt).toLocaleDateString("ja-JP")}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500">
                          {video._count.jobs} jobs
                        </span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            STATUS_COLORS[video.status] || "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {video.status}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
