import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function ProjectsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const projects = await prisma.project.findMany({
    where: {
      OR: [
        {
          workspace: {
            members: {
              some: { userId: session.user.id },
            },
          },
        },
        {
          members: {
            some: { userId: session.user.id },
          },
        },
      ],
    },
    include: {
      workspace: { select: { id: true, name: true } },
      _count: { select: { videos: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
          <Link
            href="/projects/new"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 新規プロジェクト
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <p className="text-gray-500 mb-4">プロジェクトがありません</p>
            <Link
              href="/projects/new"
              className="text-blue-600 hover:underline"
            >
              最初のプロジェクトを作成
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      {project.name}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {project.workspace.name}
                    </p>
                    {project.domain && (
                      <p className="text-sm text-gray-400 mt-1">
                        {project.domain}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {project._count.videos} videos
                    </span>
                    <p className="text-xs text-gray-400 mt-2">
                      {project.language.toUpperCase()}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
