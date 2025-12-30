"use client";

import { useState } from "react";

interface Output {
  id: string;
  name: string;
  format: string;
  duration: number | null;
  aspectRatio: string | null;
  createdAt: string;
}

interface OutputListProps {
  outputs: Output[];
}

export function OutputList({ outputs }: OutputListProps) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(outputId: string, name: string) {
    setDownloading(outputId);
    setError(null);

    try {
      const response = await fetch(`/api/outputs/${outputId}/signed-url`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to get download URL");
      }

      const { signedUrl } = await response.json();

      // Open download in new tab or trigger download
      const link = document.createElement("a");
      link.href = signedUrl;
      link.download = name;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(null);
    }
  }

  if (outputs.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Outputs</h2>
        </div>
        <div className="p-6 text-center text-gray-500">
          出力がありません。Render ジョブを実行してください。
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow mb-6">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          Outputs ({outputs.length})
        </h2>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <ul className="divide-y divide-gray-200">
        {outputs.map((output) => (
          <li key={output.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🎬</span>
                  <div>
                    <p className="font-medium text-gray-900">{output.name}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100">
                        {output.format.toUpperCase()}
                      </span>
                      {output.aspectRatio && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100">
                          {output.aspectRatio}
                        </span>
                      )}
                      {output.duration && (
                        <span>
                          {Math.floor(output.duration / 60)}:
                          {String(Math.floor(output.duration % 60)).padStart(2, "0")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-400">
                  {new Date(output.createdAt).toLocaleDateString("ja-JP")}
                </span>
                <button
                  onClick={() => handleDownload(output.id, output.name)}
                  disabled={downloading === output.id}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloading === output.id ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Downloading...
                    </>
                  ) : (
                    <>
                      <svg
                        className="-ml-1 mr-1.5 h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                      Download
                    </>
                  )}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
