"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Job {
  type: string;
  status: string;
}

interface JobActionsProps {
  videoId: string;
  videoStatus: string;
  jobs: Job[];
}

const JOB_TYPES = [
  { type: "ANALYZE", label: "Analyze", icon: "🔍", deps: ["INGEST"] },
  { type: "OCR", label: "OCR", icon: "📝", deps: ["INGEST"] },
  { type: "HIGHLIGHT", label: "Highlight", icon: "✨", deps: ["ANALYZE", "OCR"] },
  { type: "RENDER", label: "Render", icon: "🎬", deps: ["HIGHLIGHT"] },
] as const;

export function JobActions({ videoId, videoStatus, jobs }: JobActionsProps) {
  const router = useRouter();
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const completedJobs = jobs
    .filter((j) => j.status === "SUCCEEDED")
    .map((j) => j.type);

  const pendingJobs = jobs
    .filter((j) => ["PENDING", "QUEUED", "RUNNING"].includes(j.status))
    .map((j) => j.type);

  async function runJob(type: string) {
    setLoadingType(type);
    setError(null);

    try {
      const response = await fetch(`/api/videos/${videoId}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, autoEnqueue: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create job");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoadingType(null);
    }
  }

  async function enqueueJob(jobId: string) {
    setLoadingType(jobId);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/${jobId}/enqueue`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to enqueue job");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoadingType(null);
    }
  }

  // Find pending INGEST job to allow manual enqueue
  const pendingIngestJob = jobs.find(
    (j) => j.type === "INGEST" && j.status === "PENDING"
  );

  const canRunJobs = videoStatus === "READY";

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Run Analysis Jobs
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {videoStatus === "PENDING" && pendingIngestJob && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800 mb-2">
            Video is pending ingestion. Start the INGEST job to process the video.
          </p>
          <button
            onClick={() => enqueueJob((pendingIngestJob as Job & { id: string }).id || "")}
            disabled={loadingType !== null}
            className="px-3 py-1.5 bg-yellow-600 text-white text-sm font-medium rounded hover:bg-yellow-700 disabled:opacity-50"
          >
            {loadingType ? "Starting..." : "Start Ingest Job"}
          </button>
        </div>
      )}

      {!canRunJobs && videoStatus !== "PENDING" && (
        <p className="text-sm text-gray-500 mb-4">
          Video must be in READY status to run analysis jobs.
          Current status: {videoStatus}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {JOB_TYPES.map(({ type, label, icon, deps }) => {
          const isCompleted = completedJobs.includes(type);
          const isPending = pendingJobs.includes(type);
          const missingDeps = deps.filter((d) => !completedJobs.includes(d));
          const canRun = canRunJobs && missingDeps.length === 0 && !isPending;

          return (
            <button
              key={type}
              onClick={() => runJob(type)}
              disabled={!canRun || loadingType !== null}
              className={`p-4 rounded-lg border text-center transition-all ${
                isCompleted
                  ? "bg-green-50 border-green-200 text-green-800"
                  : isPending
                  ? "bg-blue-50 border-blue-200 text-blue-800"
                  : canRun
                  ? "bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                  : "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              <div className="text-2xl mb-1">{icon}</div>
              <div className="font-medium text-sm">{label}</div>
              {isCompleted && (
                <div className="text-xs mt-1 text-green-600">Completed</div>
              )}
              {isPending && (
                <div className="text-xs mt-1 text-blue-600">Running...</div>
              )}
              {!isCompleted && !isPending && missingDeps.length > 0 && (
                <div className="text-xs mt-1 text-gray-400">
                  Needs: {missingDeps.join(", ")}
                </div>
              )}
              {loadingType === type && (
                <div className="text-xs mt-1">Starting...</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
