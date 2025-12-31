#!/usr/bin/env node
/**
 * doctor.mjs
 * VideoJSON の環境をチェックし、問題があれば対処法を案内する
 *
 * チェック項目:
 *   - Node.js バージョン
 *   - ffmpeg の存在
 *   - Whisper の検出（オプション）
 *   - 必要な npm パッケージ
 *   - .env / APIキーの設定
 *   - 書き込み権限
 *
 * 使い方:
 *   npm run doctor
 *   npm run doctor -- --project myproject
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

function parseArgs(args) {
  const result = {
    project: null,
    quiet: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--project" && args[i + 1]) {
      result.project = args[++i];
    } else if (args[i] === "--quiet" || args[i] === "-q") {
      result.quiet = true;
    }
  }

  return result;
}

function checkCommand(command, args = ["--version"]) {
  try {
    const result = spawnSync(command, args, {
      stdio: "pipe",
      encoding: "utf-8",
      timeout: 5000,
    });
    return {
      exists: result.status === 0,
      version: result.stdout?.trim().split("\n")[0] || "",
      error: result.stderr?.trim(),
    };
  } catch (e) {
    return { exists: false, version: "", error: e.message };
  }
}

function checkNodeVersion() {
  const version = process.version;
  const major = parseInt(version.slice(1).split(".")[0], 10);
  const required = 20;

  return {
    name: "Node.js",
    status: major >= required ? "ok" : "error",
    message: `${version}`,
    detail: major >= required
      ? `Node.js ${required}以上の要件を満たしています`
      : `Node.js ${required}以上が必要です（現在: ${version}）`,
    fix: major < required
      ? `
  インストール方法:
    # nvm を使う場合
    nvm install ${required}
    nvm use ${required}

    # 公式サイトから
    https://nodejs.org/
`
      : null,
  };
}

function checkFfmpeg() {
  const result = checkCommand("ffmpeg", ["-version"]);

  return {
    name: "ffmpeg",
    status: result.exists ? "ok" : "error",
    message: result.exists ? "インストール済み" : "見つかりません",
    detail: result.exists
      ? result.version
      : "動画レンダリングに ffmpeg が必要です",
    fix: !result.exists
      ? `
  インストール方法:
    # macOS
    brew install ffmpeg

    # Ubuntu/Debian
    sudo apt-get install ffmpeg

    # Windows
    https://ffmpeg.org/download.html からダウンロード
`
      : null,
    critical: true,
  };
}

function checkWhisper() {
  // Python whisper
  const whisperPy = checkCommand("whisper", ["--help"]);
  // whisper-cpp
  const whisperCpp = checkCommand("whisper-cpp", ["--help"]);
  // whisper.cpp の別名
  const whisperMain = checkCommand("main", ["--help"]);

  const exists = whisperPy.exists || whisperCpp.exists || whisperMain.exists;
  let version = "";
  if (whisperPy.exists) version = "Python版";
  else if (whisperCpp.exists) version = "whisper-cpp";
  else if (whisperMain.exists) version = "whisper.cpp";

  return {
    name: "Whisper",
    status: exists ? "ok" : "warn",
    message: exists ? `${version} インストール済み` : "見つかりません",
    detail: exists
      ? "ローカル動画の文字起こしに使用できます"
      : "ローカル動画からの文字起こしには Whisper が必要です",
    fix: !exists
      ? `
  Whisper がなくても、以下の方法で動画制作可能です:
    - SRT/VTT 字幕ファイルを使う (--subtitles ルート)
    - YouTube 字幕を使う (--youtube-url ルート)
    - transcript.json を直接用意する (--transcript ルート)

  インストールする場合:
    # Python版（推奨）
    pip install openai-whisper

    # macOS (whisper-cpp)
    brew install whisper-cpp
`
      : null,
    critical: false,
  };
}

function checkNpmPackages() {
  const nodeModulesPath = path.join(process.cwd(), "node_modules");
  const packageJsonPath = path.join(process.cwd(), "package.json");

  if (!fs.existsSync(nodeModulesPath)) {
    return {
      name: "npm packages",
      status: "error",
      message: "node_modules が見つかりません",
      detail: "依存パッケージがインストールされていません",
      fix: `
  以下のコマンドを実行してください:
    npm install
`,
      critical: true,
    };
  }

  // 主要パッケージの確認
  const requiredPackages = ["ajv", "ajv-formats"];
  const missing = [];

  for (const pkg of requiredPackages) {
    if (!fs.existsSync(path.join(nodeModulesPath, pkg))) {
      missing.push(pkg);
    }
  }

  if (missing.length > 0) {
    return {
      name: "npm packages",
      status: "error",
      message: `不足: ${missing.join(", ")}`,
      detail: "一部の依存パッケージがインストールされていません",
      fix: `
  以下のコマンドを実行してください:
    npm install
`,
      critical: true,
    };
  }

  return {
    name: "npm packages",
    status: "ok",
    message: "インストール済み",
    detail: "必要なパッケージがインストールされています",
    fix: null,
  };
}

function checkEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  const envExamplePath = path.join(process.cwd(), ".env.example");

  if (!fs.existsSync(envPath)) {
    return {
      name: ".env ファイル",
      status: "warn",
      message: "見つかりません",
      detail: "環境変数ファイルがありません（開発環境ではオプション）",
      fix: fs.existsSync(envExamplePath)
        ? `
  以下のコマンドで .env を作成してください:
    cp .env.example .env

  その後、必要に応じて値を編集してください。
`
        : `
  .env ファイルを作成し、必要な環境変数を設定してください。
`,
      critical: false,
    };
  }

  return {
    name: ".env ファイル",
    status: "ok",
    message: "存在します",
    detail: ".env ファイルが見つかりました",
    fix: null,
  };
}

function checkTtsProvider() {
  const provider = process.env.VIDEOJSON_TTS_PROVIDER || "dummy";

  if (provider === "dummy") {
    return {
      name: "TTS Provider",
      status: "ok",
      message: "dummy（開発モード）",
      detail: "無音の TTS を使用します。本番では elevenlabs などを設定してください。",
      fix: null,
    };
  }

  if (provider === "elevenlabs") {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;

    if (!apiKey || !voiceId) {
      return {
        name: "TTS Provider",
        status: "warn",
        message: "ElevenLabs（APIキー未設定）",
        detail: "ELEVENLABS_API_KEY または ELEVENLABS_VOICE_ID が設定されていません",
        fix: `
  .env ファイルに以下を追加してください:
    ELEVENLABS_API_KEY=your_api_key
    ELEVENLABS_VOICE_ID=your_voice_id
`,
        critical: false,
      };
    }

    return {
      name: "TTS Provider",
      status: "ok",
      message: "ElevenLabs（設定済み）",
      detail: "ElevenLabs TTS が利用可能です",
      fix: null,
    };
  }

  return {
    name: "TTS Provider",
    status: "ok",
    message: provider,
    detail: `TTS プロバイダー: ${provider}`,
    fix: null,
  };
}

function checkLipsyncProvider() {
  const provider = process.env.VIDEOJSON_LIPSYNC_PROVIDER || "dummy";

  // dummy プロバイダーは ffmpeg のみ必要
  if (provider === "dummy") {
    const ffmpegCheck = checkCommand("ffmpeg", ["-version"]);
    if (!ffmpegCheck.exists) {
      return {
        name: "Lipsync Provider",
        status: "warn",
        message: "dummy（ffmpeg必要）",
        detail: "dummy lipsync プロバイダーには ffmpeg が必要です",
        fix: `
  ffmpeg をインストールしてください:
    # macOS
    brew install ffmpeg

    # Ubuntu/Debian
    sudo apt-get install ffmpeg
`,
        critical: false,
      };
    }

    return {
      name: "Lipsync Provider",
      status: "ok",
      message: "dummy（開発モード）",
      detail: "静止画 + Ken Burns エフェクトで疑似リップシンクを生成します",
      fix: null,
    };
  }

  // 将来の http プロバイダー
  if (provider === "http") {
    const endpoint = process.env.LIPSYNC_HTTP_ENDPOINT;
    if (!endpoint) {
      return {
        name: "Lipsync Provider",
        status: "warn",
        message: "http（エンドポイント未設定）",
        detail: "LIPSYNC_HTTP_ENDPOINT が設定されていません",
        fix: `
  .env ファイルに以下を追加してください:
    LIPSYNC_HTTP_ENDPOINT=http://localhost:8080/lipsync
`,
        critical: false,
      };
    }

    return {
      name: "Lipsync Provider",
      status: "ok",
      message: `http (${endpoint})`,
      detail: "HTTP エンドポイントでリップシンクを生成します",
      fix: null,
    };
  }

  return {
    name: "Lipsync Provider",
    status: "ok",
    message: provider,
    detail: `Lipsync プロバイダー: ${provider}`,
    fix: null,
  };
}

function checkWritePermission(projectDir) {
  const testDirs = projectDir
    ? [
        path.join(projectDir, "work"),
        path.join(projectDir, "outputs"),
      ]
    : [".tmp"];

  for (const dir of testDirs) {
    try {
      const testPath = path.join(dir, ".write-test-" + Date.now());
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(testPath, "test");
      fs.unlinkSync(testPath);
    } catch (e) {
      return {
        name: "書き込み権限",
        status: "error",
        message: `${dir} に書き込めません`,
        detail: e.message,
        fix: `
  ディレクトリの権限を確認してください:
    ls -la ${dir}

  権限を変更する場合:
    chmod 755 ${dir}
`,
        critical: true,
      };
    }
  }

  return {
    name: "書き込み権限",
    status: "ok",
    message: "OK",
    detail: "必要なディレクトリに書き込み可能です",
    fix: null,
  };
}

function printResult(check) {
  const icons = {
    ok: "✅",
    warn: "⚠️ ",
    error: "❌",
  };

  const icon = icons[check.status];
  console.log(`${icon} ${check.name}: ${check.message}`);

  if (check.fix && (check.status === "error" || check.status === "warn")) {
    console.log(`   ${check.detail}`);
    console.log(check.fix);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                   VideoJSON Doctor                             ║
╚════════════════════════════════════════════════════════════════╝

環境をチェック中...
`);

  const checks = [
    checkNodeVersion(),
    checkFfmpeg(),
    checkWhisper(),
    checkNpmPackages(),
    checkEnvFile(),
    checkTtsProvider(),
    checkLipsyncProvider(),
    checkWritePermission(options.project),
  ];

  // 結果を表示
  console.log("━━━ チェック結果 ━━━\n");

  for (const check of checks) {
    printResult(check);
  }

  // サマリー
  const errors = checks.filter(c => c.status === "error");
  const warnings = checks.filter(c => c.status === "warn");
  const criticalErrors = errors.filter(c => c.critical);

  console.log(`
━━━ サマリー ━━━

  ✅ OK: ${checks.filter(c => c.status === "ok").length}
  ⚠️  警告: ${warnings.length}
  ❌ エラー: ${errors.length}
`);

  if (criticalErrors.length > 0) {
    console.log(`
❌ 致命的なエラーがあります。上記の対処法を実行してください。
`);
    process.exit(1);
  }

  if (errors.length > 0) {
    console.log(`
⚠️  エラーがあります。機能が制限される可能性があります。
`);
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log(`
✅ 基本的な環境は整っています。警告は必要に応じて対処してください。
`);
    process.exit(0);
  }

  console.log(`
✅ 環境は正常です。VideoJSON を使用できます。
`);
  process.exit(0);
}

// エクスポート（他のスクリプトから呼び出し可能）
export async function runDoctor(options = {}) {
  const checks = [
    checkNodeVersion(),
    checkFfmpeg(),
    checkNpmPackages(),
    checkLipsyncProvider(),
    checkWritePermission(options.project),
  ];

  const criticalErrors = checks.filter(c => c.status === "error" && c.critical);
  return {
    ok: criticalErrors.length === 0,
    checks,
    criticalErrors,
  };
}

main().catch((err) => {
  console.error("[ERROR]", err.message);
  process.exit(1);
});
