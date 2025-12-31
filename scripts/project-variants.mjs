#!/usr/bin/env node
/**
 * project-variants.mjs
 * 1つのプロジェクトから複数プリセットで動画を量産する
 *
 * 使い方:
 *   npm run project:variants -- --project <projectDir>
 *   npm run project:variants -- --project myproject --presets "vertical-short,youtube-16x9"
 *
 * 出力:
 *   outputs/default/output.mp4
 *   outputs/vertical-short/output.mp4
 *   outputs/youtube-16x9/output.mp4
 */

import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";

// デフォルトのプリセット一覧
const DEFAULT_PRESETS = ["default", "vertical-short", "youtube-16x9"];

function parseArgs(args) {
  const result = {
    project: null,
    presets: null,
    skipValidation: false,
    dryRun: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--project" && args[i + 1]) {
      result.project = args[++i];
    } else if (args[i] === "--presets" && args[i + 1]) {
      result.presets = args[++i].split(",").map(p => p.trim());
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
╔════════════════════════════════════════════════════════════════╗
║                VideoJSON Project Variants                      ║
╚════════════════════════════════════════════════════════════════╝

Usage: npm run project:variants -- --project <projectDir> [options]

オプション:
  --project <path>         プロジェクトディレクトリ（必須）
  --presets <list>         カンマ区切りのプリセット一覧
                           (デフォルト: default,vertical-short,youtube-16x9)
  --skip-validation        検証をスキップ
  --dry-run                実行せずにコマンドを表示
  --verbose, -v            詳細出力

Examples:
  # 全プリセットで生成
  npm run project:variants -- --project myproject

  # 特定のプリセットのみ
  npm run project:variants -- --project myproject --presets "vertical-short,youtube-16x9"
`);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    if (options.dryRun) {
      console.log(`  [DRY-RUN] ${command} ${args.join(" ")}`);
      resolve({ code: 0 });
      return;
    }

    const proc = spawn(command, args, {
      stdio: options.silent ? "pipe" : "inherit",
      cwd: options.cwd,
    });

    let stdout = "";
    let stderr = "";

    if (options.silent) {
      proc.stdout?.on("data", (data) => { stdout += data.toString(); });
      proc.stderr?.on("data", (data) => { stderr += data.toString(); });
    }

    proc.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

// プリセット読み込み
function loadPreset(presetName) {
  const presetsDir = path.resolve(process.cwd(), "presets");
  const presetPath = path.join(presetsDir, `${presetName}.json`);

  if (fs.existsSync(presetPath)) {
    try {
      return JSON.parse(fs.readFileSync(presetPath, "utf8"));
    } catch (e) {
      return null;
    }
  }
  return null;
}

// config をマージして一時ファイルに保存
function createMergedConfig(baseConfig, preset, outputPath) {
  const merged = JSON.parse(JSON.stringify(baseConfig));

  // プリセットの render 設定をマージ
  if (preset.render) {
    merged.render = {
      ...merged.render,
      ...preset.render,
    };
    if (preset.render.resolution) {
      merged.render.resolution = {
        ...merged.render.resolution,
        ...preset.render.resolution,
      };
    }
  }

  merged.preset = preset.name;

  fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2));
  return merged;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.project) {
    showUsage();
    process.exit(1);
  }

  const projectDir = path.resolve(process.cwd(), options.project);
  const presets = options.presets || DEFAULT_PRESETS;

  // プロジェクトの存在確認
  if (!fs.existsSync(projectDir)) {
    console.error(`[ERROR] プロジェクトが見つかりません: ${projectDir}`);
    process.exit(1);
  }

  // config.json を読み込み
  const configPath = path.join(projectDir, "config.json");
  let baseConfig = {
    paths: {
      structure: "structure.json",
      narration: "narration.md",
      work: "work",
      outputs: "outputs",
    },
  };

  if (fs.existsSync(configPath)) {
    try {
      baseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (e) {
      console.warn(`[WARN] config.json の読み込みに失敗: ${e.message}`);
    }
  }

  const structurePath = path.join(projectDir, baseConfig.paths?.structure || "structure.json");
  const narrationPath = path.join(projectDir, baseConfig.paths?.narration || "narration.md");
  const workDir = path.join(projectDir, baseConfig.paths?.work || "work");
  const outputsDir = path.join(projectDir, baseConfig.paths?.outputs || "outputs");

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                VideoJSON Project Variants                      ║
╚════════════════════════════════════════════════════════════════╝

プロジェクト: ${projectDir}
プリセット:   ${presets.join(", ")}
`);

  // ファイルの存在確認
  if (!fs.existsSync(structurePath)) {
    console.error(`[ERROR] structure.json が見つかりません: ${structurePath}`);
    process.exit(1);
  }
  if (!fs.existsSync(narrationPath)) {
    console.error(`[ERROR] narration.md が見つかりません: ${narrationPath}`);
    process.exit(1);
  }

  // 検証（オプション）
  if (!options.skipValidation && !options.dryRun) {
    console.log("━━━ 検証中 ━━━\n");
    const validateResult = await runCommand("node", [
      "scripts/validate-strict.mjs",
      "--project", projectDir,
    ], { silent: true });

    if (validateResult.code !== 0) {
      console.error("❌ 検証に失敗しました。エラーを修正してください。");
      console.error(validateResult.stderr || validateResult.stdout);
      process.exit(1);
    }
    console.log("  ✅ 検証OK\n");
  }

  // 各プリセットで生成
  const results = [];

  for (let i = 0; i < presets.length; i++) {
    const presetName = presets[i];
    const preset = loadPreset(presetName);

    console.log(`\n━━━ [${i + 1}/${presets.length}] ${presetName} ━━━\n`);

    if (!preset) {
      console.warn(`  ⚠️ プリセット "${presetName}" が見つかりません。スキップします。`);
      results.push({ preset: presetName, status: "skipped", reason: "preset not found" });
      continue;
    }

    // 出力ディレクトリ
    const presetOutputDir = path.join(outputsDir, presetName);
    const outputPath = path.join(presetOutputDir, "output.mp4");

    if (!options.dryRun) {
      if (!fs.existsSync(presetOutputDir)) {
        fs.mkdirSync(presetOutputDir, { recursive: true });
      }

      // work/ にマージした config を保存
      if (!fs.existsSync(workDir)) {
        fs.mkdirSync(workDir, { recursive: true });
      }
      const mergedConfigPath = path.join(workDir, `config.${presetName}.json`);
      createMergedConfig(baseConfig, preset, mergedConfigPath);
    }

    // render:run を実行
    console.log(`  出力先: ${outputPath}`);
    console.log(`  解像度: ${preset.render?.resolution?.width || "?"}x${preset.render?.resolution?.height || "?"}`);

    const renderResult = await runCommand("node", [
      "scripts/render-run.mjs",
      "--structure", structurePath,
      "--narration", narrationPath,
      "--out", outputPath,
    ], { dryRun: options.dryRun, silent: !options.verbose });

    if (options.dryRun) {
      results.push({ preset: presetName, status: "dry-run", path: outputPath });
    } else if (renderResult.code === 0) {
      const stats = fs.existsSync(outputPath) ? fs.statSync(outputPath) : null;
      results.push({
        preset: presetName,
        status: "success",
        path: outputPath,
        size: stats ? stats.size : 0,
      });
      console.log(`  ✅ 生成完了`);
    } else {
      results.push({ preset: presetName, status: "failed", error: renderResult.stderr });
      console.error(`  ❌ 生成失敗`);
    }
  }

  // 結果サマリー
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                        結果サマリー                            ║
╚════════════════════════════════════════════════════════════════╝
`);

  const successCount = results.filter(r => r.status === "success" || r.status === "dry-run").length;
  const failCount = results.filter(r => r.status === "failed").length;
  const skipCount = results.filter(r => r.status === "skipped").length;

  console.log(`  ✅ 成功: ${successCount}`);
  console.log(`  ❌ 失敗: ${failCount}`);
  console.log(`  ⏭️  スキップ: ${skipCount}`);
  console.log();

  console.log("生成されたファイル:");
  for (const result of results) {
    if (result.status === "success") {
      console.log(`  ✅ ${result.path} (${formatFileSize(result.size)})`);
    } else if (result.status === "dry-run") {
      console.log(`  📋 ${result.path} (dry-run)`);
    } else if (result.status === "failed") {
      console.log(`  ❌ ${result.preset}: 失敗`);
    } else {
      console.log(`  ⏭️  ${result.preset}: スキップ`);
    }
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[ERROR]", err.message);
  process.exit(1);
});
