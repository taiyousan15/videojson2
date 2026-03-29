# プロバイダー設計メモ（Worker/TTS/Lipsync）

このドキュメントは、次のフェーズ（音声生成・リップシンク・レンダリング）の実装方針をまとめたものです。

## 1. TTS（Text-to-Speech）

### 推奨プロバイダー

| プロバイダー | 特徴 | 用途 |
|-------------|------|------|
| **ElevenLabs** | 高品質、日本語対応、音声クローン可 | メイン |
| Google Cloud TTS | 安定、低コスト | バックアップ |
| OpenAI TTS | シンプル、API統合しやすい | 軽量用途 |

### 環境変数

```bash
ELEVENLABS_API_KEY=your_api_key
ELEVENLABS_VOICE_ID=your_voice_id
```

### 生成物の保存先

```
projects/{projectId}/assets/audio/
├── s01.mp3
├── s02.mp3
└── ...
```

### render.json での指定

```json
{
  "providers": {
    "tts": {
      "provider": "elevenlabs",
      "voice_id": "your_voice_id",
      "language": "ja"
    }
  },
  "segments": [
    {
      "audio": {
        "mode": "tts",
        "script": "台本テキスト"
      }
    }
  ]
}
```

---

## 2. 音声変換（Voice Conversion）

### 推奨プロバイダー

| プロバイダー | 特徴 | 用途 |
|-------------|------|------|
| **ElevenLabs Voice Cloning** | 高品質、許諾確認あり | メイン |
| RVC (Retrieval-based Voice Conversion) | ローカル実行可 | コスト削減 |

### 環境変数

```bash
# ElevenLabs の場合は TTS と共通
ELEVENLABS_API_KEY=your_api_key
```

### 重要な注意（権利）

- **本人の声のみ使用可能**（第三者の声の模倣は禁止）
- 音声サンプルのアップロード時に許諾確認を表示する

---

## 3. リップシンク（Lipsync）

### 推奨プロバイダー

| プロバイダー | 特徴 | 用途 |
|-------------|------|------|
| **Hedra** | 高品質、API提供 | クラウド実行 |
| **ComfyUI + SadTalker** | ローカル実行、カスタマイズ可 | 低コスト |
| Wav2Lip | オープンソース、軽量 | 軽量用途 |

### ComfyUI ワークフロー（推奨）

```
projects/{projectId}/workflows/
├── lipsync_sadtalker.json
└── lipsync_hedra.json
```

### render.json での指定

```json
{
  "providers": {
    "lipsync": {
      "provider": "comfyui",
      "workflow": "lipsync_sadtalker",
      "strength": 0.8
    }
  },
  "segments": [
    {
      "audio": {
        "mode": "tts",
        "lipsync": {
          "enabled": true,
          "target_face_image_asset_id": "face01"
        }
      }
    }
  ]
}
```

### 重要な注意（権利）

- **本人の顔画像のみ使用可能**（第三者の顔の模倣は禁止）
- 顔画像アップロード時に許諾確認を表示する

---

## 4. 動画生成（Video Generation）

### 推奨プロバイダー

| プロバイダー | 特徴 | 用途 |
|-------------|------|------|
| **ComfyUI + AnimateDiff** | ローカル実行、柔軟 | アニメ風 |
| Runway Gen-2 | 高品質、クラウド | 実写風 |
| Pika Labs | 手軽、低コスト | プロトタイプ |

### render_mode との対応

| render_mode | 主な処理 |
|-------------|---------|
| `remix` | 元動画の映像を切り出し・再構成 |
| `generative` | 動画生成プロバイダーで全生成 |
| `hybrid` | 一部 remix + 一部 generative |

---

## 5. Worker 統合方針

### アーキテクチャ

```
[Next.js API] → [Cloud Tasks Queue] → [Worker]
                                         ↓
                               [Provider API / ComfyUI]
                                         ↓
                               [GCS: assets/output/]
```

### ジョブタイプ

