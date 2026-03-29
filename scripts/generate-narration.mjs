#!/usr/bin/env node
/**
 * generate-narration.mjs
 * structure.json から narration.md を自動生成する（API使用時）
 *
 * 環境変数:
 * - NARRATION_PROVIDER: 使用するプロバイダー（openai, anthropic, ollama, skeleton）
 * - OPENAI_API_KEY: OpenAI APIキー
 * - ANTHROPIC_API_KEY: Anthropic APIキー
 * - OLLAMA_MODEL: Ollamaモデル名（デフォルト: llama2）
 *
 * APIキーが設定されていない場合は skeleton にフォールバックします。
 *
 * 使い方:
 *   node scripts/generate-narration.mjs --structure <structure.json> --out <narration.md>
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

function parseArgs(args) {
  const result = {
    structure: null,
    out: null,
    provider: process.env.NARRATION_PROVIDER || "auto",
    language: "ja",
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--structure" && args[i + 1]) {
      result.structure = args[++i];
    } else if (args[i] === "--out" && args[i + 1]) {
      result.out = args[++i];
    } else if (args[i] === "--provider" && args[i + 1]) {
      result.provider = args[++i];
    } else if (args[i] === "--language" && args[i + 1]) {
      result.language = args[++i];
    }
  }

  return result;
}

function showUsage() {
  console.log(`
Usage: node scripts/generate-narration.mjs --structure <structure.json> --out <narration.md>

Options:
  --structure <path>  Input structure.json file (required)
  --out <path>        Output path for narration.md (required)
  --provider <name>   Provider: openai, anthropic, ollama, skeleton, auto (default: auto)
  --language <lang>   Language code (default: ja)

Environment Variables:
  NARRATION_PROVIDER  Default provider (overridden by --provider)
  OPENAI_API_KEY      OpenAI API key
  ANTHROPIC_API_KEY   Anthropic API key
  OLLAMA_MODEL        Ollama model name (default: llama2)

Example:
  # Auto-detect provider (falls back to skeleton if no API key)
  node scripts/generate-narration.mjs --structure structure.json --out narration.md

  # Force skeleton mode
  node scripts/generate-narration.mjs --structure structure.json --out narration.md --provider skeleton

  # Use OpenAI
  OPENAI_API_KEY=xxx node scripts/generate-narration.mjs --structure structure.json --out narration.md --provider openai
`);
}

/**
 * 使用可能なプロバイダーを検出
 */
function detectProvider(requested) {
  if (requested === "skeleton") {
    return "skeleton";
  }

  if (requested === "openai" || requested === "auto") {
    if (process.env.OPENAI_API_KEY) {
      return "openai";
    }
  }

  if (requested === "anthropic" || requested === "auto") {
    if (process.env.ANTHROPIC_API_KEY) {
      return "anthropic";
    }
  }

  if (requested === "ollama" || requested === "auto") {
    // Ollama はローカルで動作するので、常に利用可能と見なす
    // ただし auto の場合は最後の選択肢
    if (requested === "ollama") {
      return "ollama";
    }
  }

  // フォールバック
  return "skeleton";
}

/**
 * プロンプトテンプレートを読み込む
 */
function loadPromptTemplate() {
  const promptPath = path.resolve("prompts/narration-from-structure.prompt.md");
  if (!fs.existsSync(promptPath)) {
    return null;
  }
  return fs.readFileSync(promptPath, "utf-8");
}

/**
 * OpenAI API を使用して生成
 */
