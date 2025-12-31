# Lipsync (リップシンク) 機能

VideoJSON の Lipsync 機能を使用すると、静止画像の顔画像と音声から、口パクする動画を生成できます。

## 概要

Lipsync は以下のワークフローで動作します：

1. **顔画像の準備** - アバターとして使用する顔画像を用意
2. **許諾の確認** - 顔画像の使用許諾を確認（必須）
3. **render.json の設定** - `video.mode: "lipsync"` を指定
4. **動画生成** - materialize-render がプロバイダーを呼び出して動画生成

## クイックスタート

### 1. プロジェクト作成時にアバターを設定

```bash
npm run project:create -- \
  --subtitles input.srt \
  --out myproject \
  --avatar my_face.jpg \
  --avatar-consent
```

### 2. render.json の生成（lipsync モード）

```bash
npm run generate:render -- \
  --structure myproject/structure.json \
  --narration myproject/narration.md \
  --out myproject/render.json \
  --config myproject/config.json \
  --lipsync
```

### 3. 動画の生成

```bash
npm run render:materialize -- \
  --render myproject/render.json \
  --out myproject/render.materialized.json \
  --lipsync-provider dummy
```

## render.json スキーマ

### 基本構造

```json
{
  "segments": [
    {
      "id": "s01",
      "duration_ms": 5000,
      "video": {
        "mode": "lipsync",
        "lipsync": {
          "face_asset_id": "avatar_face",
          "provider": "dummy",
          "watermark": {
            "enabled": true,
            "text": "AI Generated"
          }
        }
      },
      "audio": {
        "mode": "tts",
        "script": "こんにちは、テスト動画です。"
      }
    }
  ],
  "assets": [
    {
      "id": "avatar_face",
      "type": "image",
      "uri": "assets/face.png",
      "meta": {
        "consent": true,
        "consent_type": "self",
        "consent_date": "2025-01-01",
        "consent_scope": ["lipsync"]
      }
    }
  ]
}
```

### video.lipsync プロパティ

| プロパティ | 型 | 必須 | 説明 |
|-----------|----|----|------|
| `face_asset_id` | string | Yes | 顔画像アセットのID |
| `provider` | string | No | プロバイダー名（デフォルト: "dummy"） |
| `crop` | string | No | クロップモード: "center", "fit", "fill" |
| `watermark.enabled` | boolean | No | 透かしを有効化（デフォルト: true） |
| `watermark.text` | string | No | 透かしテキスト（デフォルト: "AI Generated"） |

## プロバイダー

### dummy プロバイダー

開発・CI環境用のダミープロバイダーです。

- **機能**: 静止画 + Ken Burns エフェクト + 透かし
- **依存**: ffmpeg のみ
- **ネットワーク**: 不要
- **用途**: 開発、CI/CD、パイプライン検証

```bash
# dummy プロバイダーを使用
npm run render:materialize -- \
  --render render.json \
  --lipsync-provider dummy
```

### 環境変数

```bash
# デフォルトプロバイダーの設定
VIDEOJSON_LIPSYNC_PROVIDER=dummy

# HTTP プロバイダー用（将来）
LIPSYNC_HTTP_ENDPOINT=http://localhost:8080/lipsync
```

## 許諾（Consent）について

### 必須要件

Lipsync 機能を使用するには、顔画像アセットに `meta.consent: true` が必須です。

```json
{
  "id": "avatar_face",
  "type": "image",
  "uri": "assets/face.png",
  "meta": {
    "consent": true,
    "consent_type": "self",
    "consent_scope": ["lipsync"]
  }
}
```

### consent_type の種類

| 値 | 意味 |
|----|------|
| `self` | 本人の素材 |
| `written` | 書面による許諾あり |
| `verbal` | 口頭での許諾あり（要記録） |

### バリデーション

許諾がない場合、ポリシーバリデーションでエラーになります：

```bash
npm run validate:policy -- --render render.json

# 出力例（エラー）
❌ Policy validation errors:
   - Segment "s01": Asset "avatar_face" used for lipsync requires meta.consent=true
```

## 透かし（Watermark）

デフォルトで生成される動画には「AI Generated」の透かしが入ります。

### 目的

- ディープフェイクとの区別
- 視聴者への透明性確保
- 悪用の抑止

### カスタマイズ

```json
{
  "video": {
    "mode": "lipsync",
    "lipsync": {
      "face_asset_id": "avatar_face",
      "watermark": {
        "enabled": true,
        "text": "AI Generated Video"
      }
    }
  }
}
```

### 透かしの無効化

透かしを無効にする場合は、運用ポリシーで別途管理が必要です：

```json
{
  "watermark": {
    "enabled": false
  }
}
```

## 診断

`npm run doctor` で Lipsync プロバイダーの状態を確認できます：

```bash
npm run doctor

# 出力例
✅ Lipsync Provider: dummy（開発モード）
   静止画 + Ken Burns エフェクトで疑似リップシンクを生成します
```

## テスト

### E2E テスト

```bash
npm run test:lipsync
```

### 手動テスト

```bash
# examples/lipsync ディレクトリでテスト
node scripts/materialize-render.mjs \
  --render examples/lipsync/render.json \
  --out examples/lipsync/render.materialized.json \
  --lipsync-provider dummy
```

## トラブルシューティング

### エラー: "Asset used for lipsync requires meta.consent=true"

顔画像アセットに `meta.consent: true` を追加してください。

### エラー: "Face image not found"

`face_asset_id` で参照されているアセットのパスが正しいか確認してください。

### エラー: "ffmpeg is not installed"

ffmpeg をインストールしてください：

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg
```

## 将来の拡張

- **HTTP プロバイダー**: 外部 API との連携
- **ローカル CLI プロバイダー**: ローカルの AI モデルとの連携
- **キャッシュの改善**: より効率的なキャッシュ戦略
- **顔検出**: 自動顔位置検出とクロップ

## 関連ドキュメント

- [安全性と許諾に関するガイドライン](./safety-consent.md)
- [render.json スキーマ](../schemas/render.schema.json)
