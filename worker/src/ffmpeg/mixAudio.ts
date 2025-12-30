import { spawn } from "child_process";

export async function mixAudio(
  videoPath: string,
  bgmPath: string,
  bgmVolume: number = 0.3
): Promise<string> {
  const outputPath = videoPath.replace(".mp4", "_bgm.mp4");

  // Mix original audio with BGM
  const args = [
    "-i", videoPath,
    "-i", bgmPath,
    "-filter_complex", `[1:a]volume=${bgmVolume}[bgm];[0:a][bgm]amix=inputs=2:duration=first`,
    "-c:v", "copy",
    "-y",
    outputPath,
  ];

  await runFfmpeg(args);
  return outputPath;
}

export async function mixAudioWithFade(
  videoPath: string,
  bgmPath: string,
  options: {
    volume?: number;
    fadeIn?: number;
    fadeOut?: number;
    duration?: number;
  } = {}
): Promise<string> {
  const { volume = 0.3, fadeIn = 2, fadeOut = 2, duration } = options;
  const outputPath = videoPath.replace(".mp4", "_bgm.mp4");

  // Build filter with fades
  let bgmFilter = `volume=${volume}`;
  if (fadeIn > 0) {
    bgmFilter += `,afade=t=in:st=0:d=${fadeIn}`;
  }
  if (fadeOut > 0 && duration) {
    bgmFilter += `,afade=t=out:st=${duration - fadeOut}:d=${fadeOut}`;
  }

  const args = [
    "-i", videoPath,
    "-i", bgmPath,
    "-filter_complex", `[1:a]${bgmFilter}[bgm];[0:a][bgm]amix=inputs=2:duration=first`,
    "-c:v", "copy",
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
