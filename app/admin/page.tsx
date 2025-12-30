import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (user?.role !== "ADMIN") {
    redirect("/projects");
  }

  // Get stats
  const [
    totalUsers,
    totalProjects,
    totalVideos,
    totalJobs,
    runningJobs,
    failedJobs,
    totalOutputs,
    totalFeedback,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.video.count(),
    prisma.job.count(),
    prisma.job.count({ where: { status: { in: ["RUNNING", "QUEUED"] } } }),
    prisma.job.count({ where: { status: "FAILED" } }),
    prisma.output.count(),
    prisma.highlightFeedback.count(),
  ]);

  const adminSections = [
    {
      title: "Jobs",
      description: "ジョブの監視と管理",
      href: "/admin/jobs",
      icon: "📊",
    },
    {
      title: "Training",
      description: "モデル学習管理",
      href: "/admin/models",
      icon: "🧠",
    },
    {
      title: "Providers",
      description: "外部サービス設定",
      href: "/admin/providers",
      icon: "🔌",
    },
    {
      title: "Templates",
      description: "ワークフローテンプレート",
      href: "/admin/templates",
      icon: "📝",
    },
  ];

  const stats = [
    { label: "ユーザー", value: totalUsers, icon: "👥" },
    { label: "プロジェクト", value: totalProjects, icon: "📁" },
    { label: "動画", value: totalVideos, icon: "🎬" },
    { label: "ジョブ", value: totalJobs, icon: "⚙️" },
    { label: "実行中", value: runningJobs, icon: "🔄", color: "text-blue-600" },
    { label: "失敗", value: failedJobs, icon: "❌", color: "text-red-600" },
    { label: "出力", value: totalOutputs, icon: "📦" },
    { label: "フィードバック", value: totalFeedback, icon: "💬" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">
        管理ダッシュボード
      </h1>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-lg shadow p-4 text-center"
          >
            <div className="text-2xl mb-1">{stat.icon}</div>
            <div className={`text-2xl font-bold ${stat.color || "text-gray-900"}`}>
              {stat.value.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Admin Sections */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">管理メニュー</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {adminSections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <div className="text-3xl mb-3">{section.icon}</div>
            <h3 className="text-lg font-semibold text-gray-900">
              {section.title}
            </h3>
            <p className="text-sm text-gray-600 mt-1">{section.description}</p>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        クイックアクション
      </h2>
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/jobs?status=FAILED"
            className="inline-flex items-center px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100"
          >
            失敗ジョブを確認 ({failedJobs})
          </Link>
          <Link
            href="/admin/jobs?status=RUNNING"
            className="inline-flex items-center px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
          >
            実行中ジョブ ({runningJobs})
          </Link>
          <a
            href="/api/admin/feedback/export?format=json"
            className="inline-flex items-center px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100"
          >
            フィードバックエクスポート
          </a>
          <a
            href="/api/admin/stats"
            target="_blank"
            className="inline-flex items-center px-4 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100"
          >
            統計API (JSON)
          </a>
        </div>
      </div>
    </div>
  );
}
