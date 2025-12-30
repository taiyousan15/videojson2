"use client";

interface OnScreenText {
  id: string;
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  timestamp: number;
}

interface OnScreenTextPanelProps {
  texts: OnScreenText[];
  onTextSelect?: (text: OnScreenText) => void;
}

export function OnScreenTextPanel({ texts, onTextSelect }: OnScreenTextPanelProps) {
  return (
    <div className="p-4 border rounded">
      <h3>On-Screen Text (OCR)</h3>
      <ul>
        {texts.map((text) => (
          <li
            key={text.id}
            className="cursor-pointer hover:bg-gray-100 p-2"
            onClick={() => onTextSelect?.(text)}
          >
            <span className="font-mono">{text.timestamp.toFixed(2)}s</span>: {text.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
