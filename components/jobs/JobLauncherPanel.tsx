"use client";

interface JobLauncherPanelProps {
  videoId: string;
  projectId: string;
}

export function JobLauncherPanel({ videoId, projectId }: JobLauncherPanelProps) {
  const jobTypes = ["INGEST", "ANALYZE", "OCR", "EMBED", "HIGHLIGHT", "RENDER", "ASSEMBLE"];

  return (
    <div className="p-4 border rounded">
      <h3>Launch Job</h3>
      <div className="flex gap-2 flex-wrap">
        {jobTypes.map((type) => (
          <button key={type} className="px-3 py-1 bg-blue-500 text-white rounded">
            {type}
          </button>
        ))}
      </div>
    </div>
  );
}
