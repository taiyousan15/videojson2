"use client";

interface JobStatusBannerProps {
  jobId: string;
  status: string;
  progress?: number;
}

export function JobStatusBanner({ jobId, status, progress }: JobStatusBannerProps) {
  return (
    <div className="p-4 border rounded">
      <div>Job: {jobId}</div>
      <div>Status: {status}</div>
      {progress !== undefined && <div>Progress: {progress}%</div>}
    </div>
  );
}
