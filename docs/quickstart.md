# VideoJSON クイックスタート

このガイドでは、VideoJSON を使って動画を生成するまでの基本フローを説明します。

## 前提条件

- Node.js 20 以上
- ffmpeg がインストールされていること

```bash
npm install
```

### 環境チェック

セットアップに問題がないか確認できます：

```bash
npm run doctor
```

---

## ゼロから始める: project:create（推奨）

`project:create` は入力ソースからプロジェクトを一発で作成する統一コマンドです。

### 入力ルートを選ぶ

| 入力ソース | コマンド例 |
|-----------|-----------|
| YouTube URL | `--youtube-url "https://..."` |
| SRT/VTT 字幕 | `--subtitles input.srt` |
| ローカル動画 | `--video input.mp4` |
| transcript.json | `--transcript data.json` |

### Step 1: プロジェクトを作成

```bash
# SRT字幕から作成（ネット不要・初心者向け）
npm run project:create -- --subtitles input.srt --out myproject --preset default

# YouTube から作成
npm run project:create -- --youtube-url "https://youtube.com/watch?v=..." --out myproject

# ローカル動画から作成（Whisper必要）
npm run project:create -- --video input.mp4 --out myproject --language ja

# transcript.json から作成（CI向け）
npm run project:create -- --transcript data.json --out myproject
```

### Step 2: 台本を編集

`myproject/narration.md` を開いて、`TODO` の部分を実際の台本に置き換えます。

```markdown
## s01
[話者: host]
こんにちは、今回の動画では〇〇について解説します。
```

### Step 3: 動画を生成

```bash
npm run project:run -- --project myproject
```

これで `myproject/outputs/output.mp4` に動画が生成されます。

---

## 量産: project:variants

1つのプロジェクトから複数フォーマットの動画を一括生成できます。

```bash
# 全プリセット（default, vertical-short, youtube-16x9）で生成
npm run project:variants -- --project myproject

# 特定のプリセットのみ
npm run project:variants -- --project myproject --presets "vertical-short,youtube-16x9"
```

出力先:
- `myproject/outputs/default/output.mp4`
- `myproject/outputs/vertical-short/output.mp4`
- `myproject/outputs/youtube-16x9/output.mp4`

---

## 困ったら: doctor

環境の問題を診断して対処法を案内します。

```bash
npm run doctor
```

詳しいトラブルシューティングは [troubleshooting.md](./troubleshooting.md) を参照してください。

---

## 従来のワークフロー: project:init

手動でプロジェクトを初期化したい場合は `project:init` を使います：

```bash
npm run project:init -- --dir myproject --preset vertical-short
```

---

## どのルートを選ぶ？

| あなたの状況 | 選ぶルート |
|-------------|-----------|
| YouTube動画のリンクがある | **ルート A** |
| SRT/VTT 字幕ファイルがある | **ルート B** |
| ローカルに動画ファイルがある | **ルート C** |

---

## ルート A: YouTube字幕あり

**フロー**: `YouTube URL` → `structure.json` → `narration.md` → `output.mp4`

### Step 1: YouTube動画を分析

```bash
npm run analyze:youtube -- \
  --url "https://www.youtube.com/watch?v=VIDEO_ID" \
  --out myproject/structure.json
```

**字幕が取得できない場合**: ルート B または C を試してください。

### Step 2: 台本の骨組みを生成

```bash
npm run narration:skeleton -- \
  --structure myproject/structure.json \
  --out myproject/narration.md
```

### Step 3: 台本を編集

`myproject/narration.md` を開いて、`TODO` の部分を実際の台本に置き換えます。

```markdown
## s01
[話者: host]
こんにちは、今回の動画では〇〇について解説します。

## s02
[話者: host]
まず最初に、基本的な概念を説明しましょう。
```

### Step 4: 動画を生成

```bash
npm run render:run -- \
  --structure myproject/structure.json \
  --narration myproject/narration.md \
  --out myproject/output.mp4
```

---

## ルート B: SRT/VTT字幕あり

**フロー**: `SRT/VTT` → `transcript.json` → `structure.json` → `narration.md` → `output.mp4`

