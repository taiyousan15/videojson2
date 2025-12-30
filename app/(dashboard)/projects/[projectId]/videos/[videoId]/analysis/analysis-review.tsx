"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface JobData {
  id: string;
  type: string;
  status: string;
  stage: string | null;
  progress: number;
  result: any;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ReviewData {
  id: string;
  action: string;
  patch: any;
  comment: string | null;
  createdAt: string;
}

interface AnalysisReviewProps {
  job: JobData;
  reviews: ReviewData[];
  eventJsonUri?: string;
  projectId: string;
  videoId: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-800",
  QUEUED: "bg-yellow-100 text-yellow-800",
  RUNNING: "bg-blue-100 text-blue-800",
  WAITING_EXTERNAL: "bg-purple-100 text-purple-800",
  REVIEW_REQUIRED: "bg-orange-100 text-orange-800 border-2 border-orange-400",
  SUCCEEDED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  CANCELED: "bg-gray-100 text-gray-600",
};

export function AnalysisReview({
  job,
  reviews,
  eventJsonUri,
  projectId,
  videoId,
}: AnalysisReviewProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [comment, setComment] = useState("");
  const [patchJson, setPatchJson] = useState("[]");
  const [patchError, setPatchError] = useState<string | null>(null);
  const [showPatchEditor, setShowPatchEditor] = useState(false);

  const isReviewRequired = job.status === "REVIEW_REQUIRED";

  const handleSubmitReview = async (action: "APPROVE" | "REJECT" | "PATCH") => {
    setIsSubmitting(true);
    setPatchError(null);

    try {
      let patch = undefined;

      if (action === "PATCH") {
        try {
          patch = JSON.parse(patchJson);
          if (!Array.isArray(patch)) {
            throw new Error("Patch must be an array");
          }
        } catch (e: any) {
          setPatchError("Invalid JSON: " + e.message);
          setIsSubmitting(false);
          return;
        }
      }

      const response = await fetch(`/api/jobs/${job.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          patch,
          comment: comment || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit review");
      }

      router.refresh();
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Job Status Banner */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <span
              className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium ${
                STATUS_COLORS[job.status] || "bg-gray-100"
              }`}
            >
              {job.status}
            </span>
            <span className="text-gray-600">{job.type}</span>
          </div>
          {job.progress > 0 && job.progress < 100 && (
            <div className="flex items-center gap-2">
              <div className="w-32 h-2 bg-gray-200 rounded-full">
                <div
                  className="h-full bg-blue-600 rounded-full"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
              <span className="text-sm text-gray-600">{job.progress}%</span>
            </div>
          )}
        </div>

        {job.stage && (
          <p className="text-sm text-gray-600 mb-2">Stage: {job.stage}</p>
        )}
        {job.error && (
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded">
            Error: {job.error}
          </p>
        )}

        <div className="text-xs text-gray-400 mt-4">
          Created: {new Date(job.createdAt).toLocaleString("ja-JP")}
          {" | "}
          Updated: {new Date(job.updatedAt).toLocaleString("ja-JP")}
        </div>
      </div>

      {/* Event JSON Artifact */}
      {eventJsonUri && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Event JSON
          </h3>
          <p className="text-sm text-gray-500 break-all">{eventJsonUri}</p>
        </div>
      )}

      {/* Review Required Section */}
      {isReviewRequired && (
        <div className="bg-orange-50 border-2 border-orange-300 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-orange-800 mb-4">
            レビューが必要です
          </h3>

          <div className="space-y-4">
            {/* Comment */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                コメント（任意）
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder="レビューコメントを入力..."
              />
            </div>

            {/* Patch Editor Toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowPatchEditor(!showPatchEditor)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {showPatchEditor ? "▼ パッチエディタを閉じる" : "▶ パッチエディタを開く"}
              </button>
            </div>

            {showPatchEditor && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  JSON Patch（RFC 6902形式）
                </label>
                <textarea
                  value={patchJson}
                  onChange={(e) => {
                    setPatchJson(e.target.value);
                    setPatchError(null);
                  }}
                  className={`w-full px-3 py-2 border rounded-lg font-mono text-sm ${
                    patchError
                      ? "border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:ring-blue-500"
                  }`}
                  rows={8}
                  placeholder='[{"op": "replace", "path": "/chapters/0/title", "value": "新しいタイトル"}]'
                />
                {patchError && (
                  <p className="mt-1 text-sm text-red-600">{patchError}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  例: {`[{"op": "replace", "path": "/key", "value": "new"}]`}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 pt-4 border-t border-orange-200">
              <button
                onClick={() => handleSubmitReview("APPROVE")}
                disabled={isSubmitting}
                className="inline-flex items-center px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {isSubmitting ? "処理中..." : "✓ 承認"}
              </button>

              {showPatchEditor && (
                <button
                  onClick={() => handleSubmitReview("PATCH")}
                  disabled={isSubmitting}
                  className="inline-flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? "処理中..." : "📝 パッチ適用"}
                </button>
              )}

              <button
                onClick={() => handleSubmitReview("REJECT")}
                disabled={isSubmitting}
                className="inline-flex items-center px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {isSubmitting ? "処理中..." : "✗ 却下"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review History */}
      {reviews.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            レビュー履歴 ({reviews.length})
          </h3>
          <ul className="space-y-4">
            {reviews.map((review) => (
              <li
                key={review.id}
                className="border-l-4 pl-4 py-2"
                style={{
                  borderColor:
                    review.action === "APPROVE"
                      ? "#22c55e"
                      : review.action === "REJECT"
                      ? "#ef4444"
                      : "#3b82f6",
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      review.action === "APPROVE"
                        ? "bg-green-100 text-green-800"
                        : review.action === "REJECT"
                        ? "bg-red-100 text-red-800"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {review.action}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(review.createdAt).toLocaleString("ja-JP")}
                  </span>
                </div>
                {review.comment && (
                  <p className="text-sm text-gray-700">{review.comment}</p>
                )}
                {review.patch && (
                  <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                    {JSON.stringify(review.patch, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Result Data */}
      {job.result && Object.keys(job.result).length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            ジョブ結果
          </h3>
          <pre className="text-xs bg-gray-100 p-4 rounded overflow-x-auto max-h-96">
            {JSON.stringify(job.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
