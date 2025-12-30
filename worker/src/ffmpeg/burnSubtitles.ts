import { spawn } from "child_process";

export async function burnSubtitles(
  videoPath: string,
  assPath: string
): Promise<string> {
  const outputPath = videoPath.replace(".mp4", "_subtitled.mp4");

  const args = [
    "-i", videoPath,
    "-vf", `ass=${assPath}`,
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
