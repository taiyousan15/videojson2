#!/usr/bin/env node
/**
 * project-init.mjs
 * VideoJSON プロジェクトのディレクトリ構造を作成する
 *
 * 使い方:
 *   node scripts/project-init.mjs --dir <projectDir>
 *   node scripts/project-init.mjs --dir myproject --preset vertical-short
 *
 * 作成されるもの:
 *   <projectDir>/
 *     config.json      - プロジェクト設定
 *     structure.json   - 構造定義（空の初期状態）
 *     narration.md     - 台本テンプレート
 *     assets/          - 素材置き場（画像、音声など）
 *     work/            - 中間ファイル
 *     outputs/         - 出力ファイル（mp4など）
 *     README.md        - プロジェクト固有の説明
 */

import fs from "fs";
import path from "path";

function parseArgs(args) {
  const result = {
    dir: null,
    preset: "default",
    title: null,
    language: "ja",
    force: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dir" && args[i + 1]) {
      result.dir = args[++i];
    } else if (args[i] === "--preset" && args[i + 1]) {
      result.preset = args[++i];
    } else if (args[i] === "--title" && args[i + 1]) {
      result.title = args[++i];
    } else if (args[i] === "--language" && args[i + 1]) {
      result.language = args[++i];
    } else if (args[i] === "--force" || args[i] === "-f") {
      result.force = true;
    }
  }

  return result;
}

function showUsage() {
  console.log(`
Usage: node scripts/project-init.mjs --dir <projectDir> [options]

Options:
  --dir <path>       プロジェクトディレクトリ（必須）
  --preset <name>    プリセット名（default, vertical-short, youtube-16x9）
  --title <title>    動画タイトル
  --language <lang>  言語コード（デフォルト: ja）
  --force, -f        既存ディレクトリを上書き

Examples:
  node scripts/project-init.mjs --dir myproject
  node scripts/project-init.mjs --dir shorts/ep01 --preset vertical-short --title "Episode 1"
`);
}

// プリセット設定を読み込む
function loadPreset(presetName) {
  const presetsDir = path.resolve(process.cwd(), "presets");
  const presetPath = path.join(presetsDir, `${presetName}.json`);

  if (fs.existsSync(presetPath)) {
    try {
      return JSON.parse(fs.readFileSync(presetPath, "utf8"));
    } catch (e) {
      console.warn(`[WARN] プリセット ${presetName} の読み込みに失敗: ${e.message}`);
    }
  }

  // デフォルトプリセット
  return {
    name: "default",
    description: "標準設定",
    render: {
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      audio: { mode: "tts", provider: "dummy" },
    },
  };
}

// config.json の生成
function generateConfig(options, preset) {
  return {
    schema_version: "1.0.0",
    project: {
      title: options.title || path.basename(options.dir),
      language: options.language,
      created_at: new Date().toISOString(),
    },
    preset: options.preset,
    render: preset.render || {},
    paths: {
      structure: "structure.json",
      narration: "narration.md",
      assets: "assets",
      work: "work",
      outputs: "outputs",
    },
  };
}

// structure.json の初期テンプレート
function generateStructure(options) {
  return {
    schema_version: "1.0.0",
    generated_at: new Date().toISOString(),
    video: {
      source_type: "manual",
      source: "project-init",
      title: options.title || path.basename(options.dir),
      duration_ms: 30000,
      language: options.language,
    },
    segments: [
      {
        id: "s01",
        type: "intro",
        start_ms: 0,
        end_ms: 5000,
        summary: "導入部分",
        speaker_id: "host",
      },
      {
        id: "s02",
        type: "talk",
        start_ms: 5000,
        end_ms: 25000,
        summary: "メインコンテンツ",
        speaker_id: "host",
      },
      {
        id: "s03",
        type: "outro",
        start_ms: 25000,
        end_ms: 30000,
        summary: "締めくくり",
        speaker_id: "host",
      },
    ],
  };
}

