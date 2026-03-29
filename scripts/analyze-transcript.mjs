#!/usr/bin/env node
/**
 * analyze-transcript.mjs
 * transcript.json から structure.json を生成する
 *
 * 生成ルール:
 * - 時間でチャンク分割（15〜30秒ごと）
 * - summary は抽象的な要約を作成（固有の言い回し再現を避ける）
 * - type は intro/talk/outro を最小推定
 *
 * 使い方:
 *   node scripts/analyze-transcript.mjs --transcript <path> --out <structure.json>
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const MIN_SEGMENT_MS = 15000; // 15秒
const MAX_SEGMENT_MS = 30000; // 30秒
const PAUSE_THRESHOLD_MS = 1500; // 1.5秒以上の間隔を無音区間とみなす
const STRONG_BREAK_THRESHOLD_MS = 3000; // 3秒以上の間隔は強制分割

function parseArgs(args) {
  const result = {
    transcript: null,
    out: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--transcript" && args[i + 1]) {
      result.transcript = args[++i];
    } else if (args[i] === "--out" && args[i + 1]) {
      result.out = args[++i];
    }
  }

  return result;
}

function showUsage() {
  console.log(`
Usage: node scripts/analyze-transcript.mjs --transcript <path> --out <structure.json>

Options:
  --transcript <path>  Path to transcript.json (required)
  --out <path>         Output path for structure.json (required)

Example:
  node scripts/analyze-transcript.mjs --transcript examples/fixtures/transcript.sample.json --out .tmp/structure.json
`);
}

/**
 * 無音区間（ポーズ）を検出してブレークポイントを見つける
 */
function detectPauses(items) {
  const pausePoints = [];

  for (let i = 1; i < items.length; i++) {
    const gap = items[i].start_ms - items[i - 1].end_ms;

    if (gap >= STRONG_BREAK_THRESHOLD_MS) {
      // 3秒以上のギャップは強制分割ポイント
      pausePoints.push({ index: i, gap, type: "strong" });
    } else if (gap >= PAUSE_THRESHOLD_MS) {
      // 1.5秒以上のギャップは候補分割ポイント
      pausePoints.push({ index: i, gap, type: "pause" });
    }
  }

  return pausePoints;
}

/**
 * 話者変更を検出
 */
function detectSpeakerChanges(items) {
  const changePoints = [];

  for (let i = 1; i < items.length; i++) {
    if (items[i].speaker && items[i - 1].speaker &&
        items[i].speaker !== items[i - 1].speaker) {
      changePoints.push({ index: i, from: items[i - 1].speaker, to: items[i].speaker });
    }
  }

  return changePoints;
}

/**
 * transcript items を時間・無音・話者変更でチャンク分割
 */
function chunkByTime(items, minMs, maxMs) {
  const segments = [];
  let currentSegment = {
    items: [],
    start_ms: 0,
    end_ms: 0,
    speaker: null,
  };

  // 無音区間と話者変更を検出
  const pauses = detectPauses(items);
  const speakerChanges = detectSpeakerChanges(items);

  // 強制分割ポイントをセットにする
  const strongBreaks = new Set(
    pauses.filter(p => p.type === "strong").map(p => p.index)
  );
  const pauseBreaks = new Set(
    pauses.filter(p => p.type === "pause").map(p => p.index)
  );
  const speakerBreaks = new Set(speakerChanges.map(c => c.index));

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (currentSegment.items.length === 0) {
      currentSegment.start_ms = item.start_ms;
      currentSegment.speaker = item.speaker;
    }

    currentSegment.items.push(item);
    currentSegment.end_ms = item.end_ms;

    const duration = currentSegment.end_ms - currentSegment.start_ms;
    const nextIndex = i + 1;

    // 強制分割ポイント（3秒以上の無音）
    if (strongBreaks.has(nextIndex) && currentSegment.items.length > 0) {
      segments.push({ ...currentSegment });
      currentSegment = { items: [], start_ms: 0, end_ms: 0, speaker: null };
      continue;
    }

    // セグメントがmaxMsを超えたら分割
    if (duration >= maxMs) {
      segments.push({ ...currentSegment });
      currentSegment = { items: [], start_ms: 0, end_ms: 0, speaker: null };
      continue;
    }

    // minMs以上で、かつ分割に適したポイント
    if (duration >= minMs) {
      // 話者変更ポイント
      if (speakerBreaks.has(nextIndex)) {
        segments.push({ ...currentSegment });
        currentSegment = { items: [], start_ms: 0, end_ms: 0, speaker: null };
        continue;
      }

      // 無音ポイント
      if (pauseBreaks.has(nextIndex)) {
        segments.push({ ...currentSegment });
        currentSegment = { items: [], start_ms: 0, end_ms: 0, speaker: null };
        continue;
      }

      // 文末で区切る
      if (item.text.match(/[。！？\.\!\?]$/)) {
        segments.push({ ...currentSegment });
        currentSegment = { items: [], start_ms: 0, end_ms: 0, speaker: null };
        continue;
      }
    }
  }

  // 残りがあれば追加
  if (currentSegment.items.length > 0) {
    segments.push(currentSegment);
  }

  return segments;
}

/**
 * テキストから抽象的な要約を生成
 * 注：固有の言い回しを避け、内容を一般化する
 */
