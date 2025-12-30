"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RenderConfig {
  format: "mp4" | "webm" | "gif";
  quality: "draft" | "standard" | "high" | "ultra";
  aspectRatio: "16:9" | "9:16" | "1:1" | "4:3";
  resolution: "720p" | "1080p" | "1440p" | "4k";
  fps: 24 | 30 | 60;
  includeSubtitles: boolean;
  subtitleStyle: "default" | "karaoke" | "minimal";
}

interface RenderPanelProps {
  videoId: string;
  videoInfo: {
    duration: number | null;
    width: number | null;
    height: number | null;
    fps: number | null;
    status: string;
  };
  activeJob: {
    id: string;
    status: string;
    progress: number;
    stage: string | null;
  } | null;
  recentJobs: {
    id: string;
    status: string;
    config: Record<string, unknown>;
    createdAt: string;
    completedAt?: string;
  }[];
  outputs: {
    id: string;
    name: string;
    format: string;
    duration: number | null;
    aspectRatio: string | null;
    createdAt: string;
  }[];
}

const JOB_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-800",
  QUEUED: "bg-yellow-100 text-yellow-800",
  RUNNING: "bg-blue-100 text-blue-800",
  SUCCEEDED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

export function RenderPanel({
  videoId,
  videoInfo,
  activeJob,
  recentJobs,
  outputs,
}: RenderPanelProps) {
  const router = useRouter();
  const [config, setConfig] = useState<RenderConfig>({
    format: "mp4",
    quality: "standard",
    aspectRatio: "16:9",
    resolution: "1080p",
    fps: 30,
    includeSubtitles: true,
    subtitleStyle: "default",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/videos/${videoId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to start render");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start render");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "-";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6">
      {/* Active Job Status */}
      {activeJob && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-blue-900">
              レンダリング中...
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                JOB_STATUS_COLORS[activeJob.status]
              }`}
            >
              {activeJob.status}
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${activeJob.progress}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-sm text-blue-700">
            <span>{activeJob.stage || "Preparing..."}</span>
            <span>{activeJob.progress}%</span>
          </div>
        </div>
      )}

      {/* Render Configuration */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          レンダリング設定
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {/* Format */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              フォーマット
            </label>
            <select
              value={config.format}
              onChange={(e) => setConfig({ ...config, format: e.target.value as any })}
              disabled={!!activeJob || submitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="mp4">MP4</option>
              <option value="webm">WebM</option>
              <option value="gif">GIF</option>
            </select>
          </div>

          {/* Quality */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              品質
            </label>
            <select
              value={config.quality}
              onChange={(e) => setConfig({ ...config, quality: e.target.value as any })}
              disabled={!!activeJob || submitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="draft">Draft (速い)</option>
              <option value="standard">Standard</option>
              <option value="high">High</option>
              <option value="ultra">Ultra (遅い)</option>
            </select>
          </div>

          {/* Aspect Ratio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              アスペクト比
            </label>
            <select
              value={config.aspectRatio}
              onChange={(e) => setConfig({ ...config, aspectRatio: e.target.value as any })}
              disabled={!!activeJob || submitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="16:9">16:9 (横長)</option>
              <option value="9:16">9:16 (縦長/リール)</option>
              <option value="1:1">1:1 (正方形)</option>
              <option value="4:3">4:3</option>
            </select>
          </div>

          {/* Resolution */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              解像度
            </label>
            <select
              value={config.resolution}
              onChange={(e) => setConfig({ ...config, resolution: e.target.value as any })}
              disabled={!!activeJob || submitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p (推奨)</option>
              <option value="1440p">1440p</option>
              <option value="4k">4K</option>
            </select>
          </div>

          {/* FPS */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              フレームレート
            </label>
            <select
              value={config.fps}
              onChange={(e) => setConfig({ ...config, fps: parseInt(e.target.value) as any })}
              disabled={!!activeJob || submitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value={24}>24 FPS</option>
              <option value={30}>30 FPS</option>
              <option value={60}>60 FPS</option>
            </select>
          </div>

          {/* Subtitles */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              字幕スタイル
            </label>
            <select
              value={config.subtitleStyle}
              onChange={(e) => setConfig({
                ...config,
                subtitleStyle: e.target.value as any,
                includeSubtitles: e.target.value !== "none",
              })}
              disabled={!!activeJob || submitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="default">標準</option>
              <option value="karaoke">カラオケ風</option>
              <option value="minimal">ミニマル</option>
            </select>
          </div>
        </div>

        {/* Submit Button */}
        <div className="mt-6">
          <button
            onClick={handleSubmit}
            disabled={!!activeJob || submitting}
            className="w-full py-3 px-4 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                開始中...
              </span>
            ) : activeJob ? (
              "レンダリング中..."
            ) : (
              "レンダリング開始"
            )}
          </button>
        </div>
      </div>

      {/* Recent Outputs */}
      {outputs.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              生成済み出力
            </h2>
          </div>
          <ul className="divide-y divide-gray-200">
            {outputs.map((output) => (
              <li key={output.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-900">
                      {output.name}
                    </span>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                      <span className="px-2 py-0.5 bg-gray-100 rounded">
                        {output.format.toUpperCase()}
                      </span>
                      {output.aspectRatio && (
                        <span className="px-2 py-0.5 bg-gray-100 rounded">
                          {output.aspectRatio}
                        </span>
                      )}
                      <span>{formatDuration(output.duration)}</span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(output.createdAt).toLocaleDateString("ja-JP")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent Jobs */}
      {recentJobs.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              レンダリング履歴
            </h2>
          </div>
          <ul className="divide-y divide-gray-200">
            {recentJobs.map((job) => (
              <li key={job.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                        JOB_STATUS_COLORS[job.status]
                      }`}
                    >
                      {job.status}
                    </span>
                    <span className="text-sm text-gray-600">
                      {(job.config as any)?.format?.toUpperCase() || "MP4"} /
                      {(job.config as any)?.resolution || "1080p"}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(job.createdAt).toLocaleString("ja-JP")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
