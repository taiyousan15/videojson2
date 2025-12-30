"use client";

import { useState } from "react";

interface Style {
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
}

interface StyleEditorProps {
  initialStyle: Style;
  onChange?: (style: Style) => void;
}

export function StyleEditor({ initialStyle, onChange }: StyleEditorProps) {
  const [style, setStyle] = useState(initialStyle);

  const updateStyle = (updates: Partial<Style>) => {
    const newStyle = { ...style, ...updates };
    setStyle(newStyle);
    onChange?.(newStyle);
  };

  return (
    <div className="p-4 border rounded">
      <h3>Style Editor</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label>Font Family</label>
          <input
            type="text"
            value={style.fontFamily}
            onChange={(e) => updateStyle({ fontFamily: e.target.value })}
            className="w-full border p-1"
          />
        </div>
        <div>
          <label>Font Size</label>
          <input
            type="number"
            value={style.fontSize}
            onChange={(e) => updateStyle({ fontSize: Number(e.target.value) })}
            className="w-full border p-1"
          />
        </div>
        <div>
          <label>Color</label>
          <input
            type="color"
            value={style.color}
            onChange={(e) => updateStyle({ color: e.target.value })}
            className="w-full"
          />
        </div>
        <div>
          <label>Background</label>
          <input
            type="color"
            value={style.backgroundColor}
            onChange={(e) => updateStyle({ backgroundColor: e.target.value })}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
