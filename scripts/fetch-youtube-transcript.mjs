#!/usr/bin/env node
/**
 * fetch-youtube-transcript.mjs
 * YouTube動画から字幕を取得して transcript.json を生成する
 *
 * 注意：
 * - YouTubeの仕様変更により動作しなくなる可能性があります
 * - 字幕が無効な動画では取得できません
 * - CIでは実行せず、手動実行用です
 *
 * 使い方:
 *   node scripts/fetch-youtube-transcript.mjs --url <youtube_url> --out <transcript.json>
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

// youtube-transcript パッケージをダイナミックインポート
let YoutubeTranscript;
try {
  const module = await import("youtube-transcript");
  YoutubeTranscript = module.YoutubeTranscript;
} catch (error) {
  console.error("Error: youtube-transcript package not found.");
  console.error("Run: npm install youtube-transcript");
  process.exit(1);
}

function parseArgs(args) {
  const result = {
    url: null,
    out: null,
    language: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url" && args[i + 1]) {
      result.url = args[++i];
    } else if (args[i] === "--out" && args[i + 1]) {
      result.out = args[++i];
    } else if (args[i] === "--language" && args[i + 1]) {
      result.language = args[++i];
    }
  }

  return result;
}

function showUsage() {
  console.log(`
Usage: node scripts/fetch-youtube-transcript.mjs --url <youtube_url> --out <transcript.json>

Options:
  --url <url>        YouTube video URL (required)
  --out <path>       Output path for transcript.json (required)
  --language <lang>  Preferred language code (optional, e.g., ja, en)

Example:
  node scripts/fetch-youtube-transcript.mjs --url "https://www.youtube.com/watch?v=VIDEO_ID" --out .tmp/transcript.json
`);
}

/**
 * YouTube URLからビデオIDを抽出
 */
function extractVideoId(url) {
  // 様々なYouTube URLフォーマットに対応
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

/**
 * スキーマ検証
 */
function validateSchema(schemaPath, jsonPath) {
  const result = spawnSync("node", ["scripts/validate-json.mjs", schemaPath, jsonPath], {
    stdio: "pipe",
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    console.error("Schema validation failed:");
    console.error(result.stdout);
    console.error(result.stderr);
    return false;
  }

  return true;
}

/**
 * 代替手段を表示
 */
function showAlternatives(reason) {
  console.log(`
❌ 字幕の取得に失敗しました
   理由: ${reason}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 代替手段:

1. ローカル動画の文字起こし (推奨)
   - 動画をダウンロードして Whisper で文字起こし
   - コマンド例:
     whisper video.mp4 --language ja --output_format json
   - 出力を transcript.schema.json 形式に変換して使用

2. 手動で字幕ファイルを取得
   - youtube-dl/yt-dlp で字幕ファイルをダウンロード
   - コマンド例:
     yt-dlp --write-auto-sub --sub-lang ja --skip-download <URL>
   - 出力を transcript.schema.json 形式に変換

3. 手動で transcript.json を作成
   - examples/fixtures/transcript.sample.json を参考に作成
   - 最低限 items[{start_ms, end_ms, text}] があればOK

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
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

  console.log("=== Fetch YouTube Transcript ===\n");
  console.log(`URL:      ${args.url}`);
  console.log(`Video ID: ${videoId}`);
  console.log(`Output:   ${outPath}`);
  if (args.language) {
    console.log(`Language: ${args.language}`);
  }

  // 字幕を取得
  console.log("\n=== Fetching Transcript ===\n");
  let transcriptItems;
  try {
    const options = args.language ? { lang: args.language } : {};
    transcriptItems = await YoutubeTranscript.fetchTranscript(videoId, options);
  } catch (error) {
    const errorMsg = error.message || String(error);

    if (errorMsg.includes("disabled")) {
      showAlternatives("この動画では字幕が無効化されています");
    } else if (errorMsg.includes("not available")) {
      showAlternatives("この動画には字幕がありません");
    } else if (errorMsg.includes("private") || errorMsg.includes("unavailable")) {
      showAlternatives("この動画は非公開または削除されています");
    } else {
      showAlternatives(`API エラー: ${errorMsg}`);
    }

    process.exit(1);
  }

  if (!transcriptItems || transcriptItems.length === 0) {
    showAlternatives("字幕データが空でした");
    process.exit(1);
  }

  console.log(`Fetched ${transcriptItems.length} transcript items`);

  // transcript.json 形式に変換
  const items = transcriptItems.map(item => ({
    start_ms: Math.round(item.offset * 1000),
    end_ms: Math.round((item.offset + item.duration) * 1000),
    text: item.text,
  }));

  // duration を計算
  const totalDurationMs = items.length > 0
    ? items[items.length - 1].end_ms
    : 0;

  const transcript = {
    schema_version: "1.0.0",
    source: {
      type: "youtube",
      url: args.url,
      video_id: videoId,
      duration_ms: totalDurationMs,
    },
    language: args.language || "auto",
    generated_at: new Date().toISOString(),
    items,
  };

  // 出力ディレクトリを作成
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // transcript.json を保存
  fs.writeFileSync(outPath, JSON.stringify(transcript, null, 2));
  console.log(`\nSaved: ${outPath}`);

  // スキーマ検証
  console.log("\n=== Schema Validation ===\n");
  const schemaPath = path.resolve("schemas/transcript.schema.json");
  if (validateSchema(schemaPath, outPath)) {
    console.log("✅ Schema validation passed");
  } else {
    console.error("❌ Schema validation failed");
    process.exit(1);
  }

  console.log("\n=== Success ===");
  console.log(`\nNext steps:`);
  console.log(`  1. Generate structure: node scripts/analyze-transcript.mjs --transcript ${args.out} --out structure.json`);
  console.log(`  2. Edit narration.md`);
  console.log(`  3. Run render: npm run render:run -- --structure structure.json --narration narration.md`);
}

main();
