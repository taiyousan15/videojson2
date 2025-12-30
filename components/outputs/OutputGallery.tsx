"use client";

interface Output {
  id: string;
  name: string;
  thumbnailUrl: string;
  createdAt: string;
}

interface OutputGalleryProps {
  outputs: Output[];
  onSelect?: (output: Output) => void;
}

export function OutputGallery({ outputs, onSelect }: OutputGalleryProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {outputs.map((output) => (
        <div
          key={output.id}
          className="border rounded cursor-pointer hover:shadow-lg"
          onClick={() => onSelect?.(output)}
        >
          <img
            src={output.thumbnailUrl}
            alt={output.name}
            className="w-full aspect-video object-cover"
          />
          <div className="p-2">
            <div className="font-medium">{output.name}</div>
            <div className="text-sm text-gray-500">{output.createdAt}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