async function generateWithOpenAI(structure, language) {
  const template = loadPromptTemplate();
  if (!template) {
    throw new Error("Prompt template not found");
  }

  const prompt = template.replace("{{STRUCTURE_JSON}}", JSON.stringify(structure, null, 2));

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional video narration writer." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Anthropic API を使用して生成
 */
async function generateWithAnthropic(structure, language) {
  const template = loadPromptTemplate();
  if (!template) {
    throw new Error("Prompt template not found");
  }

  const prompt = template.replace("{{STRUCTURE_JSON}}", JSON.stringify(structure, null, 2));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 4096,
      messages: [
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

/**
 * Ollama を使用して生成
 */
async function generateWithOllama(structure, language) {
  const template = loadPromptTemplate();
  if (!template) {
    throw new Error("Prompt template not found");
  }

  const prompt = template.replace("{{STRUCTURE_JSON}}", JSON.stringify(structure, null, 2));
  const model = process.env.OLLAMA_MODEL || "llama2";

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  } catch (error) {
    throw new Error(`Ollama connection failed: ${error.message}. Is Ollama running?`);
  }
}

/**
 * skeleton 生成（フォールバック）
 */
function generateSkeleton(structurePath, outputPath) {
  const result = spawnSync("node", [
    "scripts/generate-narration-skeleton.mjs",
    "--structure", structurePath,
    "--out", outputPath,
  ], {
    stdio: "inherit",
    encoding: "utf-8",
  });

  return result.status === 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.structure || !args.out) {
    console.error("Error: --structure and --out are required\n");
    showUsage();
    process.exit(1);
  }

  const structurePath = path.resolve(args.structure);
  const outputPath = path.resolve(args.out);

  console.log("=== Generate Narration ===\n");

  // プロバイダーを検出
  const provider = detectProvider(args.provider);
  console.log(`Provider: ${provider}`);

  if (provider === "skeleton") {
    console.log("\nNo API key configured. Using skeleton mode.");
    console.log("To use AI generation, set one of:");
    console.log("  - OPENAI_API_KEY");
    console.log("  - ANTHROPIC_API_KEY");
    console.log("  - OLLAMA_MODEL (with Ollama running)");
    console.log("");

    if (!generateSkeleton(structurePath, outputPath)) {
      console.error("\n❌ Skeleton generation failed");
      process.exit(1);
    }
    return;
  }

  console.log(`Input:    ${structurePath}`);
  console.log(`Output:   ${outputPath}`);
  console.log(`Language: ${args.language}`);

  // ファイル存在チェック
  if (!fs.existsSync(structurePath)) {
    console.error(`Error: Structure file not found: ${structurePath}`);
    process.exit(1);
  }

  // structure.json を読み込み
  let structure;
  try {
    structure = JSON.parse(fs.readFileSync(structurePath, "utf-8"));
  } catch (error) {
    console.error(`Error parsing structure.json: ${error.message}`);
    process.exit(1);
  }

  console.log("\n=== Generating with AI ===\n");

  try {
    let narration;

    if (provider === "openai") {
      console.log("Using OpenAI API...");
      narration = await generateWithOpenAI(structure, args.language);
    } else if (provider === "anthropic") {
      console.log("Using Anthropic API...");
      narration = await generateWithAnthropic(structure, args.language);
    } else if (provider === "ollama") {
      console.log("Using Ollama...");
      narration = await generateWithOllama(structure, args.language);
    }

    // 出力ディレクトリを作成
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // 保存
    fs.writeFileSync(outputPath, narration);
    console.log(`\nSaved: ${outputPath}`);

    console.log("\n=== Success ===");
    console.log(`\nNext steps:`);
    console.log(`  1. Review and edit the generated narration`);
    console.log(`  2. Validate:`);
    console.log(`     npm run narration:validate -- --structure ${args.structure} --narration ${args.out}`);
    console.log(`  3. Render:`);
    console.log(`     npm run render:run -- --structure ${args.structure} --narration ${args.out}`);

  } catch (error) {
    console.error(`\n❌ AI generation failed: ${error.message}`);
    console.log("\nFalling back to skeleton mode...\n");

    if (!generateSkeleton(structurePath, outputPath)) {
      console.error("\n❌ Skeleton generation also failed");
      process.exit(1);
    }
  }
}

main();
