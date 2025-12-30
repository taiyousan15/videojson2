import { spawn } from "child_process";
import { ASPECT_RATIOS } from "../../../shared/constants";

export interface ReframeOptions {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function reframe(
  inputPath: string,
  options: ReframeOptions
): Promise<string> {
  const { x, y, width, height } = options;
  const outputPath = inputPath.replace(".mp4", "_reframed.mp4");

  const args = [
    "-i", inputPath,
    "-vf", `crop=${width}:${height}:${x}:${y}`,
    "-c:a", "copy",
    "-y",
    outputPath,
  ];

  await runFfmpeg(args);
  return outputPath;
}

export async function reframeToAspect(
  inputPath: string,
  aspectRatio: "16:9" | "9:16" | "1:1"
): Promise<string> {
  const target = ASPECT_RATIOS[aspectRatio];
  const outputPath = inputPath.replace(".mp4", `_${aspectRatio.replace(":", "x")}.mp4`);

  // Scale and crop to target aspect ratio
  const args = [
    "-i", inputPath,
    "-vf", `scale=${target.width}:${target.height}:force_original_aspect_ratio=increase,crop=${target.width}:${target.height}`,
    "-c:a", "copy",
    "-y",
    outputPath,
  ];

  await runFfmpeg(args);
  return outputPath;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn("ffmpeg", args);

    let stderr = "";

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
      }
    });

    process.on("error", reject);
  });
}
