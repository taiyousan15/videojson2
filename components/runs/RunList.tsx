"use client";

interface Run {
  id: string;
  createdAt: string;
  status: string;
  stateJsonUrl?: string;
}

interface RunListProps {
  runs: Run[];
  onSelect?: (run: Run) => void;
  onRerun?: (run: Run) => void;
}

export function RunList({ runs, onSelect, onRerun }: RunListProps) {
  return (
    <div className="p-4 border rounded">
      <h3>Run History</h3>
      <ul>
        {runs.map((run) => (
          <li key={run.id} className="flex items-center justify-between p-2 border-b">
            <div>
              <span className="font-mono">{run.id}</span>
              <span className="ml-2 text-gray-500">{run.createdAt}</span>
              <span className="ml-2">{run.status}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onSelect?.(run)}
                className="text-blue-500"
              >
                View
              </button>
              <button
                onClick={() => onRerun?.(run)}
                className="text-green-500"
              >
                Rerun
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
