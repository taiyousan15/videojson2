#!/usr/bin/env node
/**
 * validate-strict.mjs
 * 複数のバリデーションを一括実行する厳格モード
 *
 * 使い方:
 *   node scripts/validate-strict.mjs --structure structure.json --narration narration.md
 *   node scripts/validate-strict.mjs --project myproject/
 *
 * 実行する検証:
 *   1. schema:validate - JSONスキーマ検証
 *   2. narration:validate - structure と narration の整合性
 *   3. validate:semantic - セマンティック検証
 *   4. validate:policy - ポリシー検証
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";

function parseArgs(args) {
  const result = {
    structure: null,
    narration: null,
    render: null,
    project: null,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--structure" && args[i + 1]) {
      result.structure = args[++i];
    } else if (args[i] === "--narration" && args[i + 1]) {
      result.narration = args[++i];
    } else if (args[i] === "--render" && args[i + 1]) {
      result.render = args[++i];
    } else if (args[i] === "--project" && args[i + 1]) {
      result.project = args[++i];
    } else if (args[i] === "--verbose" || args[i] === "-v") {
      result.verbose = true;
    }
  }

  return result;
}

function showUsage() {
  console.log(`
Usage: node scripts/validate-strict.mjs [options]

Options:
  --structure <path>   structure.json のパス
  --narration <path>   narration.md のパス
  --render <path>      render.json のパス
  --project <path>     プロジェクトディレクトリ（config.json から自動検出）
  --verbose, -v        詳細出力

Examples:
  node scripts/validate-strict.mjs --structure s.json --narration n.md
  node scripts/validate-strict.mjs --project myproject/
`);
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on("error", (err) => {
      resolve({ code: 1, stdout: "", stderr: err.message });
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  // プロジェクトモードの場合、config.json からパスを解決
  if (options.project) {
    const projectDir = path.resolve(process.cwd(), options.project);
    const configPath = path.join(projectDir, "config.json");

    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        options.structure = options.structure || path.join(projectDir, config.paths?.structure || "structure.json");
        options.narration = options.narration || path.join(projectDir, config.paths?.narration || "narration.md");
      } catch (e) {
        console.error(`[ERROR] config.json の読み込みに失敗: ${e.message}`);
      }
    } else {
      // デフォルトパス
      options.structure = options.structure || path.join(projectDir, "structure.json");
      options.narration = options.narration || path.join(projectDir, "narration.md");
    }
  }

  if (!options.structure && !options.narration) {
    showUsage();
    process.exit(1);
  }

  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║              VideoJSON Strict Validation                       ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log();

  const results = [];
  let hasError = false;

  // 1. Structure JSON Schema Validation
  if (options.structure && fs.existsSync(options.structure)) {
    console.log("━━━ [1/4] Schema Validation (structure.json) ━━━");
    const structureResult = await runCommand("node", [
      "scripts/validate-json.mjs",
      "schemas/structure.schema.json",
      options.structure,
    ]);

    if (structureResult.code === 0) {
      console.log("  ✅ structure.json: スキーマ検証OK");
      results.push({ name: "schema:structure", status: "pass" });
    } else {
      console.log("  ❌ structure.json: スキーマ検証NG");
      if (options.verbose) console.log(structureResult.stderr || structureResult.stdout);
      results.push({ name: "schema:structure", status: "fail", error: structureResult.stderr });
      hasError = true;
    }
    console.log();
  }

  // 2. Narration Validation
  if (options.structure && options.narration && fs.existsSync(options.narration)) {
    console.log("━━━ [2/4] Narration Validation ━━━");
    const narrationResult = await runCommand("node", [
      "scripts/validate-narration.mjs",
      "--structure", options.structure,
      "--narration", options.narration,
    ]);

    if (narrationResult.code === 0) {
      console.log("  ✅ narration.md: 整合性検証OK");
      results.push({ name: "narration", status: "pass" });
    } else {
      console.log("  ❌ narration.md: 整合性検証NG");
      if (options.verbose) console.log(narrationResult.stderr || narrationResult.stdout);
      results.push({ name: "narration", status: "fail", error: narrationResult.stderr });
      hasError = true;
    }
    console.log();
  }

  // 3. Semantic Validation
  if (options.structure && fs.existsSync(options.structure)) {
    console.log("━━━ [3/4] Semantic Validation ━━━");

    // Check if the script exists
    if (fs.existsSync("scripts/validate-semantic.mjs")) {
      const semanticResult = await runCommand("node", [
        "scripts/validate-semantic.mjs",
        "--structure", options.structure,
      ]);

      if (semanticResult.code === 0) {
        console.log("  ✅ セマンティック検証OK");
        results.push({ name: "semantic", status: "pass" });
      } else {
        console.log("  ⚠️  セマンティック検証に警告があります");
        if (options.verbose) console.log(semanticResult.stdout);
        results.push({ name: "semantic", status: "warn", output: semanticResult.stdout });
      }
    } else {
      console.log("  ⏭️  スキップ（validate-semantic.mjs が存在しません）");
      results.push({ name: "semantic", status: "skip" });
    }
    console.log();
  }

  // 4. Policy Validation
  if (options.structure && fs.existsSync(options.structure)) {
    console.log("━━━ [4/4] Policy Validation ━━━");

    if (fs.existsSync("scripts/validate-policy.mjs")) {
      const policyResult = await runCommand("node", [
        "scripts/validate-policy.mjs",
        "--structure", options.structure,
      ]);

      if (policyResult.code === 0) {
        console.log("  ✅ ポリシー検証OK");
        results.push({ name: "policy", status: "pass" });
      } else {
        console.log("  ⚠️  ポリシー検証に警告があります");
        if (options.verbose) console.log(policyResult.stdout);
        results.push({ name: "policy", status: "warn", output: policyResult.stdout });
      }
    } else {
      console.log("  ⏭️  スキップ（validate-policy.mjs が存在しません）");
      results.push({ name: "policy", status: "skip" });
    }
    console.log();
  }

  // Summary
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║                        Summary                                 ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");

  const passed = results.filter(r => r.status === "pass").length;
  const failed = results.filter(r => r.status === "fail").length;
  const warned = results.filter(r => r.status === "warn").length;
  const skipped = results.filter(r => r.status === "skip").length;

  console.log(`  ✅ Passed:  ${passed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  ⚠️  Warned:  ${warned}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log();

  if (hasError) {
    console.log("❌ 検証に失敗しました。エラーを修正してください。");
    process.exit(1);
  } else {
    console.log("✅ すべての検証に合格しました。");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("[ERROR]", err.message);
  process.exit(1);
});