function generateAbstractSummary(texts) {
  const combined = texts.join(" ");
  const words = combined.length;

  // キーワード抽出（簡易的）
  const keywords = extractKeywords(combined);

  if (keywords.length === 0) {
    return "このセクションでは特定のトピックについて説明しています。";
  }

  // 抽象的な要約を生成（元の文言を使わない）
  if (keywords.length === 1) {
    return `${keywords[0]}についての説明を行っています。`;
  }

  return `${keywords.slice(0, 2).join("と")}に関する内容を扱っています。`;
}

/**
 * 簡易キーワード抽出
 */
function extractKeywords(text) {
  // 一般的な単語を除外
  const stopWords = [
    "これ", "それ", "あれ", "この", "その", "あの",
    "私", "僕", "俺", "あなた", "皆さん", "皆",
    "今日", "今回", "次", "最初", "最後",
    "こと", "もの", "ところ", "とき", "ため",
    "する", "なる", "ある", "いる", "できる",
    "思う", "考える", "知る", "見る", "聞く",
    "良い", "悪い", "大きい", "小さい",
    "the", "a", "an", "is", "are", "was", "were",
    "this", "that", "these", "those", "it", "we", "you", "they",
    "to", "from", "in", "on", "at", "for", "with", "about",
    "and", "or", "but", "so", "if", "then",
  ];

  // 日本語の名詞を抽出（簡易的なパターンマッチ）
  const jaPatterns = text.match(/[一-龯ぁ-んァ-ヶー]{2,}/g) || [];
  const enPatterns = text.match(/[A-Za-z]{3,}/g) || [];

  const candidates = [...jaPatterns, ...enPatterns]
    .filter(w => !stopWords.includes(w.toLowerCase()))
    .filter(w => w.length >= 2);

  // 出現頻度でソート
  const freq = {};
  for (const word of candidates) {
    freq[word] = (freq[word] || 0) + 1;
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

/**
 * セグメントタイプを推定
 */
function inferSegmentType(index, total, texts) {
  const combined = texts.join(" ").toLowerCase();

  // 最初のセグメント
  if (index === 0) {
    if (combined.match(/こんにちは|ようこそ|welcome|hello|introduction/)) {
      return "intro";
    }
    return "intro";
  }

  // 最後のセグメント
  if (index === total - 1) {
    if (combined.match(/ありがとう|さようなら|thank|goodbye|bye|conclusion/)) {
      return "outro";
    }
    return "outro";
  }

  // それ以外は talk
  return "talk";
}

/**
 * structure.json を生成
 */
function generateStructure(transcript) {
  const items = transcript.items || [];

  if (items.length === 0) {
    throw new Error("transcript.items is empty");
  }

  // 時間でチャンク分割
  const chunks = chunkByTime(items, MIN_SEGMENT_MS, MAX_SEGMENT_MS);

  // セグメントを生成
  const segments = chunks.map((chunk, index) => {
    const texts = chunk.items.map(item => item.text);
    const type = inferSegmentType(index, chunks.length, texts);
    const summary = generateAbstractSummary(texts);

    const segment = {
      id: `s${String(index + 1).padStart(2, "0")}`,
      type,
      start_ms: chunk.start_ms,
      end_ms: chunk.end_ms,
      summary,
    };

    // 話者情報があれば追加
    if (chunk.speaker) {
      segment.speaker_id = chunk.speaker;
    }

    return segment;
  });

  // structure.json を構築
  const totalDuration = transcript.source?.duration_ms || segments[segments.length - 1]?.end_ms || 0;

  const structure = {
    schema_version: "1.0.0",
    generated_at: new Date().toISOString(),
    video: {
      source_type: "transcript",
      source: transcript.source?.url || transcript.source?.video_id || "transcript",
      title: transcript.source?.title || "Untitled",
      duration_ms: totalDuration,
      language: transcript.language || "ja",
    },
    segments,
  };

  return structure;
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

  if (!args.transcript || !args.out) {
    console.error("Error: --transcript and --out are required\n");
    showUsage();
    process.exit(1);
  }

  const transcriptPath = path.resolve(args.transcript);
  const outPath = path.resolve(args.out);

  console.log("=== Analyze Transcript ===\n");
  console.log(`Input:  ${transcriptPath}`);
  console.log(`Output: ${outPath}`);

  // transcript を読み込み
  if (!fs.existsSync(transcriptPath)) {
    console.error(`Error: transcript file not found: ${transcriptPath}`);
    process.exit(1);
  }

  let transcript;
  try {
    transcript = JSON.parse(fs.readFileSync(transcriptPath, "utf-8"));
  } catch (error) {
    console.error(`Error parsing transcript: ${error.message}`);
    process.exit(1);
  }

  // structure を生成
  console.log("\n=== Generating Structure ===\n");
  const structure = generateStructure(transcript);

  console.log(`Generated ${structure.segments.length} segments:`);
  for (const seg of structure.segments) {
    const duration = seg.end_ms - seg.start_ms;
    console.log(`  ${seg.id} [${seg.type}] ${duration}ms - ${seg.summary.substring(0, 40)}...`);
  }

  // 出力ディレクトリを作成
  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // structure.json を保存
  fs.writeFileSync(outPath, JSON.stringify(structure, null, 2));
  console.log(`\nSaved: ${outPath}`);

  // スキーマ検証
  console.log("\n=== Schema Validation ===\n");
  const schemaPath = path.resolve("schemas/structure.schema.json");
  if (validateSchema(schemaPath, outPath)) {
    console.log("✅ Schema validation passed");
  } else {
    console.error("❌ Schema validation failed");
    process.exit(1);
  }

  console.log("\n=== Success ===");
}

main();
