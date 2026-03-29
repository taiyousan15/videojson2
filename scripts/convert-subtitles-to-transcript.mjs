#!/usr/bin/env node
/**
 * convert-subtitles-to-transcript.mjs
 * SRT/VTT 字幕ファイルを transcript.json に変換する
 *
 * 使い方:
 *   node scripts/convert-subtitles-to-transcript.mjs --in <.srt|.vtt> --out <transcript.json> --language <ja|en>
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

function parseArgs(args) {
  const result = {
    in: null,
    out: null,
    language: "ja",
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--in" && args[i + 1]) {
      result.in = args[++i];
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
Usage: node scripts/convert-subtitles-to-transcript.mjs --in <.srt|.vtt> --out <transcript.json>

Options:
  --in <path>         Input subtitle file (.srt or .vtt) (required)
  --out <path>        Output path for transcript.json (required)
  --language <lang>   Language code (default: ja)

Example:
  node scripts/convert-subtitles-to-transcript.mjs --in subtitles.srt --out transcript.json --language ja
`);
}

/**
 * タイムスタンプをミリ秒に変換
 * SRT形式: 00:01:23,456 または 00:01:23.456
 * VTT形式: 00:01:23.456 または 01:23.456
 */
function parseTimestamp(timestamp) {
  // カンマをドットに統一
  const normalized = timestamp.trim().replace(",", ".");

  // HH:MM:SS.mmm または MM:SS.mmm
  const parts = normalized.split(":");

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (parts.length === 3) {
    hours = parseInt(parts[0], 10);
    minutes = parseInt(parts[1], 10);
    seconds = parseFloat(parts[2]);
  } else if (parts.length === 2) {
    minutes = parseInt(parts[0], 10);
    seconds = parseFloat(parts[1]);
  }

  const totalMs = Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
  return totalMs;
}

/**
 * SRT ファイルをパース
 */
function parseSRT(content) {
  const items = [];
  const blocks = content.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;

    // 1行目: インデックス番号
    // 2行目: タイムスタンプ（例: 00:00:01,000 --> 00:00:04,000）
    // 3行目以降: テキスト

    const timeLine = lines[1];
    const timeMatch = timeLine.match(/(.+?)\s*-->\s*(.+)/);
    if (!timeMatch) continue;

    const startMs = parseTimestamp(timeMatch[1]);
    const endMs = parseTimestamp(timeMatch[2]);
    const text = lines.slice(2).join(" ").trim();

    // HTML タグを除去
    const cleanText = text.replace(/<[^>]+>/g, "");

    if (cleanText) {
      items.push({
        start_ms: startMs,
        end_ms: endMs,
        text: cleanText,
      });
    }
  }

  return items;
}

/**
 * VTT ファイルをパース
 */
function parseVTT(content) {
  const items = [];

  // WEBVTT ヘッダーとメタデータを除去
  let body = content;
  if (body.startsWith("WEBVTT")) {
    // ヘッダー行を除去
    const headerEnd = body.indexOf("\n\n");
    if (headerEnd !== -1) {
      body = body.substring(headerEnd + 2);
    }
  }

  const blocks = body.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;

    // VTT は cue identifier が任意で最初に来る場合がある
    let timeLineIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("-->")) {
        timeLineIndex = i;
        break;
      }
    }

    const timeLine = lines[timeLineIndex];
    const timeMatch = timeLine.match(/(.+?)\s*-->\s*([^\s]+)/);
    if (!timeMatch) continue;

    const startMs = parseTimestamp(timeMatch[1]);
    const endMs = parseTimestamp(timeMatch[2]);
    const text = lines.slice(timeLineIndex + 1).join(" ").trim();

    // VTT タグを除去（<c>, </c>, <v Name>, 等）
    const cleanText = text
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();

    if (cleanText) {
      items.push({
        start_ms: startMs,
        end_ms: endMs,
        text: cleanText,
      });
    }
  }

  return items;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.in || !args.out) {
    console.error("Error: --in and --out are required\n");
    showUsage();
    process.exit(1);
  }

  const inputPath = path.resolve(args.in);
  const outputPath = path.resolve(args.out);

  console.log("=== Convert Subtitles to Transcript ===\n");
  console.log(`Input:    ${inputPath}`);
  console.log(`Output:   ${outputPath}`);
  console.log(`Language: ${args.language}`);

  // ファイル存在チェック
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  // 拡張子判定
  const ext = path.extname(inputPath).toLowerCase();
  if (![".srt", ".vtt"].includes(ext)) {
    console.error(`Error: Unsupported format: ${ext}`);
    console.error("Supported formats: .srt, .vtt");
    process.exit(1);
  }

  // ファイル読み込み
  const content = fs.readFileSync(inputPath, "utf-8");

  // パース
  console.log("\n=== Parsing ===\n");
  let items;
  if (ext === ".srt") {
    console.log("Format: SRT");
    items = parseSRT(content);
  } else {
    console.log("Format: VTT (WebVTT)");
    items = parseVTT(content);
  }

  if (items.length === 0) {
    console.error("Error: No subtitle items found");
    process.exit(1);
  }

  console.log(`Parsed ${items.length} subtitle items`);

  // 総時間を計算
  const totalDurationMs = items.length > 0 ? items[items.length - 1].end_ms : 0;

  // transcript.json を構築
  const transcript = {
    schema_version: "1.0.0",
    source: {
      type: "other",
      duration_ms: totalDurationMs,
    },
    language: args.language,
    generated_at: new Date().toISOString(),
    items,
  };

  // 出力ディレクトリを作成
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 保存
  fs.writeFileSync(outputPath, JSON.stringify(transcript, null, 2));
  console.log(`\nSaved: ${outputPath}`);

  // スキーマ検証
  console.log("\n=== Schema Validation ===\n");
  const schemaPath = path.resolve("schemas/transcript.schema.json");
  if (validateSchema(schemaPath, outputPath)) {
    console.log("✅ Schema validation passed");
  } else {
    console.error("❌ Schema validation failed");
    process.exit(1);
  }

  console.log("\n=== Success ===");
  console.log(`\nNext steps:`);
  console.log(`  1. Generate structure: npm run analyze:transcript -- --transcript ${args.out} --out structure.json`);
  console.log(`  2. Edit narration.md`);
  console.log(`  3. Run render: npm run render:run -- --structure structure.json --narration narration.md`);
}

main();
