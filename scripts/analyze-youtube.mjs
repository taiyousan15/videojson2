#!/usr/bin/env node
/**
 * analyze-youtube.mjs
 * YouTube動画から structure.json を生成する（ワンコマンド）
 *
 * 内部処理:
 * 1. fetch-youtube-transcript で transcript.json を取得
 * 2. analyze-transcript で structure.json を生成
 *
 * 注意:
 * - YouTubeの仕様変更により動作しなくなる可能性があります
 * - CIでは実行せず、手動実行用です
 *
 * 使い方:
 *   node scripts/analyze-youtube.mjs --url <youtube_url> --out <structure.json>
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import os from "os";

function parseArgs(args) {
  const result = {
    url: null,
    out: null,
    language: null,
    keepTranscript: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url" && args[i + 1]) {
      result.url = args[++i];
    } else if (args[i] === "--out" && args[i + 1]) {
      result.out = args[++i];
    } else if (args[i] === "--language" && args[i + 1]) {
      result.language = args[++i];
    } else if (args[i] === "--keep-transcript") {
      result.keepTranscript = true;
    }
  }

  return result;
}

function showUsage() {
  console.log(`
Usage: node scripts/analyze-youtube.mjs --url <youtube_url> --out <structure.json>

Options:
  --url <url>         YouTube video URL (required)
  --out <path>        Output path for structure.json (required)
  --language <lang>   Preferred language code (optional, e.g., ja, en)
  --keep-transcript   Keep the intermediate transcript.json file

Example:
  node scripts/analyze-youtube.mjs --url "https://www.youtube.com/watch?v=VIDEO_ID" --out .tmp/structure.json
`);
}

/**
 * YouTube URLからビデオIDを抽出
 */
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.url || !args.out) {
    console.error("Error: --url and --out are required\n");
    showUsage();
    process.exit(1);
  }

  const videoId = extractVideoId(args.url);
  if (!videoId) {
    console.error(`Error: Invalid YouTube URL: ${args.url}`);
    process.exit(1);
  }

  const outPath = path.resolve(args.out);
  const outDir = path.dirname(outPath);

  // 一時ファイルパス
  const tmpDir = args.keepTranscript ? outDir : os.tmpdir();
  const transcriptPath = path.join(tmpDir, `transcript_${videoId}.json`);

  console.log("=== Analyze YouTube ===\n");
  console.log(`URL:      ${args.url}`);
  console.log(`Video ID: ${videoId}`);
  console.log(`Output:   ${outPath}`);
  if (args.language) {
    console.log(`Language: ${args.language}`);
  }

  // Step 1: fetch-youtube-transcript
  console.log("\n=== Step 1: Fetching Transcript ===\n");

  const fetchArgs = [
    "scripts/fetch-youtube-transcript.mjs",
    "--url", args.url,
    "--out", transcriptPath,
  ];
  if (args.language) {
    fetchArgs.push("--language", args.language);
  }

  const fetchResult = spawnSync("node", fetchArgs, {
    stdio: "inherit",
    encoding: "utf-8",
  });

  if (fetchResult.status !== 0) {
    console.error("\n❌ Failed to fetch transcript");
    process.exit(1);
  }

  // Step 2: analyze-transcript
  console.log("\n=== Step 2: Analyzing Transcript ===\n");

  const analyzeResult = spawnSync("node", [
    "scripts/analyze-transcript.mjs",
    "--transcript", transcriptPath,
    "--out", outPath,
  ], {
    stdio: "inherit",
    encoding: "utf-8",
  });

  if (analyzeResult.status !== 0) {
    console.error("\n❌ Failed to analyze transcript");
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
  console.log(`\nOutput: ${outPath}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Create narration.md based on the structure`);
  console.log(`  2. Run: npm run render:run -- --structure ${args.out} --narration narration.md`);
}

main();
