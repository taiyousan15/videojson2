# レンダリング仕様（render.json → mp4）

このドキュメントは、render.json から最終的な mp4 動画を生成するまでの仕様を定義します。

## 1. 全体フロー

```
render.json
    ↓
[materialize-render] → render.materialized.json
    ↓                    （アセットパス解決済み）
[render-ffmpeg]
    ↓
output.mp4
```

## 2. materialize-render（アセット解決）

### 入力
- `render.json`: 論理的なアセット参照を含むレンダープラン
- `assets/` ディレクトリ: 実際のファイル群

### 処理
1. `assets[]` 配列の各アセットについて、`uri` を実ファイルパスに解決
2. `segments[].audio.script` が `tts` モードの場合、音声ファイル生成（または事前生成済みを参照）
3. 解決できないアセットがあればエラー

### 出力
- `render.materialized.json`: 全アセットが絶対パスで解決済み

### アセット解決ルール

| uri プレフィックス | 解決方法 |
|-------------------|----------|
| `file://` | ローカルファイルパス |
| `gs://` | GCS からダウンロード（本番用） |
| `asset:` | `assets/{asset_id}.*` を検索 |
| 相対パス | プロジェクトルートからの相対パス |

## 3. render-ffmpeg（動画生成）

### 入力
- `render.materialized.json`: アセット解決済みのレンダープラン

### 処理

#### 3.1 セグメント単位の処理

各セグメントについて以下を実行：

```
segment → [video処理] → segment_video.mp4
        → [audio処理] → segment_audio.mp3
        → [合成] → segment_final.mp4
```

#### 3.2 video.mode 別の処理

| mode | 処理 |
|------|------|
| `reuse_original` | source.asset_id の動画から in_ms〜out_ms を切り出し |
| `static_image` | 画像を duration_ms 分の動画に変換 |
| `generate` | （将来）動画生成AIで生成 |

#### 3.3 audio.mode 別の処理

| mode | 処理 |
|------|------|
| `use_original` | 元動画の音声をそのまま使用 |
| `tts` | TTS プロバイダーで script から音声生成 |
| `uploaded` | asset_id で指定されたファイルを使用 |
| `voice_conversion` | 音声変換プロバイダーで変換 |

#### 3.4 overlay 処理

- `captions.enabled: true` → 字幕焼き込み
- `telops[]` → テロップ描画

#### 3.5 最終結合

```bash
ffmpeg -f concat -i segments.txt -c copy output.mp4
```

### 出力
- `output.mp4`: 最終動画ファイル

## 4. FFmpeg コマンド例

### 動画切り出し（reuse_original）
```bash
ffmpeg -ss {in_ms/1000} -i {source} -t {duration_ms/1000} -c copy segment.mp4
```

### 静止画→動画（static_image）
```bash
ffmpeg -loop 1 -i {image} -t {duration_ms/1000} -vf "scale={width}:{height}" \
  -c:v libx264 -pix_fmt yuv420p segment.mp4
```

### 音声差し替え
```bash
ffmpeg -i segment_video.mp4 -i {audio} -map 0:v -map 1:a \
  -c:v copy -c:a aac segment_final.mp4
```

### セグメント結合
```bash
# segments.txt:
# file 'segment_s01.mp4'
# file 'segment_s02.mp4'
ffmpeg -f concat -safe 0 -i segments.txt -c copy output.mp4
```

## 5. エラーハンドリング

| エラー | 対応 |
|--------|------|
| アセット見つからない | materialize で検出、早期エラー |
| FFmpeg 失敗 | セグメント単位でリトライ可能 |
| 出力サイズ不一致 | scale フィルタで統一 |

## 6. smoke テスト

開発中は `npm run render:smoke` で最小構成のテストを実行：

1. `examples/smoke/` にダミーアセットを生成
2. materialize-render 実行
3. render-ffmpeg 実行（実際に mp4 生成）
4. 出力ファイルの存在確認

## 7. キャッシュ機能

### 概要

TTS などのコストがかかる処理は、同じ入力に対してキャッシュを利用します。

### キャッシュキーの生成

以下の要素から sha256 ハッシュを生成：
- プロバイダー名（dummy / elevenlabs）
- 入力テキスト
- voice_id
- language
- その他の設定（model, stability など）

### キャッシュディレクトリ

```
{workdir}/cache/
└── tts/
    ├── {hash1}.mp3
    └── {hash2}.mp3
```

### 動作

1. materialize-render 実行時にキャッシュキーを計算
2. キャッシュに存在すれば再利用（`[Cache] HIT`）
3. 存在しなければ生成してキャッシュに保存（`[Cache] MISS`）

### キャッシュの削除

```bash
rm -rf .tmp/cache/
```

## 8. CI/CD での設計

### 外部 API を呼ばない設計

CI 環境では外部 API（TTS、Lipsync など）を呼びません。

- `VIDEOJSON_TTS_PROVIDER=dummy` で無音音声を生成
- API キー未設定時は自動的に dummy にフォールバック
- smoke テストは常に成功する（API 依存なし）

### 環境変数

```bash
# CI 環境（デフォルト）
VIDEOJSON_TTS_PROVIDER=dummy

# 本番環境
VIDEOJSON_TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=your_key
```

## 8. 将来拡張

- **TTS 統合**: ElevenLabs API 呼び出し
- **Lipsync 統合**: ComfyUI/Hedra 呼び出し
- **並列処理**: セグメント単位で並列 FFmpeg 実行
- **Cloud Run Job**: 長時間レンダリングの非同期実行
