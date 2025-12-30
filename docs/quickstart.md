# VideoJSON クイックスタート

このガイドでは、VideoJSON を使って動画を生成するまでの基本フローを説明します。

## 前提条件

- Node.js 20 以上
- ffmpeg がインストールされていること

```bash
npm install
```

---

## フロー A: YouTube動画から構造を抽出して制作

### Step 1: YouTube動画を分析

```bash
npm run analyze:youtube -- --url "https://www.youtube.com/watch?v=VIDEO_ID" --out myproject/structure.json
```

**注意**: YouTubeの字幕が取得できない場合は、[代替手段](#字幕が取得できない場合)を参照してください。

### Step 2: narration.md を作成

生成された `structure.json` を参考に、`narration.md` を作成します。

```bash
# 構造の確認
cat myproject/structure.json | jq '.segments[] | {id, type, summary}'

# narration.md を作成
touch myproject/narration.md
```

`narration.md` の書式:

```markdown
# s01
こんにちは、今回の動画では〇〇について解説します。

# s02
まず最初に、基本的な概念を説明しましょう。

# s03
ご視聴ありがとうございました。
```

**重要**:
- 各セグメントは `# s01` のようにセグメントIDで始めます
- セグメントIDは `structure.json` の `segments[].id` と一致させてください

### Step 3: 動画を生成

```bash
npm run render:run -- --structure myproject/structure.json --narration myproject/narration.md --out myproject/output.mp4
```

---

## フロー B: 既存の transcript から制作

すでに文字起こしデータがある場合:

### Step 1: transcript.json を準備

```json
{
  "schema_version": "1.0.0",
  "language": "ja",
  "items": [
    {"start_ms": 0, "end_ms": 5000, "text": "最初のテキスト"},
    {"start_ms": 5000, "end_ms": 10000, "text": "次のテキスト"}
  ]
}
```

### Step 2: 構造を生成

```bash
npm run analyze:transcript -- --transcript myproject/transcript.json --out myproject/structure.json
```

### Step 3: narration.md を作成して動画生成

フロー A の Step 2, 3 と同様です。

---

## フロー C: 最小限の手動制作

examples/smoke を参考に、ゼロから作成:

```bash
# サンプルをコピー
cp -r examples/smoke myproject

# 必要に応じて編集
# - structure.json: セグメント構成
# - render.json: レンダリング設定
# - narration.md: 台本
```

---

## 字幕が取得できない場合

YouTubeの字幕が取得できない場合の代替手段:

### 方法1: yt-dlp で字幕をダウンロード

```bash
# 字幕ファイルをダウンロード
yt-dlp --write-auto-sub --sub-lang ja --skip-download "https://www.youtube.com/watch?v=VIDEO_ID"

# 出力された .vtt や .srt を transcript.json に変換（手動）
```

### 方法2: Whisper で文字起こし

```bash
# 動画をダウンロード
yt-dlp -o video.mp4 "https://www.youtube.com/watch?v=VIDEO_ID"

# Whisper で文字起こし
whisper video.mp4 --language ja --output_format json

# 出力を transcript.json 形式に変換
```

### 方法3: 手動で transcript.json を作成

`examples/fixtures/transcript.sample.json` を参考に手動作成。

---

## コマンド一覧

| コマンド | 説明 |
|----------|------|
| `npm run analyze:youtube` | YouTube動画からstructure.jsonを生成 |
| `npm run analyze:transcript` | transcript.jsonからstructure.jsonを生成 |
| `npm run render:run` | structure + narration から mp4 を生成 |
| `npm run validate` | スキーマ検証 |
| `npm run render:smoke` | スモークテスト |

---

## 次のステップ

- [設定ガイド](./config.md): 環境変数とプロバイダー設定
- [レンダリングガイド](./rendering.md): 詳細なレンダリングオプション
- [プロバイダーガイド](./providers.md): TTS/リップシンクなどの設定

---

## トラブルシューティング

### Q: "No TTS segments found" と表示される

render.json で `audio.mode: "tts"` を使用していますか？
`audio.mode: "uploaded"` の場合は TTS は使用されません。

### Q: ffmpeg が見つからない

ffmpeg をインストールしてください:

```bash
# macOS
brew install ffmpeg

# Ubuntu
sudo apt-get install ffmpeg
```

### Q: YouTube字幕の取得に失敗する

- 動画に字幕が設定されていない可能性があります
- 地域制限や年齢制限がある可能性があります
- [代替手段](#字幕が取得できない場合)を試してください
