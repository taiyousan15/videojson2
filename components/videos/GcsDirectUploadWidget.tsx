"use client";

import { useState, useCallback } from "react";

interface GcsDirectUploadWidgetProps {
  projectId: string;
  onUploadComplete?: (videoId: string) => void;
}

interface SignedUrlResponse {
  signedUrl: string;
  gcsUri: string;
  videoId: string;
}

async function fetchSignedUploadUrl(
  projectId: string,
  fileName: string,
  contentType: string
): Promise<SignedUrlResponse> {
  const response = await fetch(`/api/projects/${projectId}/upload/signed-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, contentType }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to get signed URL: ${response.status}`);
  }

  return response.json();
}

function uploadFileWithProgress(
  signedUrl: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Upload failed due to a network error"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload was aborted"));
    });

    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.send(file);
  });
}

export function GcsDirectUploadWidget({ projectId, onUploadComplete }: GcsDirectUploadWidgetProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const { signedUrl, videoId } = await fetchSignedUploadUrl(
        projectId,
        file.name,
        file.type || "video/mp4"
      );

      await uploadFileWithProgress(signedUrl, file, setProgress);

      setProgress(100);
      onUploadComplete?.(videoId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
    } finally {
      setUploading(false);
    }
  }, [projectId, onUploadComplete]);

  return (
    <div className="p-4 border rounded">
      <input
        type="file"
        accept="video/mp4,video/*"
        onChange={handleFileSelect}
        disabled={uploading}
      />
      {uploading && (
        <div className="mt-2">
          <div className="w-full bg-gray-200 rounded h-2">
            <div
              className="bg-blue-600 h-2 rounded transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-sm text-gray-600 mt-1">{progress}%</span>
        </div>
      )}
      {error && (
        <div className="mt-2 text-sm text-red-600">{error}</div>
      )}
    </div>
  );
}