// narration.md の初期テンプレート
function generateNarration(options, structure) {
  const lines = [
    "---",
    `title: "${options.title || path.basename(options.dir)}"`,
    `language: ${options.language}`,
    `generated_at: "${new Date().toISOString()}"`,
    "---",
    "",
  ];

  for (const seg of structure.segments) {
    lines.push(`## ${seg.id}`);
    lines.push(`[話者: ${seg.speaker_id || "host"}]`);
    lines.push("");
    lines.push(`<!-- ${seg.type} | ${Math.round((seg.end_ms - seg.start_ms) / 1000)}秒 -->`);
    lines.push("");

    if (seg.type === "intro") {
      lines.push("**ヒント**: 視聴者への挨拶と、今回の内容の紹介。");
    } else if (seg.type === "outro") {
      lines.push("**ヒント**: まとめと次回予告、チャンネル登録の案内など。");
    } else {
      lines.push("**ヒント**: このセクションの主要なポイントを説明。");
    }
    lines.push("");
    lines.push("TODO: ここに台本を書いてください。");
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

// README.md の生成
function generateReadme(options, preset) {
  return `# ${options.title || path.basename(options.dir)}

VideoJSON プロジェクト

## ディレクトリ構成

\`\`\`
${path.basename(options.dir)}/
├── config.json      # プロジェクト設定
├── structure.json   # 動画構造（セグメント定義）
├── narration.md     # 台本
├── assets/          # 素材（画像、音声など）
├── work/            # 中間ファイル
└── outputs/         # 出力ファイル（mp4など）
\`\`\`

## 使い方

### 1. 台本を編集

\`narration.md\` を開いて、TODO の部分を実際の台本に置き換えます。

### 2. 動画を生成

\`\`\`bash
npm run render:run -- \\
  --structure ${path.basename(options.dir)}/structure.json \\
  --narration ${path.basename(options.dir)}/narration.md \\
  --out ${path.basename(options.dir)}/outputs/output.mp4
\`\`\`

### 3. プレビュー（オプション）

\`\`\`bash
npm run preview:html -- \\
  --structure ${path.basename(options.dir)}/structure.json \\
  --narration ${path.basename(options.dir)}/narration.md \\
  --out ${path.basename(options.dir)}/preview.html
\`\`\`

## プリセット

このプロジェクトは \`${preset.name || "default"}\` プリセットを使用しています。

${preset.description || ""}

## 注意事項

- \`assets/\`, \`work/\`, \`outputs/\` は .gitignore されています
- 台本は必ずオリジナルに書き換えてください
- 第三者の声や顔の模倣は、許可がある場合のみ使用できます
`;
}

// .gitignore の生成
function generateGitignore() {
  return `# VideoJSON project generated files
*
!.gitignore
`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.dir) {
    showUsage();
    process.exit(1);
  }

  const projectDir = path.resolve(process.cwd(), options.dir);

  // ディレクトリが存在する場合のチェック
  if (fs.existsSync(projectDir)) {
    if (!options.force) {
      console.error(`[ERROR] ディレクトリが既に存在します: ${projectDir}`);
      console.error("上書きするには --force オプションを使用してください");
      process.exit(1);
    }
    console.log(`[WARN] 既存ディレクトリを上書きします: ${projectDir}`);
  }

  // プリセットを読み込む
  const preset = loadPreset(options.preset);
  console.log(`[INFO] プリセット: ${preset.name || options.preset}`);

  // ディレクトリ作成
  const dirs = ["", "assets", "work", "outputs"];
  for (const dir of dirs) {
    const fullPath = path.join(projectDir, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`[CREATE] ${fullPath}/`);
    }
  }

  // structure.json
  const structure = generateStructure(options);
  const structurePath = path.join(projectDir, "structure.json");
  fs.writeFileSync(structurePath, JSON.stringify(structure, null, 2));
  console.log(`[CREATE] ${structurePath}`);

  // config.json
  const config = generateConfig(options, preset);
  const configPath = path.join(projectDir, "config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`[CREATE] ${configPath}`);

  // narration.md
  const narration = generateNarration(options, structure);
  const narrationPath = path.join(projectDir, "narration.md");
  fs.writeFileSync(narrationPath, narration);
  console.log(`[CREATE] ${narrationPath}`);

  // README.md
  const readme = generateReadme(options, preset);
  const readmePath = path.join(projectDir, "README.md");
  fs.writeFileSync(readmePath, readme);
  console.log(`[CREATE] ${readmePath}`);

  // .gitignore for subdirectories
  const gitignoreContent = generateGitignore();
  for (const dir of ["assets", "work", "outputs"]) {
    const gitignorePath = path.join(projectDir, dir, ".gitignore");
    fs.writeFileSync(gitignorePath, gitignoreContent);
  }
  console.log(`[CREATE] .gitignore files in assets/, work/, outputs/`);

  console.log(`
[SUCCESS] プロジェクトを作成しました: ${projectDir}

次のステップ:
  1. ${path.join(options.dir, "narration.md")} を編集して台本を書く
  2. npm run render:run で動画を生成

詳細は ${path.join(options.dir, "README.md")} を参照してください。
`);
}

main().catch((err) => {
  console.error("[ERROR]", err.message);
  process.exit(1);
});
