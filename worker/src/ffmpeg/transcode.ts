import { spawn } from "child_process";
import path from "path";

export interface TranscodeOptions {
  codec?: string;
  preset?: string;
  crf?: number;
  audioCodec?: string;
  audioBitrate?: string;
}

export async function transcode(
  inputPath: string,
  options: TranscodeOptions = {}
): Promise<string> {
  const {
    codec = "libx264",
    preset = "medium",
    crf = 23,
    audioCodec = "aac",
    audioBitrate = "128k",
  } = options;

  const outputPath = inputPath.replace(/\.[^.]+$/, "_normalized.mp4");

  const args = [
    "-i", inputPath,
    "-c:v", codec,
    "-preset", preset,
    "-crf", crf.toString(),
    "-c:a", audioCodec,
    "-b:a", audioBitrate,
    "-movflags", "+faststart",
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
