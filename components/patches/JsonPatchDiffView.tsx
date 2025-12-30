"use client";

interface JsonPatchDiffViewProps {
  base: object;
  patched: object;
}

export function JsonPatchDiffView({ base, patched }: JsonPatchDiffViewProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h4>Base</h4>
        <pre className="bg-gray-100 p-2 text-sm overflow-auto max-h-96">
          {JSON.stringify(base, null, 2)}
        </pre>
      </div>
      <div>
        <h4>Patched</h4>
        <pre className="bg-gray-100 p-2 text-sm overflow-auto max-h-96">
          {JSON.stringify(patched, null, 2)}
        </pre>
      </div>
    </div>
  );
}
