#!/usr/bin/env node
/**
 * project-create.mjs
 * VideoJSON プロジェクトを入力ソースから一括作成する統一エントリーポイント
 *
 * 4つの入力ルート:
 *   A) --youtube-url "<url>"        → YouTube字幕から
 *   B) --subtitles "<path.srt|vtt>" → SRT/VTT字幕から
 *   C) --video "<path.mp4>"         → ローカル動画から（Whisper必要）
 *   D) --transcript "<path.json>"   → transcript.jsonから
 *
 * 使い方:
 *   npm run project:create -- --youtube-url "https://..." --out myproject
 *   npm run project:create -- --subtitles input.srt --out myproject --preset vertical-short
 *   npm run project:create -- --video input.mp4 --out myproject --language ja
 *   npm run project:create -- --transcript transcript.json --out myproject
 */

import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";

// Windows対応: npm コマンド名
const NPM_CMD = process.platform === "win32" ? "npm.cmd" : "npm";

function parseArgs(args) {
  const result = {
    youtubeUrl: null,
    subtitles: null,
    video: null,
    transcript: null,
    out: null,
    preset: "default",
    title: null,
    language: "ja",
    force: false,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--youtube-url" && args[i + 1]) {
      result.youtubeUrl = args[++i];
    } else if (args[i] === "--subtitles" && args[i + 1]) {
      result.subtitles = args[++i];
    } else if (args[i] === "--video" && args[i + 1]) {
      result.video = args[++i];
    } else if (args[i] === "--transcript" && args[i + 1]) {
      result.transcript = args[++i];
    } else if (args[i] === "--out" && args[i + 1]) {
      result.out = args[++i];
    } else if (args[i] === "--preset" && args[i + 1]) {
      result.preset = args[++i];
    } else if (args[i] === "--title" && args[i + 1]) {
      result.title = args[++i];
    } else if (args[i] === "--language" && args[i + 1]) {
      result.language = args[++i];
    } else if (args[i] === "--force" || args[i] === "-f") {
      result.force = true;
    } else if (args[i] === "--dry-run") {
      result.dryRun = true;
    }
  }

  return result;
}

function showUsage() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                 VideoJSON Project Create                       ║
╚════════════════════════════════════════════════════════════════╝

Usage: npm run project:create -- <input> --out <projectDir> [options]

入力ソース（いずれか1つ必須）:
  --youtube-url <url>      YouTube動画のURL（字幕を取得）
  --subtitles <path>       SRT/VTT字幕ファイル
  --video <path>           ローカル動画ファイル（Whisper必要）
  --transcript <path>      transcript.json ファイル

出力:
  --out <path>             プロジェクト出力先（必須）

オプション:
  --preset <name|path>     プリセット名またはJSONパス
                           (default, vertical-short, youtube-16x9)
  --title <title>          動画タイトル
  --language <lang>        言語コード（デフォルト: ja）
  --force, -f              既存ディレクトリを上書き
  --dry-run                実行せずに手順を表示

Examples:
  # YouTube字幕から
  npm run project:create -- --youtube-url "https://youtube.com/watch?v=..." --out myproject

  # SRT字幕から（ネット不要）
  npm run project:create -- --subtitles input.srt --out myproject --preset vertical-short

  # ローカル動画から（Whisper必要）
  npm run project:create -- --video input.mp4 --out myproject --language ja

  # transcript.jsonから（ネット不要・CI向け）
  npm run project:create -- --transcript data/transcript.json --out myproject
`);
}

function showError(message, hint) {
  console.error(`
╔════════════════════════════════════════════════════════════════╗
║  ❌ エラー                                                     ║
╚════════════════════════════════════════════════════════════════╝

${message}
`);
  if (hint) {
    console.error(`💡 ヒント: ${hint}
