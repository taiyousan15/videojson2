#!/usr/bin/env node
/**
 * transcribe-whisper.mjs
 * ローカル動画から Whisper を使って文字起こしし、transcript.json を生成する
 *
 * 注意:
 * - Whisper CLI（whisper または whisper.cpp）が必要です
 * - 未インストールの場合はインストール手順を表示して終了します
 *
 * 使い方:
 *   node scripts/transcribe-whisper.mjs --video <path> --out <transcript.json> --language <ja|en>
 */

import fs from "fs";
import path from "path";
import { spawnSync, execSync } from "child_process";
import os from "os";

function parseArgs(args) {
  const result = {
    video: null,
    out: null,
    language: "ja",
    model: "base",
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
    }
  }

  return result;
}

function showUsage() {
  console.log(`
Usage: node scripts/transcribe-whisper.mjs --video <path> --out <transcript.json>

Options:
  --video <path>      Input video/audio file (required)
  --out <path>        Output path for transcript.json (required)
  --language <lang>   Language code (default: ja)
  --model <model>     Whisper model (default: base)

Example:
  node scripts/transcribe-whisper.mjs --video video.mp4 --out transcript.json --language ja
`);
}

/**
 * Whisper がインストールされているか確認
 */
function checkWhisperInstalled() {
  // OpenAI Whisper CLI
  try {
    execSync("whisper --help", { stdio: "pipe" });
    return { installed: true, type: "openai-whisper" };
  } catch {
    // 続行
  }

  // whisper.cpp
  try {
    execSync("whisper-cpp --help", { stdio: "pipe" });
    return { installed: true, type: "whisper-cpp" };
  } catch {
    // 続行
  }

  // macOS whisper-cpp via brew
  try {
    execSync("which whisper", { stdio: "pipe" });
    const result = execSync("whisper --help 2>&1 || true", { encoding: "utf-8" });
    if (result.includes("whisper")) {
      return { installed: true, type: "openai-whisper" };
    }
  } catch {
    // 続行
  }

  return { installed: false, type: null };
}

/**
 * インストール手順を表示
 */
function showInstallInstructions() {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ Whisper がインストールされていません

Whisper は音声/動画から文字起こしを行うツールです。
以下のいずれかの方法でインストールしてください。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 方法1: OpenAI Whisper（Python）- 推奨

  # Python と pip が必要です
  pip install -U openai-whisper

  # または pipx を使用（環境を汚さない）
  pipx install openai-whisper

  # ffmpeg も必要です
  # macOS:
  brew install ffmpeg
  # Ubuntu:
  sudo apt-get install ffmpeg

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 方法2: whisper.cpp（高速、C++実装）

  # macOS:
  brew install whisper-cpp

  # Linux: ソースからビルド
  git clone https://github.com/ggerganov/whisper.cpp.git
  cd whisper.cpp
  make
  # モデルをダウンロード
  bash ./models/download-ggml-model.sh base

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 方法3: 代替手段（Whisper なしで進める）

  1. SRT/VTT 字幕がある場合:
     npm run transcript:convert -- --in subtitles.srt --out transcript.json

  2. YouTube 字幕を取得:
     npm run analyze:youtube -- --url "<URL>" --out structure.json

  3. 手動で transcript.json を作成:
     examples/fixtures/transcript.sample.json を参考に

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

/**
 * Whisper JSON 出力を transcript.schema.json 形式に変換
 */
function convertWhisperOutput(whisperJson, language) {
  const items = [];

  // OpenAI Whisper の出力形式
  if (whisperJson.segments) {
    for (const seg of whisperJson.segments) {
      items.push({
        start_ms: Math.round(seg.start * 1000),
        end_ms: Math.round(seg.end * 1000),
        text: seg.text.trim(),
      });
    }
  }

  // 総時間を計算
  const totalDurationMs = items.length > 0 ? items[items.length - 1].end_ms : 0;

  return {
    schema_version: "1.0.0",
    source: {
      type: "whisper",
      duration_ms: totalDurationMs,
    },
    language,
    generated_at: new Date().toISOString(),
    items,
  };
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

  if (!args.video || !args.out) {
    console.error("Error: --video and --out are required\n");
    showUsage();
    process.exit(1);
  }

  console.log("=== Transcribe with Whisper ===\n");

  // Whisper インストールチェック
  const whisperCheck = checkWhisperInstalled();
  if (!whisperCheck.installed) {
    showInstallInstructions();
    process.exit(1);
  }

  console.log(`Whisper detected: ${whisperCheck.type}`);

  const videoPath = path.resolve(args.video);
  const outputPath = path.resolve(args.out);

  console.log(`\nInput:    ${videoPath}`);
  console.log(`Output:   ${outputPath}`);
  console.log(`Language: ${args.language}`);
  console.log(`Model:    ${args.model}`);

  // ファイル存在チェック
  if (!fs.existsSync(videoPath)) {
    console.error(`Error: Video file not found: ${videoPath}`);
    process.exit(1);
  }

  // 一時ディレクトリ
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "whisper-"));
  const baseName = path.basename(videoPath, path.extname(videoPath));

  console.log("\n=== Running Whisper ===\n");

  try {
    // Whisper を実行
    const whisperArgs = [
      videoPath,
      "--language", args.language,
      "--model", args.model,
      "--output_format", "json",
      "--output_dir", tmpDir,
    ];

    console.log(`Command: whisper ${whisperArgs.join(" ")}`);

    const result = spawnSync("whisper", whisperArgs, {
      stdio: "inherit",
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      console.error("\n❌ Whisper failed");
      process.exit(1);
    }

    // Whisper 出力ファイルを探す
    const jsonFile = path.join(tmpDir, `${baseName}.json`);
    if (!fs.existsSync(jsonFile)) {
      console.error(`Error: Whisper output not found: ${jsonFile}`);
      process.exit(1);
    }

    // Whisper 出力を読み込み
    const whisperOutput = JSON.parse(fs.readFileSync(jsonFile, "utf-8"));

    // transcript.json 形式に変換
    console.log("\n=== Converting to transcript format ===\n");
    const transcript = convertWhisperOutput(whisperOutput, args.language);

    console.log(`Converted ${transcript.items.length} segments`);

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

  } finally {
    // 一時ファイル削除
    try {
      fs.rmSync(tmpDir, { recursive: true });
    } catch {
      // 無視
    }
  }
}

main();
