import { prisma } from "@/lib/prisma";
import Link from "next/link";

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
  INGEST: "Ingest",
  ANALYZE: "Analyze",
  OCR: "OCR",
  EMBED: "Embed",
  HIGHLIGHT: "Highlight",
  RENDER: "Render",
  ASSEMBLE: "Assemble",
  TRAIN: "Train",
};

export default async function JobsMonitorPage() {
  const [jobs, stats] = await Promise.all([
    prisma.job.findMany({
      include: {
        video: {
          select: {
            id: true,
            sourceUrl: true,
            project: {
              select: { id: true, name: true },
            },
          },
        },
        createdBy: {
          select: { name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.job.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
  ]);

  const statusCounts = stats.reduce(
    (acc, item) => {
      acc[item.status] = item._count.status;
      return acc;
    },
    {} as Record<string, number>
  );

  const totalJobs = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Job Monitor</h1>
        <span className="text-sm text-gray-500">Total: {totalJobs} jobs</span>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
        {Object.entries(JOB_STATUS_COLORS).map(([status, color]) => (
          <div
            key={status}
            className="bg-white rounded-lg shadow p-4 text-center"
          >
            <span
              className={`inline-block px-2 py-1 rounded text-xs font-medium ${color}`}
            >
              {status}
            </span>
            <p className="text-2xl font-bold mt-2">
              {statusCounts[status] || 0}
            </p>
          </div>
        ))}
      </div>

      {/* Jobs Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Project / Video
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Progress
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  ジョブがありません
                </td>
              </tr>
            ) : (
              jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        JOB_STATUS_COLORS[job.status] || "bg-gray-100"
                      }`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {JOB_TYPE_LABELS[job.type] || job.type}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${job.video.project.id}/videos/${job.video.id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {job.video.project.name}
                    </Link>
                    <p className="text-xs text-gray-400 truncate max-w-xs">
                      {job.video.sourceUrl || job.video.id.slice(0, 8)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {job.status === "RUNNING" ? (
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">
                          {job.progress}%
                        </span>
                      </div>
                    ) : job.error ? (
                      <span className="text-xs text-red-600 truncate max-w-xs block">
                        {job.error}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(job.createdAt).toLocaleString("ja-JP")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
