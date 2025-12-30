"use client";

import { useState } from "react";

interface GcsDirectUploadWidgetProps {
  projectId: string;
  onUploadComplete?: (videoId: string) => void;
}

export function GcsDirectUploadWidget({ projectId, onUploadComplete }: GcsDirectUploadWidgetProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    // TODO: Get signed URL and upload to GCS
    setProgress(100);
    setUploading(false);
    onUploadComplete?.("new-video-id");
  };

  return (
    <div className="p-4 border rounded">
      <input
        type="file"
        accept="video/mp4,video/*"
        onChange={handleFileSelect}
        disabled={uploading}
      />
      {uploading && <div>Uploading: {progress}%</div>}
    </div>
  );
}
