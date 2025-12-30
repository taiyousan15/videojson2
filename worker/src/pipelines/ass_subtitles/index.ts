import { AuthoringJson } from "../../../../shared/types";

export function generateAss(authoring: AuthoringJson): string {
  const style = authoring.style?.subtitle || {};
  const fontName = style.fontFamily || "Arial";
  const fontSize = style.fontSize || 48;
  const primaryColor = convertColor(style.color || "#FFFFFF");
  const backColor = convertColor(style.backgroundColor || "#00000080");

  const header = `[Script Info]
Title: Generated Subtitles
ScriptType: v4.00+
Collisions: Normal
PlayDepth: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},&H00FFFFFF,&H00000000,${backColor},0,0,0,0,100,100,0,0,3,2,1,2,10,10,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = authoring.script.segments
    .filter((s) => s.subtitle)
    .map((segment) => {
      const start = formatTime(segment.start);
      const end = formatTime(segment.end);
      const text = escapeAss(segment.subtitle || "");
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
    })
    .join("\n");

  return header + events;
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const centisecs = Math.floor((secs % 1) * 100);

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(Math.floor(secs)).padStart(2, "0")}.${String(centisecs).padStart(2, "0")}`;
}

function convertColor(hex: string): string {
  // Convert hex color to ASS format (&HAABBGGRR)
  const match = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i);
  if (!match) return "&H00FFFFFF";

  const r = match[1];
  const g = match[2];
  const b = match[3];
  const a = match[4] || "00";

  return `&H${a}${b}${g}${r}`.toUpperCase();
}

function escapeAss(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\N")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}
