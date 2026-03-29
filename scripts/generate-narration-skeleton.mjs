#!/usr/bin/env node
/**
 * generate-narration-skeleton.mjs
 * structure.json から narration.md の骨組みを生成する
 *
 * 出力例:
 *   ---
 *   title: Video Title
 *   language: ja
 *   ---
 *
 *   # s01
 *   [話者: host]
 *   TODO: ここに台本を書く
 *
 * 使い方:
 *   node scripts/generate-narration-skeleton.mjs --structure <structure.json> --out <narration.md>
 */

import fs from "fs";
import path from "path";

function parseArgs(args) {
  const result = {
    structure: null,
    out: null,
    language: "ja",
    speaker: "host",
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--structure" && args[i + 1]) {
      result.structure = args[++i];
    } else if (args[i] === "--out" && args[i + 1]) {
      result.out = args[++i];
    } else if (args[i] === "--language" && args[i + 1]) {
      result.language = args[++i];
    } else if (args[i] === "--speaker" && args[i + 1]) {
      result.speaker = args[++i];
    }
  }

  return result;
}

function showUsage() {
  console.log(`
Usage: node scripts/generate-narration-skeleton.mjs --structure <structure.json> --out <narration.md>

Options:
  --structure <path>  Input structure.json file (required)
  --out <path>        Output path for narration.md (required)
  --language <lang>   Language code for YAML header (default: ja)
  --speaker <name>    Default speaker name (default: host)

Example:
  node scripts/generate-narration-skeleton.mjs --structure structure.json --out narration.md --language ja
`);
}

/**
 * セグメントタイプに応じたヒントを生成
 */
function getTypeHint(type, language) {
  const hints = {
    ja: {
      intro: "動画の導入部分です。視聴者に挨拶し、今回の内容を紹介してください。",
      talk: "メインコンテンツです。構成に沿って説明してください。",
      demo: "デモンストレーションのセクションです。操作や手順を説明してください。",
      broll: "補足映像のセクションです。ナレーションで補足説明を入れてください。",
      cta: "視聴者へのアクション依頼です。チャンネル登録や高評価を促してください。",
      outro: "動画の締めくくりです。まとめと感謝を伝えてください。",
    },
    en: {
      intro: "Introduction section. Greet viewers and introduce the topic.",
      talk: "Main content. Explain according to the structure.",
      demo: "Demonstration section. Explain the steps or procedures.",
      broll: "B-roll section. Add supplementary narration.",
      cta: "Call to action. Encourage viewers to subscribe or like.",
      outro: "Closing section. Summarize and thank viewers.",
    },
  };

  const langHints = hints[language] || hints.en;
  return langHints[type] || langHints.talk;
}

/**
 * 骨組み narration.md を生成
 */
function generateSkeleton(structure, options) {
  const lines = [];

  // YAML ヘッダー
  lines.push("---");
  lines.push(`title: "${structure.video?.title || "Untitled"}"`);
  lines.push(`language: ${options.language}`);
  lines.push(`generated_at: "${new Date().toISOString()}"`);
  lines.push("---");
  lines.push("");

  const segments = structure.segments || [];

  for (const segment of segments) {
    // セグメント見出し
    lines.push(`## ${segment.id}`);

    // 話者
    const speaker = segment.speaker_id || options.speaker;
    lines.push(`[話者: ${speaker}]`);
    lines.push("");

    // セグメント情報（コメント）
    const durationSec = Math.round((segment.end_ms - segment.start_ms) / 1000);
    lines.push(`<!-- ${segment.type} | ${durationSec}秒 -->`);
    lines.push("");

    // サマリー（参考情報）
    if (segment.summary) {
      lines.push(`> 元の内容: ${segment.summary}`);
      lines.push("");
    }

    // ヒント
    const hint = getTypeHint(segment.type, options.language);
    lines.push(`**ヒント**: ${hint}`);
    lines.push("");

    // TODO プレースホルダー
    lines.push("TODO: ここに台本を書いてください。");
    lines.push("");
    lines.push("```");
    lines.push("例: 皆さん、こんにちは。今回は〇〇について解説します。");
    lines.push("```");
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
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

  console.log("=== Generate Narration Skeleton ===\n");
  console.log(`Input:    ${structurePath}`);
  console.log(`Output:   ${outputPath}`);
  console.log(`Language: ${args.language}`);
  console.log(`Speaker:  ${args.speaker}`);

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

  const segments = structure.segments || [];
  if (segments.length === 0) {
    console.error("Error: No segments found in structure.json");
    process.exit(1);
  }

  // 骨組みを生成
  console.log("\n=== Generating Skeleton ===\n");
  const skeleton = generateSkeleton(structure, {
    language: args.language,
    speaker: args.speaker,
  });

  console.log(`Generated skeleton for ${segments.length} segments`);

  // 出力ディレクトリを作成
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 保存
  fs.writeFileSync(outputPath, skeleton);
  console.log(`\nSaved: ${outputPath}`);

  console.log("\n=== Success ===");
  console.log(`\nNext steps:`);
  console.log(`  1. Edit ${args.out}:`);
  console.log(`     - Replace TODO lines with your actual narration`);
  console.log(`     - Remove the example code blocks`);
  console.log(`     - Keep the segment IDs (# s01, # s02, etc.)`);
  console.log(`  2. Validate:`);
  console.log(`     npm run narration:validate -- --structure ${args.structure} --narration ${args.out}`);
  console.log(`  3. Render:`);
  console.log(`     npm run render:run -- --structure ${args.structure} --narration ${args.out}`);
}

main();
