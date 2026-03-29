#!/usr/bin/env node
/**
 * VideoJSON CLI - 統一エントリーポイント
 *
 * Usage:
 *   videojson <command> [options]
 *
 * Commands:
 *   doctor    環境チェック
 *   create    プロジェクト作成
 *   run       動画生成
 *   variants  複数プリセット一括生成
 *   preview   HTMLプレビュー生成
 *   validate  厳格な検証
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

// コマンド定義
const COMMANDS = {
  doctor: {
    script: 'scripts/doctor.mjs',
    description: '環境チェック（ffmpeg, Whisper, Node.js など）',
    usage: 'videojson doctor',
  },
  create: {
    script: 'scripts/project-create.mjs',
    description: 'プロジェクト作成（4つの入力ルートから選択）',
    usage: 'videojson create --subtitles input.srt --out myproject',
    examples: [
      'videojson create --youtube-url "https://..." --out myproject',
      'videojson create --subtitles input.srt --out myproject',
      'videojson create --video input.mp4 --out myproject --language ja',
      'videojson create --transcript data.json --out myproject',
    ],
  },
  run: {
    script: 'scripts/project-run.mjs',
    description: 'プロジェクトから動画を生成',
    usage: 'videojson run --project myproject',
    examples: [
      'videojson run --project myproject',
      'videojson run --project myproject --preset vertical-short',
    ],
  },
  variants: {
    script: 'scripts/project-variants.mjs',
    description: '複数プリセットで一括生成',
    usage: 'videojson variants --project myproject',
    examples: [
      'videojson variants --project myproject',
      'videojson variants --project myproject --presets "vertical-short,youtube-16x9"',
    ],
  },
  preview: {
    script: 'scripts/preview-html.mjs',
    description: 'HTMLプレビュー生成',
    usage: 'videojson preview --project myproject',
  },
  validate: {
    script: 'scripts/validate-strict.mjs',
    description: '厳格な検証（スキーマ + narration整合性）',
    usage: 'videojson validate --project myproject',
  },
};

// ヘルプ表示
function showHelp() {
  console.log(`
VideoJSON CLI - 動画をJSON形式で構造化し、新しい動画を生成

Usage:
  videojson <command> [options]

Commands:`);

  for (const [name, cmd] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(12)} ${cmd.description}`);
  }

  console.log(`
Examples:
  # 環境チェック
  videojson doctor

  # SRT字幕からプロジェクト作成
  videojson create --subtitles input.srt --out myproject

  # 動画生成
  videojson run --project myproject

  # 複数プリセットで一括生成
  videojson variants --project myproject

詳細は各コマンドに --help をつけて確認してください。
ドキュメント: https://github.com/taiyousan15/videojson2
`);
}

// コマンドのヘルプ表示
function showCommandHelp(cmdName, cmd) {
  console.log(`
videojson ${cmdName} - ${cmd.description}

Usage:
  ${cmd.usage}
`);

  if (cmd.examples && cmd.examples.length > 0) {
    console.log('Examples:');
    for (const example of cmd.examples) {
      console.log(`  ${example}`);
    }
    console.log('');
  }

  console.log('詳細なオプションは --help をつけて実行してください。');
}

// メイン処理
async function main() {
  const args = process.argv.slice(2);

  // 引数なしまたは --help
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    process.exit(0);
  }

  // --version
  if (args[0] === '--version' || args[0] === '-v') {
    try {
      const pkgPath = path.join(ROOT_DIR, 'package.json');
      const pkg = await import(pkgPath, { with: { type: 'json' } });
      console.log(`videojson v${pkg.default.version}`);
    } catch {
      console.log('videojson v0.1.0');
    }
    process.exit(0);
  }

  const cmdName = args[0];
  const cmdArgs = args.slice(1);

  // コマンド存在チェック
  if (!COMMANDS[cmdName]) {
    console.error(`エラー: 不明なコマンド '${cmdName}'`);
    console.error('');
    console.error('使用可能なコマンド:');
    for (const name of Object.keys(COMMANDS)) {
      console.error(`  ${name}`);
    }
    console.error('');
    console.error('ヘルプ: videojson --help');
    process.exit(1);
  }

  const cmd = COMMANDS[cmdName];

  // スクリプト実行
  const scriptPath = path.join(ROOT_DIR, cmd.script);

  const child = spawn('node', [scriptPath, ...cmdArgs], {
    stdio: 'inherit',
    cwd: ROOT_DIR,
  });

  child.on('error', (err) => {
    console.error(`エラー: スクリプトの実行に失敗しました`);
    console.error(err.message);
    process.exit(1);
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('予期しないエラー:', err.message);
  process.exit(1);
});
