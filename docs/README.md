# VideoJSON ドキュメント

VideoJSON のドキュメント一覧です。

## 初めての方へ

| ドキュメント | 説明 |
|-------------|------|
| [クイックスタート](./quickstart.md) | 3ステップで動画を生成 |
| [トラブルシューティング](./troubleshooting.md) | よくある問題と解決方法 |

## 設定・カスタマイズ

| ドキュメント | 説明 |
|-------------|------|
| [設定ガイド](./config.md) | 環境変数とプロバイダー設定 |
| [レンダリング](./rendering.md) | 詳細なレンダリングオプション |
| [プロバイダー](./providers.md) | TTS/リップシンクなどのプロバイダー設定 |

## 開発者向け

| ドキュメント | 説明 |
|-------------|------|
| [リリースチェックリスト](./release-checklist.md) | リリース前の確認項目 |
| [要件定義](./requirements.md) | システム要件と設計思想 |
| [仕様書](./spec.md) | 詳細な技術仕様 |

## 権利・安全性

| ドキュメント | 説明 |
|-------------|------|
| [安全・同意](./safety-consent.md) | 権利・プライバシーに関するガイドライン |

---

## クイックリンク

- [README（トップ）](../README.md)
- [CHANGELOG](../CHANGELOG.md)
- [コマンド一覧](./quickstart.md#コマンド一覧)

## コマンドリファレンス

### プロジェクト管理（推奨）

```bash
# 環境チェック
npm run doctor

# プロジェクト作成
npm run project:create -- --subtitles input.srt --out myproject

# 動画生成
npm run project:run -- --project myproject

# 複数プリセット一括生成
npm run project:variants -- --project myproject
```

### CLI コマンド

```bash
# ヘルプ
node scripts/cli/videojson.mjs --help

# 各サブコマンド
node scripts/cli/videojson.mjs doctor
node scripts/cli/videojson.mjs create --subtitles input.srt --out myproject
node scripts/cli/videojson.mjs run --project myproject
node scripts/cli/videojson.mjs variants --project myproject
node scripts/cli/videojson.mjs preview --project myproject
node scripts/cli/videojson.mjs validate --project myproject
```

### 検証・ユーティリティ

```bash
# 厳格な検証
npm run validate:strict -- --project myproject

# HTMLプレビュー
npm run preview:html -- --project myproject
```

---

## サポート

- [GitHub Issues](https://github.com/taiyousan15/videojson2/issues) で質問・報告
- `npm run doctor` で環境を確認してからの問い合わせがスムーズです
