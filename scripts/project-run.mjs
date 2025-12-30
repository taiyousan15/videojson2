#!/usr/bin/env node
/**
 * project-run.mjs
 * プロジェクトディレクトリから動画を生成するワンコマンド
 *
 * 使い方:
 *   node scripts/project-run.mjs --project <projectDir>
 *
 * 実行ステップ:
 *   1. config.json を読み込み
 *   2. validate:strict で検証
 *   3. render:run で動画生成
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";

function parseArgs(args) {
  const result = {
    project: null,
    skipValidation: false,
    dryRun: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--project" && args[i + 1]) {
      result.project = args[++i];
    } else if (args[i] === "--skip-validation") {
      result.skipValidation = true;
    } else if (args[i] === "--dry-run") {
      result.dryRun = true;
    } else if (args[i] === "--verbose" || args[i] === "-v") {
      result.verbose = true;
    }
  }

  return result;
}

function showUsage() {
  console.log(`
Usage: node scripts/project-run.mjs --project <projectDir> [options]

Options:
  --project <path>     プロジェクトディレクトリ（必須）
  --skip-validation    検証をスキップ
  --dry-run            実行せずにコマンドを表示
  --verbose, -v        詳細出力

Examples:
  node scripts/project-run.mjs --project myproject
  node scripts/project-run.mjs --project myproject --skip-validation
`);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n[RUN] ${command} ${args.join(" ")}\n`);

    const proc = spawn(command, args, {
      stdio: options.quiet ? "pipe" : "inherit",
    });

    proc.on("close", (code) => {
      resolve({ code });
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.project) {
    showUsage();
    process.exit(1);
  }

  const projectDir = path.resolve(process.cwd(), options.project);

  // プロジェクトディレクトリの確認
  if (!fs.existsSync(projectDir)) {
    console.error(`[ERROR] プロジェクトディレクトリが見つかりません: ${projectDir}`);
    process.exit(1);
  }

  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║                 VideoJSON Project Run                          ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log();
  console.log(`Project: ${projectDir}`);

  // config.json を読み込み
  const configPath = path.join(projectDir, "config.json");
  let config = {
    paths: {
      structure: "structure.json",
      narration: "narration.md",
      outputs: "outputs",
    },
  };

  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      console.log(`Config:  ${configPath}`);
    } catch (e) {
      console.warn(`[WARN] config.json の読み込みに失敗: ${e.message}`);
    }
  }

  // パスを解決
  const structurePath = path.join(projectDir, config.paths?.structure || "structure.json");
  const narrationPath = path.join(projectDir, config.paths?.narration || "narration.md");
  const outputsDir = path.join(projectDir, config.paths?.outputs || "outputs");
  const outputPath = path.join(outputsDir, "output.mp4");

  console.log();
  console.log(`Structure: ${structurePath}`);
  console.log(`Narration: ${narrationPath}`);
  console.log(`Output:    ${outputPath}`);
  console.log();

  // ファイルの存在確認
  if (!fs.existsSync(structurePath)) {
    console.error(`[ERROR] structure.json が見つかりません: ${structurePath}`);
    process.exit(1);
  }

  if (!fs.existsSync(narrationPath)) {
    console.error(`[ERROR] narration.md が見つかりません: ${narrationPath}`);
    process.exit(1);
  }

  // 出力ディレクトリの作成
  if (!fs.existsSync(outputsDir)) {
    fs.mkdirSync(outputsDir, { recursive: true });
  }

  // dry-run モード
  if (options.dryRun) {
    console.log("━━━ Dry Run Mode ━━━");
    console.log();
    console.log("以下のコマンドが実行されます:");
    console.log();

    if (!options.skipValidation) {
      console.log(`1. npm run validate:strict -- --project ${options.project}`);
    }
    console.log(`2. npm run render:run -- --structure ${structurePath} --narration ${narrationPath} --out ${outputPath}`);
    console.log();
    process.exit(0);
  }

  // Step 1: 検証
  if (!options.skipValidation) {
    console.log("━━━ Step 1: Validation ━━━");

    const validateResult = await runCommand("node", [
      "scripts/validate-strict.mjs",
      "--project", projectDir,
    ]);

    if (validateResult.code !== 0) {
      console.error("\n[ERROR] 検証に失敗しました。エラーを修正してください。");
      process.exit(1);
    }
  } else {
    console.log("━━━ Step 1: Validation (Skipped) ━━━");
  }

  // Step 2: レンダリング
  console.log("\n━━━ Step 2: Rendering ━━━");

  const renderResult = await runCommand("node", [
    "scripts/render-run.mjs",
    "--structure", structurePath,
    "--narration", narrationPath,
    "--out", outputPath,
  ]);

  if (renderResult.code !== 0) {
    console.error("\n[ERROR] レンダリングに失敗しました。");
    process.exit(1);
  }

  // 完了
  console.log();
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║                      Success!                                  ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log();
  console.log(`動画が生成されました: ${outputPath}`);
  console.log();
}

main().catch((err) => {
  console.error("[ERROR]", err.message);
  process.exit(1);
});
