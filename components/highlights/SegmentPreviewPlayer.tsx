"use client";

interface SegmentPreviewPlayerProps {
  src: string;
  start: number;
  end: number;
}

export function SegmentPreviewPlayer({ src, start, end }: SegmentPreviewPlayerProps) {
  return (
    <div className="p-4 border rounded">
      <video
        src={`${src}#t=${start},${end}`}
        controls
        className="w-full max-w-md"
      />
      <div className="text-sm text-gray-500">
        {start.toFixed(2)}s - {end.toFixed(2)}s
      </div>
    </div>
  );
}
