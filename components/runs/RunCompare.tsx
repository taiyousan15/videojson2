"use client";

interface RunCompareProps {
  runA: { id: string; state: object };
  runB: { id: string; state: object };
}

export function RunCompare({ runA, runB }: RunCompareProps) {
  return (
    <div className="p-4 border rounded">
      <h3>State Comparison</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4>Run: {runA.id}</h4>
          <pre className="bg-gray-100 p-2 text-sm overflow-auto max-h-96">
            {JSON.stringify(runA.state, null, 2)}
          </pre>
        </div>
        <div>
          <h4>Run: {runB.id}</h4>
          <pre className="bg-gray-100 p-2 text-sm overflow-auto max-h-96">
            {JSON.stringify(runB.state, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
