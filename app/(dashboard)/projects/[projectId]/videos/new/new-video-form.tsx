"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface NewVideoFormProps {
  projectId: string;
}

export function NewVideoForm({ projectId }: NewVideoFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<"URL" | "UPLOAD">("URL");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const sourceUrl = formData.get("sourceUrl") as string;

    if (sourceType === "URL" && !sourceUrl) {
      setError("URLを入力してください");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/projects/${projectId}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType,
          sourceUrl: sourceType === "URL" ? sourceUrl : null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create video");
      }

      const { video } = await response.json();
      router.push(`/projects/${projectId}/videos/${video.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            ソースタイプ
          </label>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setSourceType("URL")}
              className={`flex-1 p-4 border rounded-lg text-center transition-colors ${
                sourceType === "URL"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="text-2xl mb-1">🔗</div>
              <div className="font-medium">URL</div>
              <div className="text-xs text-gray-500 mt-1">
                YouTube, Vimeo, etc.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setSourceType("UPLOAD")}
              className={`flex-1 p-4 border rounded-lg text-center transition-colors ${
                sourceType === "UPLOAD"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="text-2xl mb-1">📁</div>
              <div className="font-medium">Upload</div>
              <div className="text-xs text-gray-500 mt-1">
                MP4, MOV, etc.
              </div>
            </button>
          </div>
        </div>

        {sourceType === "URL" && (
          <div>
            <label
              htmlFor="sourceUrl"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              動画URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              id="sourceUrl"
              name="sourceUrl"
              required={sourceType === "URL"}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              placeholder="https://www.youtube.com/watch?v=..."
            />
            <p className="mt-1 text-sm text-gray-500">
              YouTube, Vimeo, または直接MP4リンク
            </p>
          </div>
        )}

        {sourceType === "UPLOAD" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ファイル <span className="text-red-500">*</span>
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <div className="text-4xl mb-2">📤</div>
              <p className="text-gray-500">
                ファイルアップロードは今後実装予定です
              </p>
              <p className="text-sm text-gray-400 mt-1">
                現在はURLからの取り込みのみ対応
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <Link
          href={`/projects/${projectId}`}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          キャンセル
        </Link>
        <button
          type="submit"
          disabled={isLoading || sourceType === "UPLOAD"}
          className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? "処理中..." : "動画を追加してIngestジョブを開始"}
        </button>
      </div>
    </form>
  );
}
