# 安全性と許諾に関するガイドライン

このドキュメントは、VideoJSON を使用する際の安全性と許諾に関する必須要件を定義します。

## 1. 基本原則

### 本人素材のみ使用可能

- **音声素材**: 本人の声、または明確な許諾を得た素材のみ使用可能
- **顔画像素材**: 本人の顔、または明確な許諾を得た素材のみ使用可能
- **第三者のなりすまし**: 明確な許可がない限り禁止

### 禁止事項

| 行為 | 理由 |
|------|------|
| 第三者の声の模倣 | 肖像権・パブリシティ権侵害 |
| 第三者の顔の模倣 | 肖像権・プライバシー侵害 |
| 無断での AI 音声クローン | 倫理的・法的問題 |
| 無断での顔画像利用 | 肖像権侵害 |

## 2. 許諾の記録方法

### asset メタデータに consent フラグを設定

```json
{
  "assets": [
    {
      "id": "my_voice",
      "type": "audio",
      "uri": "assets/voice_sample.mp3",
      "meta": {
        "consent": true,
        "consent_type": "self",
        "consent_date": "2025-01-01"
      }
    },
    {
      "id": "my_face",
      "type": "image",
      "uri": "assets/face.jpg",
      "meta": {
        "consent": true,
        "consent_type": "self",
        "consent_date": "2025-01-01"
      }
    }
  ]
}
```

### consent_type の種類

| 値 | 意味 |
|----|------|
| `self` | 本人の素材 |
| `written` | 書面による許諾あり |
| `verbal` | 口頭での許諾あり（要記録） |

### consent_scope の指定（オプション）

特定の用途に対する許諾を明示的に記録できます：

```json
{
  "id": "avatar_face",
  "type": "image",
  "uri": "assets/avatar.png",
  "meta": {
    "consent": true,
    "consent_scope": ["lipsync", "general"]
  }
}
```

| スコープ | 意味 |
|---------|------|
| `lipsync` | リップシンク動画生成に使用可能 |
| `voice_conversion` | 音声変換に使用可能 |
| `general` | 一般的な用途に使用可能 |

## 2.5. Lipsync 特有の要件

### 顔画像アセットの consent 必須

`video.mode="lipsync"` を使用する場合、`face_asset_id` で参照されるアセットには **必ず** `meta.consent=true` が必要です。

```json
{
  "segments": [
    {
      "id": "s01",
      "video": {
        "mode": "lipsync",
        "lipsync": {
          "face_asset_id": "avatar_face"
        }
      }
    }
  ],
  "assets": [
    {
      "id": "avatar_face",
      "type": "image",
      "uri": "assets/avatar.png",
      "meta": {
        "consent": true,
        "consent_scope": ["lipsync"]
      }
    }
  ]
}
```

### watermark による生成物の識別

デフォルトで lipsync 生成動画には「AI Generated」の透かしが入ります。これにより：

- ディープフェイクとの区別が可能
- 視聴者への透明性確保
- 悪用の抑止

透かしを無効にする場合は、運用ポリシーで別途管理が必要です。

## 3. バリデーション

### validate:policy コマンド

`lipsync` や `voice_conversion` を使用する場合、対象アセットに `meta.consent=true` が必要です。

```bash
npm run validate:policy -- --render render.json
```

### エラー例

```
❌ Policy validation errors:
   - Asset "face01" used for lipsync but missing meta.consent=true
   - Asset "voice01" used for voice_conversion but missing meta.consent=true
```

## 4. 運用フロー

### 1. 素材準備

1. 本人の音声/顔画像を用意
2. 第三者の素材は明確な許諾を取得
3. 許諾情報を記録

### 2. render.json 作成

1. 使用する素材を `assets[]` に登録
2. `meta.consent: true` を設定
3. 必要に応じて `consent_type` と `consent_date` を追加

### 3. バリデーション

1. `npm run validate` でスキーマチェック
2. `npm run validate:policy` で許諾チェック
3. 問題があれば修正

### 4. レンダリング

1. バリデーションが通った後にのみレンダリング
2. 出力物にも許諾情報を保持（将来機能）

## 5. 法的注意事項

### 日本国内での注意点

- 肖像権: 本人の承諾なく顔写真を公開・利用することは違法となる可能性
- パブリシティ権: 著名人の顔・名前を商業利用する場合は許諾が必要
- 個人情報保護法: 顔画像は個人情報に該当する可能性

### グローバルでの注意点

- GDPR（EU）: バイオメトリクスデータとして厳格な規制
- 各国の肖像権法: 国によって規制が異なる

## 6. 免責事項

- このシステムは許諾確認の仕組みを提供しますが、実際の許諾取得はユーザーの責任です
- `meta.consent=true` の設定は、ユーザーが許諾を取得したことを宣言するものです
- システムは許諾の真正性を検証しません

---

**重要**: このガイドラインに従わない利用は、法的リスクを伴う可能性があります。
不明な点がある場合は、法律の専門家に相談してください。