`);
  }
}

function showStep(step, total, description) {
  console.log(`\n━━━ Step ${step}/${total}: ${description} ━━━\n`);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    if (options.dryRun) {
      console.log(`  [DRY-RUN] ${command} ${args.join(" ")}`);
      resolve({ code: 0 });
      return;
    }

    console.log(`  [実行] ${command} ${args.join(" ")}`);

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

function runCommandSync(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.silent ? "pipe" : "inherit",
    cwd: options.cwd,
    encoding: "utf-8",
  });
  return {
    code: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

// プリセット読み込み
function loadPreset(presetName) {
  // JSONパスが指定された場合
  if (presetName.endsWith(".json") && fs.existsSync(presetName)) {
    try {
      return JSON.parse(fs.readFileSync(presetName, "utf8"));
    } catch (e) {
      console.warn(`[WARN] プリセット読み込み失敗: ${e.message}`);
    }
  }

  // presets/ ディレクトリから読み込み
  const presetsDir = path.resolve(process.cwd(), "presets");
  const presetPath = path.join(presetsDir, `${presetName}.json`);

  if (fs.existsSync(presetPath)) {
    try {
      return JSON.parse(fs.readFileSync(presetPath, "utf8"));
    } catch (e) {
      console.warn(`[WARN] プリセット読み込み失敗: ${e.message}`);
    }
  }

  // デフォルト
  return {
    name: "default",
    description: "標準設定",
    render: {
      resolution: { width: 1920, height: 1080 },
      fps: 30,
    },
  };
}

// 入力ルートの検出
function detectInputRoute(options) {
  if (options.youtubeUrl) return "youtube";
  if (options.subtitles) return "subtitles";
  if (options.video) return "video";
  if (options.transcript) return "transcript";
  return null;
}

async function createProject(options) {
  const route = detectInputRoute(options);
  const projectDir = path.resolve(process.cwd(), options.out);
  const workDir = path.join(projectDir, "work");
  const preset = loadPreset(options.preset);

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                 VideoJSON Project Create                       ║
╚════════════════════════════════════════════════════════════════╝

入力ルート:   ${route.toUpperCase()}
出力先:       ${projectDir}
プリセット:   ${preset.name || options.preset}
言語:         ${options.language}
`);

  // 出力ディレクトリのチェック
  if (fs.existsSync(projectDir) && !options.force) {
    showError(
      `出力ディレクトリが既に存在します: ${projectDir}`,
      "--force オプションで上書きできます"
    );
    return false;
  }

  // dry-run モード
  if (options.dryRun) {
    console.log("━━━ Dry Run Mode: 以下の手順が実行されます ━━━\n");
  }

  // ディレクトリ作成
  const dirs = ["", "assets", "work", "outputs"];
  for (const dir of dirs) {
    const fullPath = path.join(projectDir, dir);
    if (!options.dryRun) {
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    } else {
      console.log(`  [DRY-RUN] mkdir -p ${fullPath}`);
    }
  }

  // Step 1: 入力を transcript.json に変換（必要な場合）
  let transcriptPath = path.join(workDir, "transcript.json");

  if (route === "youtube") {
    showStep(1, 4, "YouTube字幕を取得");
    const result = await runCommand("node", [
      "scripts/analyze-youtube.mjs",
      "--url", options.youtubeUrl,
      "--out", path.join(workDir, "structure.json"),
    ], { dryRun: options.dryRun });

    if (!options.dryRun && result.code !== 0) {
      showError(
        "YouTube字幕の取得に失敗しました",
        "字幕が無効化されている可能性があります。--subtitles または --video ルートを試してください"
      );
      return false;
    }
    // YouTube ルートは直接 structure.json を生成するので Step 2 をスキップ
  } else if (route === "subtitles") {
    showStep(1, 4, "字幕ファイルを変換");
    const result = await runCommand("node", [
      "scripts/convert-subtitles-to-transcript.mjs",
      "--in", options.subtitles,
      "--out", transcriptPath,
      "--language", options.language,
    ], { dryRun: options.dryRun });

    if (!options.dryRun && result.code !== 0) {
      showError(
        "字幕ファイルの変換に失敗しました",
        "SRT または VTT 形式のファイルを指定してください"
      );
      return false;
    }
  } else if (route === "video") {
    showStep(1, 4, "動画から文字起こし (Whisper)");

    // Whisperの存在確認
    const whisperCheck = runCommandSync("which", ["whisper"], { silent: true });
    const whisperCppCheck = runCommandSync("which", ["whisper-cpp"], { silent: true });

    if (whisperCheck.code !== 0 && whisperCppCheck.code !== 0) {
      showError(
        "Whisper がインストールされていません",
        `以下のコマンドでインストールしてください:
  pip install openai-whisper    # Python版
  brew install whisper-cpp      # macOS (whisper-cpp)

または --subtitles ルートで SRT/VTT 字幕を使用してください`
      );
      return false;
    }

    const result = await runCommand("node", [
      "scripts/analyze-video.mjs",
      "--video", options.video,
      "--out", path.join(workDir, "structure.json"),
      "--language", options.language,
    ], { dryRun: options.dryRun });

    if (!options.dryRun && result.code !== 0) {
      showError(
        "動画の文字起こしに失敗しました",
        "Whisper が正しくインストールされているか確認してください"
      );
      return false;
    }
    // video ルートは直接 structure.json を生成するので Step 2 をスキップ
  } else if (route === "transcript") {
    showStep(1, 4, "transcript.json を読み込み");
    if (!fs.existsSync(options.transcript)) {
      showError(
        `transcript.json が見つかりません: ${options.transcript}`,
        "正しいパスを指定してください"
      );
      return false;
    }
    transcriptPath = path.resolve(options.transcript);
    console.log(`  ✅ ${transcriptPath}`);
  }

  // Step 2: structure.json を生成（transcript ルートの場合のみ）
  const structurePath = path.join(projectDir, "structure.json");

  if (route === "transcript" || route === "subtitles") {
    showStep(2, 4, "structure.json を生成");
    const result = await runCommand("node", [
      "scripts/analyze-transcript.mjs",
      "--transcript", transcriptPath,
      "--out", structurePath,
    ], { dryRun: options.dryRun });

    if (!options.dryRun && result.code !== 0) {
      showError(
        "structure.json の生成に失敗しました",
        "transcript.json の形式が正しいか確認してください"
      );
      return false;
    }
  } else {
    // YouTube / video ルートは work/ に生成されるので移動
    showStep(2, 4, "structure.json を配置");
    const workStructure = path.join(workDir, "structure.json");
    if (!options.dryRun && fs.existsSync(workStructure)) {
      fs.copyFileSync(workStructure, structurePath);
      console.log(`  ✅ ${structurePath}`);
    } else if (options.dryRun) {
      console.log(`  [DRY-RUN] cp ${workStructure} ${structurePath}`);
    }
  }

  // Step 3: narration.md を生成
  showStep(3, 4, "narration.md を生成");
  const narrationPath = path.join(projectDir, "narration.md");
  const result = await runCommand("node", [
    "scripts/generate-narration-skeleton.mjs",
    "--structure", structurePath,
    "--out", narrationPath,
    "--language", options.language,
  ], { dryRun: options.dryRun });

  if (!options.dryRun && result.code !== 0) {
    showError(
      "narration.md の生成に失敗しました",
      "structure.json が正しく生成されているか確認してください"
    );
    return false;
  }

  // Step 4: config.json と README.md を生成
  showStep(4, 4, "プロジェクトファイルを生成");

  // config.json
  const config = {
    schema_version: "1.0.0",
    project: {
      title: options.title || path.basename(options.out),
      language: options.language,
      created_at: new Date().toISOString(),
      source_route: route,
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

  const configPath = path.join(projectDir, "config.json");
  if (!options.dryRun) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`  ✅ ${configPath}`);
  } else {
    console.log(`  [DRY-RUN] write ${configPath}`);
  }

  // README.md
  const readme = generateReadme(options, preset, route);
  const readmePath = path.join(projectDir, "README.md");
  if (!options.dryRun) {
    fs.writeFileSync(readmePath, readme);
    console.log(`  ✅ ${readmePath}`);
  } else {
    console.log(`  [DRY-RUN] write ${readmePath}`);
  }

  // .gitignore for subdirectories
  const gitignoreContent = "# VideoJSON generated files\n*\n!.gitignore\n";
  for (const dir of ["assets", "work", "outputs"]) {
    const gitignorePath = path.join(projectDir, dir, ".gitignore");
    if (!options.dryRun) {
      fs.writeFileSync(gitignorePath, gitignoreContent);
    }
  }

  // 完了メッセージ
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  ✅ プロジェクト作成完了!                                      ║
╚════════════════════════════════════════════════════════════════╝

