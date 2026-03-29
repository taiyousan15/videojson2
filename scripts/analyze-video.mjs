#!/usr/bin/env node
/**
 * analyze-video.mjs
 * ローカル動画から structure.json を生成する（ワンコマンド）
 *
 * 内部処理:
 * 1. transcribe-whisper で transcript.json を生成
 * 2. analyze-transcript で structure.json を生成
 *
 * 注意:
 * - Whisper CLI が必要です
 * - 未インストールの場合は代替手段を案内します
 *
 * 使い方:
 *   node scripts/analyze-video.mjs --video <path> --out <structure.json> --language <ja|en>
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import os from "os";

function parseArgs(args) {
  const result = {
    video: null,
    out: null,
    language: "ja",
    model: "base",
    keepTranscript: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--video" && args[i + 1]) {
      result.video = args[++i];
    } else if (args[i] === "--out" && args[i + 1]) {
      result.out = args[++i];
    } else if (args[i] === "--language" && args[i + 1]) {
      result.language = args[++i];
    } else if (args[i] === "--model" && args[i + 1]) {
      result.model = args[++i];
    } else if (args[i] === "--keep-transcript") {
      result.keepTranscript = true;
    }
  }

  return result;
}

function showUsage() {
  console.log(`
Usage: node scripts/analyze-video.mjs --video <path> --out <structure.json>

Options:
  --video <path>      Input video/audio file (required)
  --out <path>        Output path for structure.json (required)
  --language <lang>   Language code (default: ja)
  --model <model>     Whisper model (default: base)
  --keep-transcript   Keep the intermediate transcript.json file

Example:
  node scripts/analyze-video.mjs --video video.mp4 --out structure.json --language ja
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.video || !args.out) {
    console.error("Error: --video and --out are required\n");
    showUsage();
    process.exit(1);
  }

  const videoPath = path.resolve(args.video);
  const outputPath = path.resolve(args.out);
  const outDir = path.dirname(outputPath);

  // 一時ファイルパス
  const tmpDir = args.keepTranscript ? outDir : os.tmpdir();
  const baseName = path.basename(videoPath, path.extname(videoPath));
  const transcriptPath = path.join(tmpDir, `${baseName}_transcript.json`);

  console.log("=== Analyze Video ===\n");
  console.log(`Video:    ${videoPath}`);
  console.log(`Output:   ${outputPath}`);
  console.log(`Language: ${args.language}`);
  console.log(`Model:    ${args.model}`);

  // ファイル存在チェック
  if (!fs.existsSync(videoPath)) {
    console.error(`Error: Video file not found: ${videoPath}`);
    process.exit(1);
  }

  // Step 1: transcribe-whisper
  console.log("\n" + "=".repeat(50));
  console.log("Step 1: Transcribing with Whisper");
  console.log("=".repeat(50) + "\n");

  const transcribeArgs = [
    "scripts/transcribe-whisper.mjs",
    "--video", videoPath,
    "--out", transcriptPath,
    "--language", args.language,
    "--model", args.model,
  ];

  const transcribeResult = spawnSync("node", transcribeArgs, {
    stdio: "inherit",
    encoding: "utf-8",
  });

  if (transcribeResult.status !== 0) {
    console.error("\n❌ Transcription failed");
    console.error("\nAlternative options:");
    console.error("  1. If you have SRT/VTT subtitles:");
    console.error("     npm run transcript:convert -- --in subtitles.srt --out transcript.json");
    console.error("  2. If you have a YouTube link:");
    console.error("     npm run analyze:youtube -- --url '<URL>' --out structure.json");
    console.error("  3. Create transcript.json manually:");
    console.error("     See examples/fixtures/transcript.sample.json");
    process.exit(1);
  }

  // Step 2: analyze-transcript
  console.log("\n" + "=".repeat(50));
  console.log("Step 2: Analyzing Transcript");
  console.log("=".repeat(50) + "\n");

  const analyzeResult = spawnSync("node", [
    "scripts/analyze-transcript.mjs",
    "--transcript", transcriptPath,
    "--out", outputPath,
  ], {
    stdio: "inherit",
    encoding: "utf-8",
  });

  if (analyzeResult.status !== 0) {
    console.error("\n❌ Analysis failed");
    process.exit(1);
  }

  // 一時ファイル削除（--keep-transcript でなければ）
  if (!args.keepTranscript && fs.existsSync(transcriptPath)) {
    fs.unlinkSync(transcriptPath);
  } else if (args.keepTranscript) {
    console.log(`\nTranscript saved: ${transcriptPath}`);
  }

  console.log("\n" + "=".repeat(50));
  console.log("✅ Analysis Complete");
  console.log("=".repeat(50));
  console.log(`\nOutput: ${outputPath}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Create narration skeleton:`);
  console.log(`     npm run narration:skeleton -- --structure ${args.out} --out narration.md`);
  console.log(`  2. Edit narration.md with your content`);
  console.log(`  3. Run render:`);
  console.log(`     npm run render:run -- --structure ${args.out} --narration narration.md`);
}

main();
