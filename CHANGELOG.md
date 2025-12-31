# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-12-31

### Added

- **CLI Commands**
  - `videojson` - 統一CLIエントリーポイント（サブコマンド: doctor, create, run, variants, preview, validate）
  - `npm run project:create` - 4つの入力ルート（YouTube, SRT/VTT, 動画, transcript.json）からプロジェクト作成
  - `npm run project:run` - プロジェクトから動画を生成
  - `npm run project:variants` - 複数プリセット（default, vertical-short, youtube-16x9）で一括生成
  - `npm run doctor` - 環境チェック（Node.js, ffmpeg, Whisper, .env など）
  - `npm run validate:strict` - 厳格な検証（スキーマ + narration整合性）
  - `npm run preview:html` - HTMLプレビュー生成

- **Presets**
  - `default` - 標準設定（16:9, 1920x1080）
  - `vertical-short` - 縦型ショート（9:16, 1080x1920）
  - `youtube-16x9` - YouTube標準（16:9, 1920x1080, 高品質）

- **Features**
  - manifest.json 生成（実行ログ、バージョン、入力/出力情報）
  - クリーンアップオプション（--clean, --keep-work, --clean-before）
  - ドライランモード（--dry-run）
  - 詳細出力モード（--verbose）

- **Documentation**
  - README.md - CLIワークフロー中心のドキュメント
  - docs/quickstart.md - クイックスタートガイド
  - docs/troubleshooting.md - トラブルシューティング
  - docs/config.md - 設定ガイド

- **Testing**
  - CLI E2Eテスト（tests/cli/cli.test.ts）

### Changed

- プロジェクト構造をCLI中心に再設計
- 入力ルートを4つに統一（YouTube, SRT/VTT, 動画, transcript.json）

### Security

- .env ファイルのAPI キー管理
- 権利・許諾に関するガイドライン（台本オリジナル化必須）

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 0.1.0 | 2025-12-31 | Initial release |

[Unreleased]: https://github.com/taiyousan15/videojson2/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/taiyousan15/videojson2/releases/tag/v0.1.0
