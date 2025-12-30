/**
 * ASS Subtitle Generator
 * Generates Advanced SubStation Alpha (ASS) subtitles from authoring JSON
 */

import * as fs from "fs/promises";

export interface SubtitleEntry {
  startTime: number; // seconds
  endTime: number; // seconds
  text: string;
  style?: string;
  position?: "top" | "center" | "bottom";
  effect?: "fade" | "slide" | "none";
}

export interface AssStyle {
  name: string;
  fontName?: string;
  fontSize?: number;
  primaryColor?: string; // ASS color format: &HAABBGGRR
  outlineColor?: string;
  backColor?: string;
  bold?: boolean;
  italic?: boolean;
  outline?: number;
  shadow?: number;
  alignment?: number; // 1-9 numpad style
  marginL?: number;
  marginR?: number;
  marginV?: number;
}

export interface GenerateAssOptions {
  resolution?: { width: number; height: number };
  styles?: AssStyle[];
  defaultStyle?: string;
}

const DEFAULT_STYLES: AssStyle[] = [
  {
    name: "Default",
    fontName: "Noto Sans JP",
    fontSize: 48,
    primaryColor: "&H00FFFFFF", // White
    outlineColor: "&H00000000", // Black
    backColor: "&H80000000", // Semi-transparent black
    bold: true,
    outline: 2,
    shadow: 1,
    alignment: 2, // Bottom center
    marginV: 30,
  },
  {
    name: "Top",
    fontName: "Noto Sans JP",
    fontSize: 42,
    primaryColor: "&H00FFFFFF",
    outlineColor: "&H00000000",
    bold: true,
    outline: 2,
    shadow: 1,
    alignment: 8, // Top center
    marginV: 20,
  },
  {
    name: "Highlight",
    fontName: "Noto Sans JP",
    fontSize: 56,
    primaryColor: "&H0000FFFF", // Yellow
    outlineColor: "&H00000000",
    bold: true,
    outline: 3,
    shadow: 2,
    alignment: 2,
    marginV: 40,
  },
  {
    name: "Caption",
    fontName: "Noto Sans JP",
    fontSize: 36,
    primaryColor: "&H00FFFFFF",
    outlineColor: "&H00333333",
    backColor: "&HCC000000",
    outline: 1,
    shadow: 0,
    alignment: 2,
    marginV: 20,
  },
];

/**
 * Generate ASS subtitle file from authoring JSON
 */
export async function generateAss(
  entries: SubtitleEntry[],
  outputPath: string,
  options: GenerateAssOptions = {}
): Promise<string> {
  const { resolution = { width: 1920, height: 1080 }, styles = DEFAULT_STYLES } = options;

  const header = generateHeader(resolution, styles);
  const events = generateEvents(entries, options.defaultStyle || "Default");

  const content = `${header}\n\n${events}`;
  await fs.writeFile(outputPath, content, "utf-8");

  console.log(`[ASS] Generated subtitle file: ${outputPath} (${entries.length} entries)`);
  return outputPath;
}

/**
 * Generate ASS from Authoring JSON structure
 */
export async function generateAssFromAuthoring(
  authoring: any,
  outputPath: string,
  options: GenerateAssOptions = {}
): Promise<string> {
  const entries: SubtitleEntry[] = [];

  // Extract subtitles from authoring JSON
  if (authoring?.segments) {
    for (const segment of authoring.segments) {
      if (segment.subtitle || segment.caption) {
        entries.push({
          startTime: segment.startTime || 0,
          endTime: segment.endTime || segment.startTime + 5,
          text: segment.subtitle || segment.caption,
          style: segment.style || "Default",
          position: segment.position || "bottom",
        });
      }

      // Handle nested text overlays
      if (segment.overlays) {
        for (const overlay of segment.overlays) {
          if (overlay.type === "text" && overlay.text) {
            entries.push({
              startTime: overlay.startTime || segment.startTime,
              endTime: overlay.endTime || segment.endTime,
              text: overlay.text,
              style: overlay.style || "Caption",
              position: overlay.position,
            });
          }
        }
      }
    }
  }

  // Handle global captions
  if (authoring?.captions) {
    for (const caption of authoring.captions) {
      entries.push({
        startTime: caption.startTime || 0,
        endTime: caption.endTime || caption.startTime + 3,
        text: caption.text,
        style: caption.style || "Caption",
      });
    }
  }

  // Sort by start time
  entries.sort((a, b) => a.startTime - b.startTime);

  return generateAss(entries, outputPath, options);
}

function generateHeader(
  resolution: { width: number; height: number },
  styles: AssStyle[]
): string {
  const scriptInfo = `[Script Info]
Title: VideoJSON Generated Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: ${resolution.width}
PlayResY: ${resolution.height}`;

  const styleHeader = `[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding`;

  const styleLines = styles.map((s) => formatStyle(s)).join("\n");

  return `${scriptInfo}\n\n${styleHeader}\n${styleLines}`;
}

function formatStyle(style: AssStyle): string {
  const {
    name,
    fontName = "Arial",
    fontSize = 48,
    primaryColor = "&H00FFFFFF",
    outlineColor = "&H00000000",
    backColor = "&H00000000",
    bold = false,
    italic = false,
    outline = 2,
    shadow = 1,
    alignment = 2,
    marginL = 10,
    marginR = 10,
    marginV = 30,
  } = style;

  return `Style: ${name},${fontName},${fontSize},${primaryColor},&H000000FF,${outlineColor},${backColor},${bold ? -1 : 0},${italic ? -1 : 0},0,0,100,100,0,0,1,${outline},${shadow},${alignment},${marginL},${marginR},${marginV},1`;
}

function generateEvents(entries: SubtitleEntry[], defaultStyle: string): string {
  const header = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const dialogues = entries.map((entry) => {
    const start = formatTime(entry.startTime);
    const end = formatTime(entry.endTime);
    const style = entry.style || defaultStyle;
    const text = escapeText(entry.text);

    // Add position override if specified
    let formattedText = text;
    if (entry.position === "top") {
      formattedText = `{\\an8}${text}`;
    } else if (entry.position === "center") {
      formattedText = `{\\an5}${text}`;
    }

    // Add fade effect if specified
    if (entry.effect === "fade") {
      formattedText = `{\\fad(200,200)}${formattedText}`;
    }

    return `Dialogue: 0,${start},${end},${style},,0,0,0,,${formattedText}`;
  });

  return `${header}\n${dialogues.join("\n")}`;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);

  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

function escapeText(text: string): string {
  // Escape special ASS characters and handle line breaks
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\N");
}

/**
 * Create a simple subtitle from transcript
 */
export async function generateAssFromTranscript(
  transcript: Array<{ start: number; end: number; text: string }>,
  outputPath: string,
  options: GenerateAssOptions = {}
): Promise<string> {
  const entries: SubtitleEntry[] = transcript.map((t) => ({
    startTime: t.start,
    endTime: t.end,
    text: t.text,
    style: "Default",
  }));

  return generateAss(entries, outputPath, options);
}
