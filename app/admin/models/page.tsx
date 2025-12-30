import { requireAdminOrRedirect } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ModelManagement } from "./model-management";

export default async function ModelsPage() {
  await requireAdminOrRedirect();

  // Get model weights history
  const modelWeights = await prisma.modelWeights.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Get training jobs
  const trainingJobs = await prisma.job.findMany({
    where: { type: "TRAIN" },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      createdBy: { select: { name: true, email: true } },
    },
  });

  // Get feedback statistics
  const feedback = await prisma.highlightFeedback.findMany({
    select: { rating: true, createdAt: true },
  });

  const totalFeedback = feedback.length;
  const positiveCount = feedback.filter((f) => f.rating >= 4).length;
  const negativeCount = feedback.filter((f) => f.rating <= 2).length;
  const avgRating =
    totalFeedback > 0
      ? feedback.reduce((sum, f) => sum + f.rating, 0) / totalFeedback
      : 0;

  // Recent feedback trend (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentFeedback = feedback.filter((f) => f.createdAt > sevenDaysAgo);

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          モデル管理 / 学習ループ
        </h1>

        {/* Feedback Statistics */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            フィードバック統計
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">総フィードバック</p>
              <p className="text-2xl font-bold text-gray-900">{totalFeedback}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">高評価 (4-5)</p>
              <p className="text-2xl font-bold text-green-600">{positiveCount}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">低評価 (1-2)</p>
              <p className="text-2xl font-bold text-red-600">{negativeCount}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">平均評価</p>
              <p className="text-2xl font-bold text-blue-600">
                {avgRating.toFixed(2)}
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">直近7日</p>
              <p className="text-2xl font-bold text-purple-600">
                {recentFeedback.length}
              </p>
            </div>
          </div>
        </div>

        {/* Model Management Client Component */}
        <ModelManagement
          modelWeights={modelWeights.map((w) => ({
            id: w.id,
            name: w.name,
            version: w.version,
            active: w.active,
            weights: w.weights as Record<string, number>,
            createdAt: w.createdAt.toISOString(),
          }))}
          trainingJobs={trainingJobs.map((j) => ({
            id: j.id,
            status: j.status,
            progress: j.progress,
            config: j.config as any,
            result: j.result as any,
            error: j.error,
            createdAt: j.createdAt.toISOString(),
            completedAt: j.completedAt?.toISOString(),
            createdBy: j.createdBy,
          }))}
          feedbackStats={{
            total: totalFeedback,
            positive: positiveCount,
            negative: negativeCount,
            avgRating,
          }}
        />
      </div>
    </main>
  );
}
