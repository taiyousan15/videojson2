"use client";

import { useState } from "react";

interface PatchEditorProps {
  basePath: string;
  onApply?: (patch: object[]) => void;
}

export function PatchEditor({ basePath, onApply }: PatchEditorProps) {
  const [patchJson, setPatchJson] = useState("[]");

  const handleApply = () => {
    try {
      const patch = JSON.parse(patchJson);
      onApply?.(patch);
    } catch (e) {
      alert("Invalid JSON");
    }
  };

  return (
    <div className="p-4 border rounded">
      <h3>JSON Patch Editor</h3>
      <textarea
        value={patchJson}
        onChange={(e) => setPatchJson(e.target.value)}
        className="w-full h-40 font-mono text-sm border p-2"
        placeholder='[{ "op": "replace", "path": "/...", "value": "..." }]'
      />
      <button
        onClick={handleApply}
        className="mt-2 px-4 py-2 bg-green-500 text-white rounded"
      >
        Apply Patch
      </button>
    </div>
  );
}
