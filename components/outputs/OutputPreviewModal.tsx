"use client";

interface OutputPreviewModalProps {
  output: {
    id: string;
    name: string;
    videoUrl: string;
  };
  onClose: () => void;
  onDownload?: () => void;
}

export function OutputPreviewModal({ output, onClose, onDownload }: OutputPreviewModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-lg max-w-4xl w-full p-4">
        <div className="flex justify-between items-center mb-4">
          <h3>{output.name}</h3>
          <button onClick={onClose} className="text-gray-500">Close</button>
        </div>
        <video src={output.videoUrl} controls className="w-full" />
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onDownload}
            className="px-4 py-2 bg-blue-500 text-white rounded"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
