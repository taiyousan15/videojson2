#!/usr/bin/env node
/**
 * bootstrap-smoke-assets.mjs
 * smoke テスト用のダミーアセットを生成するスクリプト
 *
 * 使い方:
 *   node scripts/bootstrap-smoke-assets.mjs
 *
 * 生成物:
 *   examples/smoke/assets/
 *     ├── placeholder.mp4  (3秒の黒動画)
 *     ├── placeholder.mp3  (3秒の無音音声)
 *     └── placeholder.png  (640x360の黒画像)
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const smokeAssetsDir = path.join(projectRoot, "examples", "smoke", "assets");

// FFmpeg が使えるか確認
function checkFfmpeg() {
  try {
    execSync("ffmpeg -version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// ダミー動画を生成（3秒の黒画面）
function createPlaceholderVideo(outputPath, durationSec = 3) {
  const cmd = [
    "ffmpeg",
    "-y",
    "-f lavfi",
    `-i color=c=black:s=640x360:d=${durationSec}`,
    "-f lavfi",
    `-i anullsrc=r=44100:cl=stereo:d=${durationSec}`,
    "-c:v libx264",
    "-pix_fmt yuv420p",
    "-c:a aac",
    "-shortest",
    `"${outputPath}"`,
  ].join(" ");

  console.log(`Creating placeholder video: ${outputPath}`);
  execSync(cmd, { stdio: "pipe" });
}

// ダミー音声を生成（3秒の無音）
function createPlaceholderAudio(outputPath, durationSec = 3) {
  const cmd = [
    "ffmpeg",
    "-y",
    "-f lavfi",
    `-i anullsrc=r=44100:cl=stereo:d=${durationSec}`,
    "-c:a libmp3lame",
    `"${outputPath}"`,
  ].join(" ");

  console.log(`Creating placeholder audio: ${outputPath}`);
  execSync(cmd, { stdio: "pipe" });
}

// ダミー画像を生成（640x360の黒画像）
function createPlaceholderImage(outputPath) {
  const cmd = [
    "ffmpeg",
    "-y",
    "-f lavfi",
    "-i color=c=gray:s=640x360",
    "-frames:v 1",
    `"${outputPath}"`,
  ].join(" ");

  console.log(`Creating placeholder image: ${outputPath}`);
  execSync(cmd, { stdio: "pipe" });
}

// メイン処理
async function main() {
  console.log("=== Bootstrap Smoke Assets ===\n");

  // FFmpeg チェック
  if (!checkFfmpeg()) {
    console.error("Error: FFmpeg is not installed or not in PATH");
    console.error("Please install FFmpeg to generate smoke test assets.");
    console.error("\nAlternatively, you can place your own test files in:");
    console.error(`  ${smokeAssetsDir}/`);
    process.exit(1);
  }

  // ディレクトリ作成
  if (!fs.existsSync(smokeAssetsDir)) {
    fs.mkdirSync(smokeAssetsDir, { recursive: true });
  }

  // アセット生成
  const videoPath = path.join(smokeAssetsDir, "placeholder.mp4");
  const audioPath = path.join(smokeAssetsDir, "placeholder.mp3");
  const imagePath = path.join(smokeAssetsDir, "placeholder.png");

  try {
    if (!fs.existsSync(videoPath)) {
      createPlaceholderVideo(videoPath);
    } else {
      console.log(`Skipping (exists): ${videoPath}`);
    }

    if (!fs.existsSync(audioPath)) {
      createPlaceholderAudio(audioPath);
    } else {
      console.log(`Skipping (exists): ${audioPath}`);
    }

    if (!fs.existsSync(imagePath)) {
      createPlaceholderImage(imagePath);
    } else {
      console.log(`Skipping (exists): ${imagePath}`);
    }

    console.log("\n=== Smoke assets created successfully ===");
    console.log(`Location: ${smokeAssetsDir}/`);

    // ファイル一覧
    const files = fs.readdirSync(smokeAssetsDir);
    console.log("\nGenerated files:");
    for (const file of files) {
      const filePath = path.join(smokeAssetsDir, file);
      const stats = fs.statSync(filePath);
      console.log(`  - ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
    }
  } catch (error) {
    console.error("Error generating assets:", error.message);
    process.exit(1);
  }
}

main();
