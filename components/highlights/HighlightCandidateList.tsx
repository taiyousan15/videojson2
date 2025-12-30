"use client";

interface Candidate {
  id: string;
  start: number;
  end: number;
  score: number;
  selected: boolean;
}

interface HighlightCandidateListProps {
  candidates: Candidate[];
  onToggleSelect?: (id: string) => void;
}

export function HighlightCandidateList({ candidates, onToggleSelect }: HighlightCandidateListProps) {
  return (
    <div className="p-4 border rounded">
      <h3>Highlight Candidates</h3>
      <ul>
        {candidates.map((c) => (
          <li key={c.id} className="flex items-center gap-2 p-2 border-b">
            <input
              type="checkbox"
              checked={c.selected}
              onChange={() => onToggleSelect?.(c.id)}
            />
            <span>{c.start.toFixed(2)}s - {c.end.toFixed(2)}s</span>
            <span className="text-gray-500">Score: {c.score.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
