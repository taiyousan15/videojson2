import { spawn } from "child_process";
import path from "path";

export async function cut(
  inputPath: string,
  startTime: number,
  endTime: number
): Promise<string> {
  const outputPath = `/tmp/clip_${Date.now()}_${startTime}_${endTime}.mp4`;

  const args = [
    "-i", inputPath,
    "-ss", startTime.toString(),
    "-to", endTime.toString(),
    "-c", "copy",
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
