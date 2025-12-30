import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { hasProjectAccess } from "@/lib/rbac";
import { NewVideoForm } from "./new-video-form";

export default async function NewVideoPage({
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
    select: { id: true, name: true },
  });

  if (!project) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link
            href={`/projects/${projectId}`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; {project.name}
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          動画を追加
        </h1>

        <NewVideoForm projectId={projectId} />
      </div>
    </main>
  );
}