作成されたファイル:
  ${projectDir}/
  ├── config.json      # プロジェクト設定
  ├── structure.json   # 動画構造
  ├── narration.md     # 台本（要編集）
  ├── README.md        # 使い方
  ├── assets/          # 素材
  ├── work/            # 中間ファイル
  └── outputs/         # 出力先

━━━ 次のステップ ━━━

1. 台本を編集:
   ${narrationPath}
   → TODO の部分を実際の台本に置き換えてください

2. 動画を生成:
   npm run project:run -- --project ${options.out}

3. プレビュー（オプション）:
   npm run preview:html -- --structure ${structurePath} --narration ${narrationPath}
`);

  return true;
}

function generateReadme(options, preset, route) {
  const projectName = options.title || path.basename(options.out);
  return `# ${projectName}

VideoJSON プロジェクト

## 作成情報

- **作成日**: ${new Date().toISOString().split("T")[0]}
- **入力ルート**: ${route}
- **プリセット**: ${preset.name || options.preset}
- **言語**: ${options.language}

## ディレクトリ構成

\`\`\`
${path.basename(options.out)}/
├── config.json      # プロジェクト設定
├── structure.json   # 動画構造（セグメント定義）
├── narration.md     # 台本（編集必須）
├── assets/          # 素材（画像、音声など）
├── work/            # 中間ファイル
└── outputs/         # 出力ファイル（mp4など）
\`\`\`

## 使い方

### 1. 台本を編集

\`narration.md\` を開いて、TODO の部分を実際の台本に置き換えます。

### 2. 動画を生成

\`\`\`bash
npm run project:run -- --project ${options.out}
\`\`\`

### 3. バリエーション生成（オプション）

\`\`\`bash
# 複数プリセットで一括生成
npm run project:variants -- --project ${options.out}
\`\`\`

## 注意事項

- \`assets/\`, \`work/\`, \`outputs/\` は .gitignore されています
- 台本は必ずオリジナルに書き換えてください
- 第三者の声や顔の模倣は、許可がある場合のみ使用できます
`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  // ヘルプ表示
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showUsage();
    process.exit(0);
  }

  // 入力ソースのチェック
  const route = detectInputRoute(options);
  if (!route) {
    showError(
      "入力ソースが指定されていません",
      "以下のいずれかを指定してください:\n" +
      "  --youtube-url <url>\n" +
      "  --subtitles <path>\n" +
      "  --video <path>\n" +
      "  --transcript <path>"
    );
    showUsage();
    process.exit(1);
  }

  // 出力先のチェック
  if (!options.out) {
    showError(
      "出力先が指定されていません",
      "--out <projectDir> を指定してください"
    );
    process.exit(1);
  }

  // プロジェクト作成実行
  const success = await createProject(options);
  process.exit(success ? 0 : 1);
}

main().catch((err) => {
  console.error("[ERROR]", err.message);
  process.exit(1);
});
