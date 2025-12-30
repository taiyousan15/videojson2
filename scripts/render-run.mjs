#!/usr/bin/env node
/**
 * render-run.mjs
 * structure.json + narration.md から mp4 を1コマンドで生成する
 *
 * 使い方:
 *   node scripts/render-run.mjs --structure structure.json --narration narration.md --out output.mp4
 *
 * オプション:
 *   --structure <path>    structure.json のパス（必須）
 *   --narration <path>    narration.md のパス（必須）
 *   --out <path>          出力 mp4 ファイルパス（必須）
 *   --tts-provider <name> TTS プロバイダー（dummy / elevenlabs）
 *   --workdir <path>      作業ディレクトリ（デフォルト: .tmp）
 *   --keep-temp           一時ファイルを削除しない
 */

import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(args) {
  const result = {
    structure: null,
    narration: null,
    out: null,
    ttsProvider: null,
    workdir: null,
    keepTemp: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--structure" && args[i + 1]) {
      result.structure = args[++i];
    } else if (args[i] === "--narration" && args[i + 1]) {
      result.narration = args[++i];
    } else if (args[i] === "--out" && args[i + 1]) {
      result.out = args[++i];
    } else if (args[i] === "--tts-provider" && args[i + 1]) {
      result.ttsProvider = args[++i];
    } else if (args[i] === "--workdir" && args[i + 1]) {
      result.workdir = args[++i];
    } else if (args[i] === "--keep-temp") {
      result.keepTemp = true;
    }
  }

  return result;
}

function showUsage() {
  console.log(`
Usage: node scripts/render-run.mjs --structure <path> --narration <path> --out <path>

Options:
  --structure <path>    Path to structure.json (required)
  --narration <path>    Path to narration.md (required)
  --out <path>          Output mp4 file path (required)
  --tts-provider <name> TTS provider (dummy / elevenlabs)
  --workdir <path>      Working directory (default: .tmp)
  --keep-temp           Keep temporary files

Environment Variables:
  VIDEOJSON_TTS_PROVIDER  Default TTS provider
  VIDEOJSON_WORKDIR       Default working directory

Example:
  npm run render:run -- --structure examples/smoke/structure.json \\
    --narration examples/smoke/narration.md --out output.mp4
`);
}

function runCommand(command, description) {
  console.log(`\n[Step] ${description}`);
  console.log(`[Cmd] ${command}\n`);

  try {
    execSync(command, { stdio: "inherit" });
    return true;
  } catch (error) {
    console.error(`[Error] ${description} failed`);
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // 必須引数チェック
  if (!args.structure || !args.narration || !args.out) {
    console.error("Error: --structure, --narration, and --out are required\n");
    showUsage();
    process.exit(1);
  }

  const structurePath = path.resolve(args.structure);
  const narrationPath = path.resolve(args.narration);
  const outPath = path.resolve(args.out);

  // ファイル存在チェック
  if (!fs.existsSync(structurePath)) {
    console.error(`Error: structure file not found: ${structurePath}`);
    process.exit(1);
  }
  if (!fs.existsSync(narrationPath)) {
    console.error(`Error: narration file not found: ${narrationPath}`);
    process.exit(1);
  }

  // 作業ディレクトリ
  const projectDir = path.dirname(structurePath);
  const workdir = args.workdir
    ? path.resolve(args.workdir)
    : path.resolve(projectDir, process.env.VIDEOJSON_WORKDIR || ".tmp");

  // TTS プロバイダー
  const ttsProvider = args.ttsProvider || process.env.VIDEOJSON_TTS_PROVIDER || "dummy";

  // 中間ファイルパス
  const renderPlanPath = path.join(workdir, "render.json");
  const materializedPath = path.join(workdir, "render.materialized.json");

  console.log("=== VideoJSON Render Run ===\n");
  console.log(`Structure:    ${structurePath}`);
  console.log(`Narration:    ${narrationPath}`);
  console.log(`Output:       ${outPath}`);
  console.log(`Work dir:     ${workdir}`);
  console.log(`TTS provider: ${ttsProvider}`);

  // 作業ディレクトリ作成
  if (!fs.existsSync(workdir)) {
    fs.mkdirSync(workdir, { recursive: true });
  }

  const scriptsDir = __dirname;

  // Step 1: validate-narration
  if (!runCommand(
    `node "${path.join(scriptsDir, "validate-narration.mjs")}" --structure "${structurePath}" --narration "${narrationPath}"`,
    "Validating narration consistency"
  )) {
    process.exit(1);
  }

  // Step 2: generate-render
  if (!runCommand(
    `node "${path.join(scriptsDir, "generate-render.mjs")}" --structure "${structurePath}" --narration "${narrationPath}" --out "${renderPlanPath}"`,
    "Generating render plan"
  )) {
    process.exit(1);
  }

  // Step 3: materialize-render
  const materializeArgs = [
    `--render "${renderPlanPath}"`,
    `--output "${materializedPath}"`,
    `--project "${projectDir}"`,
    `--workdir "${workdir}"`,
    `--tts-provider ${ttsProvider}`,
  ].join(" ");

  if (!runCommand(
    `node "${path.join(scriptsDir, "materialize-render.mjs")}" ${materializeArgs}`,
    "Materializing render plan"
  )) {
    process.exit(1);
  }

  // Step 4: render-ffmpeg
  const ffmpegArgs = [
    `--render "${materializedPath}"`,
    `--output "${outPath}"`,
    args.keepTemp ? "--keep-temp" : "",
  ].filter(Boolean).join(" ");

  if (!runCommand(
    `node "${path.join(scriptsDir, "render-ffmpeg.mjs")}" ${ffmpegArgs}`,
    "Rendering with FFmpeg"
  )) {
    process.exit(1);
  }

  // 結果確認
  if (!fs.existsSync(outPath)) {
    console.error(`\n[Error] Output file not created: ${outPath}`);
    process.exit(1);
  }

  const stats = fs.statSync(outPath);
  if (stats.size === 0) {
    console.error(`\n[Error] Output file is empty: ${outPath}`);
    process.exit(1);
  }

  console.log("\n=== Render Complete ===");
  console.log(`Output: ${outPath}`);
  console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  // 一時ファイル削除
  if (!args.keepTemp) {
    console.log(`\nCleaning up work directory: ${workdir}`);
    // render.json と materialized は削除、cache は残す
    const filesToDelete = [renderPlanPath, materializedPath];
    for (const f of filesToDelete) {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    }
  }
}

main();