### Step 1: 字幕を transcript.json に変換

```bash
npm run transcript:convert -- \
  --in subtitles.srt \
  --out myproject/transcript.json \
  --language ja
```

### Step 2: 構造を生成

```bash
npm run analyze:transcript -- \
  --transcript myproject/transcript.json \
  --out myproject/structure.json
```

### Step 3-4: 台本作成と動画生成

ルート A の Step 2-4 と同じです。

```bash
# 骨組み生成
npm run narration:skeleton -- \
  --structure myproject/structure.json \
  --out myproject/narration.md

# 台本を編集（エディタで開く）

# 動画生成
npm run render:run -- \
  --structure myproject/structure.json \
  --narration myproject/narration.md \
  --out myproject/output.mp4
```

---

## ルート C: ローカル動画あり

**フロー**: `video.mp4` → `transcript.json` → `structure.json` → `narration.md` → `output.mp4`

**必要**: Whisper がインストールされていること

### Step 1: 動画を分析（Whisper使用）

```bash
npm run analyze:video -- \
  --video video.mp4 \
  --out myproject/structure.json \
  --language ja
```

**Whisperが無い場合**: インストール手順が表示されます。

### Step 2-4: 台本作成と動画生成

ルート A の Step 2-4 と同じです。

---

## 補足: 字幕の入手方法

### yt-dlp で字幕をダウンロード

```bash
# 字幕ファイルのみダウンロード
yt-dlp --write-auto-sub --sub-lang ja --skip-download "<URL>"

# その後、ルート B で処理
npm run transcript:convert -- --in "*.ja.vtt" --out transcript.json
```

### Whisper で文字起こし

```bash
# インストール（Python）
pip install openai-whisper

# 実行
npm run analyze:video -- --video video.mp4 --out structure.json
```

---

## コマンド一覧

### プロジェクト管理（推奨）

| コマンド | 説明 |
|----------|------|
| `npm run project:create` | 入力ソースから一発でプロジェクト作成 |
| `npm run project:run` | プロジェクトから動画を生成 |
| `npm run project:variants` | 複数プリセットで一括生成 |
| `npm run project:init` | 空のプロジェクトを初期化（手動用） |

### 分析・変換

| コマンド | 説明 |
|----------|------|
| `npm run analyze:youtube` | YouTube → structure.json |
| `npm run analyze:video` | ローカル動画 → structure.json（Whisper使用） |
| `npm run analyze:transcript` | transcript.json → structure.json |
| `npm run transcript:convert` | SRT/VTT → transcript.json |

### 台本・レンダリング

| コマンド | 説明 |
|----------|------|
| `npm run narration:skeleton` | structure.json → narration.md（骨組み） |
| `npm run narration:generate` | structure.json → narration.md（AI生成、APIキー必要） |
| `npm run render:run` | structure + narration → mp4 |

### 検証・ユーティリティ

| コマンド | 説明 |
|----------|------|
| `npm run doctor` | 環境チェックと問題診断 |
| `npm run validate` | スキーマ検証 |
| `npm run validate:strict` | 厳格な一括検証 |
| `npm run preview:html` | HTMLプレビュー生成 |
| `npm run render:smoke` | スモークテスト |

---

## 次のステップ

- [設定ガイド](./config.md): 環境変数とプロバイダー設定
- [レンダリングガイド](./rendering.md): 詳細なレンダリングオプション
- [プロバイダーガイド](./providers.md): TTS/リップシンクなどの設定

---

## トラブルシューティング

### Q: YouTube字幕の取得に失敗する

- 動画に字幕が設定されていない → ルート B または C を使用
- 地域制限や年齢制限がある → ルート C を使用

### Q: Whisper がインストールされていない

```bash
# Python 版をインストール
pip install openai-whisper

# または Homebrew（macOS）
brew install whisper-cpp
```

### Q: ffmpeg が見つからない

```bash
# macOS
brew install ffmpeg

# Ubuntu
sudo apt-get install ffmpeg
```

### Q: "No TTS segments found" と表示される

- render.json で `audio.mode: "tts"` を使用していますか？
- `audio.mode: "uploaded"` の場合は TTS は使用されません
