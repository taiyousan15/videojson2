"use client";

import { useState } from "react";

interface ScriptEditorProps {
  initialScript: string;
  onChange?: (script: string) => void;
}

export function ScriptEditor({ initialScript, onChange }: ScriptEditorProps) {
  const [script, setScript] = useState(initialScript);

  const handleChange = (value: string) => {
    setScript(value);
    onChange?.(value);
  };

  return (
    <div className="p-4 border rounded">
      <h3>Script Editor</h3>
      <textarea
        value={script}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full h-64 font-mono text-sm border p-2"
      />
    </div>
  );
}
