"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ModelWeight {
  id: string;
  name: string;
  version: number;
  active: boolean;
  weights: Record<string, number>;
  createdAt: string;
}

interface TrainingJob {
  id: string;
  status: string;
  progress: number;
  config: any;
  result: any;
  error: string | null;
  createdAt: string;
  completedAt?: string;
  createdBy: { name: string | null; email: string } | null;
}

interface Props {
  modelWeights: ModelWeight[];
  trainingJobs: TrainingJob[];
  feedbackStats: {
    total: number;
    positive: number;
    negative: number;
    avgRating: number;
  };
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-800",
  QUEUED: "bg-yellow-100 text-yellow-800",
  RUNNING: "bg-blue-100 text-blue-800",
  SUCCEEDED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

export function ModelManagement({ modelWeights, trainingJobs, feedbackStats }: Props) {
  const router = useRouter();
  const [isTraining, setIsTraining] = useState(false);
  const [trainError, setTrainError] = useState<string | null>(null);

  const activeModel = modelWeights.find((m) => m.active);

  const handleTriggerTraining = async () => {
    setIsTraining(true);
    setTrainError(null);

    try {
      const response = await fetch("/api/admin/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minFeedbackCount: 10, // Lower threshold for testing
          minPositiveRatio: 0.2,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to trigger training");
      }

      router.refresh();
    } catch (error: any) {
      setTrainError(error.message);
    } finally {
      setIsTraining(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Active Model */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            現在のアクティブモデル
          </h2>
          <button
            onClick={handleTriggerTraining}
            disabled={isTraining}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isTraining ? "学習中..." : "学習をトリガー"}
          </button>
        </div>

        {trainError && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg">
            {trainError}
          </div>
        )}

        {activeModel ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                v{activeModel.version}
              </span>
              <span className="text-gray-600">{activeModel.name}</span>
              <span className="text-sm text-gray-400">
                {new Date(activeModel.createdAt).toLocaleString("ja-JP")}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {Object.entries(activeModel.weights).map(([key, value]) => (
                <div key={key} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 truncate">{key}</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {(value * 100).toFixed(1)}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-gray-500">アクティブなモデルがありません</p>
        )}
      </div>

      {/* Training Jobs History */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            学習ジョブ履歴 ({trainingJobs.length})
          </h2>
        </div>

        {trainingJobs.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            学習ジョブがありません
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {trainingJobs.map((job) => (
              <li key={job.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                        STATUS_COLORS[job.status] || "bg-gray-100"
                      }`}
                    >
                      {job.status}
                    </span>
                    {job.progress > 0 && job.progress < 100 && (
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-200 rounded-full">
                          <div
                            className="h-full bg-blue-600 rounded-full"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">
                          {job.progress}%
                        </span>
                      </div>
                    )}
                    {job.config?.triggeredBy === "auto" && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700">
                        自動
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(job.createdAt).toLocaleString("ja-JP")}
                  </span>
                </div>

                {job.config && (
                  <div className="text-sm text-gray-600 space-x-4">
                    <span>
                      フィードバック: {job.config.feedbackCount || "?"}件
                    </span>
                    <span>
                      目標バージョン: v{job.config.targetVersion || "?"}
                    </span>
                  </div>
                )}

                {job.result && (
                  <div className="mt-2 text-sm text-green-600">
                    新バージョン: v{job.result.newVersion}
                  </div>
                )}

                {job.error && (
                  <p className="mt-2 text-sm text-red-600">{job.error}</p>
                )}

                {job.createdBy && (
                  <p className="mt-1 text-xs text-gray-400">
                    実行者: {job.createdBy.name || job.createdBy.email}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Model Version History */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            モデルバージョン履歴 ({modelWeights.length})
          </h2>
        </div>

        {modelWeights.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            モデルがありません
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {modelWeights.map((model) => (
              <li key={model.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
                        model.active
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      v{model.version}
                    </span>
                    <span className="text-gray-700">{model.name}</span>
                    {model.active && (
                      <span className="text-xs text-green-600 font-medium">
                        アクティブ
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(model.createdAt).toLocaleString("ja-JP")}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(model.weights).map(([key, value]) => (
                    <span
                      key={key}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600"
                    >
                      {key}: {(value * 100).toFixed(0)}%
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Auto-Training Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-800 mb-2">
          自動学習について
        </h3>
        <p className="text-blue-700 text-sm mb-4">
          フィードバックが一定量蓄積されると、自動的に学習がトリガーされます。
        </p>
        <ul className="text-sm text-blue-600 space-y-1">
          <li>・ 最小フィードバック数: 50件</li>
          <li>・ 最小高評価率: 30%</li>
          <li>・ 前回学習からの最小経過時間: 24時間</li>
          <li>・ 前回学習以降の最小新規フィードバック: 20件</li>
        </ul>
      </div>
    </div>
  );
}
