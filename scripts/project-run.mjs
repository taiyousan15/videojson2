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
import { spawn, execSync } from "child_process";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function parseArgs(args) {
  const result = {
    project: null,
    preset: null,
    skipValidation: false,
    skipManifest: false,
    clean: false,         // 成功後にworkディレクトリを削除
    keepWork: false,      // workディレクトリを保持
    cleanBefore: false,   // 実行前にworkディレクトリを削除
    dryRun: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--project" && args[i + 1]) {
      result.project = args[++i];
    } else if (args[i] === "--preset" && args[i + 1]) {
      result.preset = args[++i];
    } else if (args[i] === "--skip-validation") {
      result.skipValidation = true;
    } else if (args[i] === "--skip-manifest") {
      result.skipManifest = true;
    } else if (args[i] === "--clean") {
      result.clean = true;
    } else if (args[i] === "--keep-work") {
      result.keepWork = true;
    } else if (args[i] === "--clean-before") {
      result.cleanBefore = true;
    } else if (args[i] === "--dry-run") {
      result.dryRun = true;
    } else if (args[i] === "--verbose" || args[i] === "-v") {
      result.verbose = true;
    }
  }

  return result;
}

// ディレクトリを再帰的に削除
function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
    return true;
  }
  return false;
}

// package.jsonからバージョン取得
function getVersion() {
  try {
    const pkgPath = path.join(ROOT_DIR, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

// Gitコミットハッシュを取得
function getGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: ROOT_DIR }).trim();
  } catch {
    return null;
  }
}

// 動画の長さを取得
function getVideoDuration(videoPath) {
  try {
    const result = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`,
      { encoding: 'utf8' }
    ).trim();
    return parseFloat(result) || null;
  } catch {
    return null;
  }
}

// manifest.json を生成
function generateManifest(options) {
  const {
    projectDir,
    structurePath,
    narrationPath,
    outputPath,
    preset,
    startTime,
    endTime,
    success,
    error,
  } = options;

  const manifest = {
    schema_version: '1.0',
    videojson_version: getVersion(),
    git_commit: getGitCommit(),
    timestamp: new Date().toISOString(),
    duration_seconds: Math.round((endTime - startTime) / 1000),
    success,
    inputs: {
      project_dir: projectDir,
      structure: path.relative(projectDir, structurePath),
      narration: path.relative(projectDir, narrationPath),
      preset: preset || 'default',
    },
    output: success ? {
      path: path.relative(projectDir, outputPath),
      exists: fs.existsSync(outputPath),
      size_bytes: fs.existsSync(outputPath) ? fs.statSync(outputPath).size : null,
      duration_seconds: fs.existsSync(outputPath) ? getVideoDuration(outputPath) : null,
    } : null,
    error: error || null,
    environment: {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  };

  return manifest;
}

function showUsage() {
  console.log(`
Usage: node scripts/project-run.mjs --project <projectDir> [options]

Options:
  --project <path>     プロジェクトディレクトリ（必須）
  --preset <name>      使用するプリセット（default, vertical-short, youtube-16x9）
  --skip-validation    検証をスキップ
  --skip-manifest      manifest.json の生成をスキップ
  --clean              成功後にworkディレクトリを削除
  --keep-work          workディレクトリを保持（デフォルト）
  --clean-before       実行前にworkディレクトリを削除
  --dry-run            実行せずにコマンドを表示
  --verbose, -v        詳細出力

Examples:
  node scripts/project-run.mjs --project myproject
  node scripts/project-run.mjs --project myproject --preset vertical-short
  node scripts/project-run.mjs --project myproject --clean
  node scripts/project-run.mjs --project myproject --clean-before
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
  const args = process.argv.slice(2);

  // --help オプション
  if (args.includes('--help') || args.includes('-h')) {
    showUsage();
    process.exit(0);
  }

  const options = parseArgs(args);

  if (!options.project) {
    showUsage();
    process.exit(1);
  }

  const projectDir = path.resolve(process.cwd(), options.project);
  const startTime = Date.now();

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
  const workDir = path.join(projectDir, config.paths?.work || "work");
  const outputPath = path.join(outputsDir, "output.mp4");

  console.log();
  console.log(`Structure: ${structurePath}`);
  console.log(`Narration: ${narrationPath}`);
  console.log(`Output:    ${outputPath}`);
  if (options.verbose) {
    console.log(`Work:      ${workDir}`);
  }
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

  // clean-before: 実行前にworkディレクトリを削除
  if (options.cleanBefore) {
    if (removeDir(workDir)) {
      console.log(`[CLEAN] 実行前に work ディレクトリを削除しました: ${workDir}`);
    }
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

  // manifest 生成用のヘルパー
  const writeManifest = (success, error = null) => {
    if (options.skipManifest) return;

    const manifest = generateManifest({
      projectDir,
      structurePath,
      narrationPath,
      outputPath,
      preset: options.preset,
      startTime,
      endTime: Date.now(),
      success,
      error,
    });

    const manifestPath = path.join(outputsDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`\nManifest: ${manifestPath}`);
  };

  // Step 1: 検証
  if (!options.skipValidation) {
    console.log("━━━ Step 1: Validation ━━━");

    const validateResult = await runCommand("node", [
      "scripts/validate-strict.mjs",
      "--project", projectDir,
    ]);

    if (validateResult.code !== 0) {
      console.error("\n[ERROR] 検証に失敗しました。エラーを修正してください。");
      writeManifest(false, 'Validation failed');
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
    writeManifest(false, 'Rendering failed');
    process.exit(1);
  }

  // manifest 生成
  writeManifest(true);

  // clean: 成功後にworkディレクトリを削除
  if (options.clean && !options.keepWork) {
    if (removeDir(workDir)) {
      console.log(`\n[CLEAN] work ディレクトリを削除しました: ${workDir}`);
    }
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
