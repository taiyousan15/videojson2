"use client";

interface Asset {
  id: string;
  type: "image" | "audio" | "video";
  name: string;
  url: string;
}

interface AssetsManagerProps {
  assets: Asset[];
  onUpload?: (file: File) => void;
  onRemove?: (id: string) => void;
}

export function AssetsManager({ assets, onUpload, onRemove }: AssetsManagerProps) {
  return (
    <div className="p-4 border rounded">
      <h3>Assets Manager</h3>
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload?.(file);
        }}
        className="mb-4"
      />
      <ul>
        {assets.map((asset) => (
          <li key={asset.id} className="flex items-center gap-2 p-2 border-b">
            <span className="text-gray-500">[{asset.type}]</span>
            <span>{asset.name}</span>
            <button
              onClick={() => onRemove?.(asset.id)}
              className="text-red-500"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
