/**
 * FFmpeg Concat - クリップ結合処理
 */

import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";

export interface ConcatOptions {
  /** Output resolution (e.g., "1920x1080") */
  resolution?: string;
  /** Output frame rate */
  fps?: number;
  /** Re-encode instead of stream copy (slower but handles different codecs) */
  reencode?: boolean;
}

/**
 * Concatenate multiple video clips into a single video
 * Uses the concat demuxer for fast concatenation when codecs match
 */
export async function concat(
  inputPaths: string[],
  options: ConcatOptions = {}
): Promise<string> {
  if (inputPaths.length === 0) {
    throw new Error("No input files provided for concatenation");
  }

  if (inputPaths.length === 1) {
    // Single file, just copy it
    const outputPath = `/tmp/concat_${Date.now()}.mp4`;
    await fs.copyFile(inputPaths[0], outputPath);
    return outputPath;
  }

  const outputPath = `/tmp/concat_${Date.now()}.mp4`;
  const listPath = `/tmp/concat_list_${Date.now()}.txt`;

  try {
    // Create concat list file
    const listContent = inputPaths
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join("\n");
    await fs.writeFile(listPath, listContent, "utf-8");

    let args: string[];

    if (options.reencode) {
      // Re-encode mode: handles different codecs/resolutions
      args = buildReencodeArgs(listPath, outputPath, options);
    } else {
      // Fast concat mode: stream copy (requires matching codecs)
      args = [
        "-f", "concat",
        "-safe", "0",
        "-i", listPath,
        "-c", "copy",
        "-y",
        outputPath,
      ];
    }

    await runFfmpeg(args);
    return outputPath;
  } finally {
    // Cleanup list file
    await fs.unlink(listPath).catch(() => {});
  }
}

/**
 * Concatenate with re-encoding (for clips with different codecs/resolutions)
 */
export async function concatWithReencode(
  inputPaths: string[],
  options: ConcatOptions = {}
): Promise<string> {
  return concat(inputPaths, { ...options, reencode: true });
}

/**
 * Concatenate clips with crossfade transitions
 */
export async function concatWithTransition(
  inputPaths: string[],
  options: {
    transitionDuration?: number;
    transitionType?: "fade" | "dissolve" | "wipe";
    resolution?: string;
    fps?: number;
  } = {}
): Promise<string> {
  if (inputPaths.length === 0) {
    throw new Error("No input files provided");
  }

  if (inputPaths.length === 1) {
    const outputPath = `/tmp/concat_${Date.now()}.mp4`;
    await fs.copyFile(inputPaths[0], outputPath);
    return outputPath;
  }

  const { transitionDuration = 0.5, resolution = "1920x1080", fps = 30 } = options;
  const outputPath = `/tmp/concat_transition_${Date.now()}.mp4`;

  // Build complex filter for xfade transitions
  const inputs = inputPaths.map((_, i) => `-i ${inputPaths[i]}`).join(" ");

  // Build xfade filter chain
  let filterComplex = "";
  let lastOutput = "[0:v]";

  for (let i = 1; i < inputPaths.length; i++) {
    const nextInput = `[${i}:v]`;
    const output = i === inputPaths.length - 1 ? "[outv]" : `[v${i}]`;
    const offset = i * 5 - transitionDuration; // Assume 5s clips, adjust based on actual duration

    filterComplex += `${lastOutput}${nextInput}xfade=transition=fade:duration=${transitionDuration}:offset=${offset}${output};`;
    lastOutput = output;
  }

  // Audio concat
  const audioInputs = inputPaths.map((_, i) => `[${i}:a]`).join("");
  filterComplex += `${audioInputs}concat=n=${inputPaths.length}:v=0:a=1[outa]`;

  const args = [
    ...inputPaths.flatMap((p) => ["-i", p]),
    "-filter_complex", filterComplex,
    "-map", "[outv]",
    "-map", "[outa]",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-y",
    outputPath,
  ];

  await runFfmpeg(args);
  return outputPath;
}

function buildReencodeArgs(
  listPath: string,
  outputPath: string,
  options: ConcatOptions
): string[] {
  const args = [
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
  ];

  // Video encoding
  args.push("-c:v", "libx264");
  args.push("-preset", "medium");
  args.push("-crf", "23");

  if (options.resolution) {
    args.push("-s", options.resolution);
  }

  if (options.fps) {
    args.push("-r", options.fps.toString());
  }

  // Audio encoding
  args.push("-c:a", "aac");
  args.push("-b:a", "128k");

  args.push("-y", outputPath);

  return args;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log("[FFmpeg] Running:", "ffmpeg", args.join(" "));

    const process = spawn("ffmpeg", args);

    let stderr = "";

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });

    process.on("error", (err) => {
      reject(new Error(`ffmpeg failed to start: ${err.message}`));
    });
  });
}