| ジョブ | 入力 | 出力 |
|--------|------|------|
| `GENERATE_AUDIO` | narration.md + segment_id | audio/s01.mp3 |
| `GENERATE_LIPSYNC` | audio + face_image | video/s01_lipsync.mp4 |
| `RENDER_SEGMENT` | render.json + segment_id | video/s01.mp4 |
| `ASSEMBLE` | video/*.mp4 | output/final.mp4 |

---

## 6. 初心者向け設定手順

### 最小構成（TTS のみ）

1. ElevenLabs でアカウント作成
2. API キーを取得
3. `.env` に設定:
   ```
   ELEVENLABS_API_KEY=your_api_key
   ```
4. render.json の `audio.mode` を `tts` に設定
5. `npm run render:generate` で render.json を生成

### 拡張構成（TTS + Lipsync）

1. 上記に加えて ComfyUI をローカルにセットアップ
2. SadTalker ワークフローをインポート
3. `.env` に追加:
   ```
   COMFYUI_URL=http://localhost:8188
   ```
4. render.json の `lipsync.enabled` を `true` に設定

---

## 7. コスト目安（参考）

| 処理 | プロバイダー | 目安コスト |
|------|-------------|-----------|
| TTS 1分 | ElevenLabs | $0.30 |
| Lipsync 1分 | Hedra | $0.50 |
| 動画生成 10秒 | Runway | $0.40 |

**コスト削減のヒント**:
- ローカル ComfyUI を使う（GPU必要）
- キャッシュを活用する（同じ台本は再生成しない）
- 短いセグメントで分割して失敗時の再生成コストを抑える

---

## 8. CI/CD での設計方針

### 外部 API を呼ばない設計

**重要**: CI 環境では外部 API（TTS、Lipsync、動画生成など）を呼びません。

```yaml
# GitHub Actions での設定
env:
  VIDEOJSON_TTS_PROVIDER: dummy
```

### フォールバック動作

| 状況 | 動作 |
|------|------|
| `VIDEOJSON_TTS_PROVIDER=dummy` | 無音音声を生成 |
| API キー未設定 | 自動的に dummy にフォールバック |
| API 呼び出し失敗 | エラーログ後に dummy にフォールバック |

### 本番との切り替え

```bash
# CI（API呼び出しなし）
VIDEOJSON_TTS_PROVIDER=dummy npm run render:smoke

# 本番（実API呼び出し）
VIDEOJSON_TTS_PROVIDER=elevenlabs npm run render:run ...
```

### 手動テスト手順（ローカルで ElevenLabs API を試す場合）

1. `.env` に API キーを設定：
   ```bash
   ELEVENLABS_API_KEY=your_api_key
   ELEVENLABS_VOICE_ID=your_voice_id  # オプション
   ```

2. TTS を使う render.json を用意（`audio.mode: "tts"` のセグメントを含む）

3. 以下を実行：
   ```bash
   VIDEOJSON_TTS_PROVIDER=elevenlabs npm run render:materialize -- \
     --render examples/smoke/render_tts.json
   ```

4. 生成された音声ファイルを確認：
   ```bash
   ls -la examples/smoke/.tmp/audio/
   # または
   afplay examples/smoke/.tmp/audio/s01_tts.mp3  # macOS
   ```

### ElevenLabs 設定オプション

render.json の `providers.tts` で以下を設定可能：

```json
{
  "providers": {
    "tts": {
      "provider": "elevenlabs",
      "voice_id": "21m00Tcm4TlvDq8ikWAM",
      "language": "ja",
      "model": "eleven_multilingual_v2",
      "stability": 0.5,
      "similarity_boost": 0.75
    }
  }
}
```

| 設定 | 説明 | デフォルト |
|------|------|-----------|
| `voice_id` | 音声ID | Rachel (21m00Tcm4TlvDq8ikWAM) |
| `model` | モデル | eleven_multilingual_v2 |
| `stability` | 安定性 (0-1) | 0.5 |
| `similarity_boost` | 類似度 (0-1) | 0.75 |

---

次の実装では、このドキュメントを参照しながら Worker とプロバイダー接続を進めてください。
