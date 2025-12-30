---
name: videojson_orchestrator
description: VideoJSON の作業フローを統括し、ユーザーの意図に応じて適切なスキルへ誘導する。
triggers:
  - "VideoJSON"
  - "動画制作"
  - "何から始めれば"
  - "フローを教えて"
  - "使い方"
  - "字幕"
  - "ローカル動画"
  - "SRT"
  - "VTT"
inputs:
  - ユーザーの質問/要望
outputs:
  - 適切なスキルへの誘導、または直接の回答
---

# VideoJSON オーケストレーター

このスキルは VideoJSON の「入り口」です。
ユーザーの意図を分類し、適切な専門スキルへ誘導します。

## クイックルート選択

| ユーザーの状況 | 案内するルート |
|---------------|---------------|
| YouTubeリンクがある | **ルート A** |
| SRT/VTT字幕がある | **ルート B** |
| ローカル動画がある | **ルート C** |
| 台本を早く作りたい | **narration:skeleton** |

---

## ルート A: YouTube字幕あり

キーワード: 「YouTube」「リンク」「URL」

```bash
# Step 1: YouTube → structure.json
npm run analyze:youtube -- --url "<URL>" --out structure.json

# Step 2: 骨組み生成
npm run narration:skeleton -- --structure structure.json --out narration.md

# Step 3: 台本を編集（エディタで開く）

# Step 4: 動画生成
npm run render:run -- --structure structure.json --narration narration.md --out output.mp4
```

**字幕が取得できない場合**: ルート B または C を案内する。

---

## ルート B: SRT/VTT字幕あり

キーワード: 「SRT」「VTT」「字幕ファイル」「yt-dlp」

```bash
# Step 1: SRT/VTT → transcript.json
npm run transcript:convert -- --in subtitles.srt --out transcript.json --language ja

# Step 2: transcript → structure.json
npm run analyze:transcript -- --transcript transcript.json --out structure.json

# Step 3-4: ルート A と同じ
npm run narration:skeleton -- --structure structure.json --out narration.md
# 台本を編集
npm run render:run -- --structure structure.json --narration narration.md --out output.mp4
```

**字幕の入手方法**:
```bash
# yt-dlp で字幕をダウンロード
yt-dlp --write-auto-sub --sub-lang ja --skip-download "<URL>"
```

---

## ルート C: ローカル動画あり

キーワード: 「ローカル動画」「mp4」「Whisper」「文字起こし」

```bash
# Step 1: 動画 → structure.json（Whisper使用）
npm run analyze:video -- --video video.mp4 --out structure.json --language ja

# Step 2-4: ルート A と同じ
npm run narration:skeleton -- --structure structure.json --out narration.md
# 台本を編集
npm run render:run -- --structure structure.json --narration narration.md --out output.mp4
```

**Whisperがない場合**:
スクリプトがインストール手順を表示します。
```bash
# Python版
pip install openai-whisper

# macOS
brew install whisper-cpp
```

---

## 台本を早く作りたい

キーワード: 「台本」「narration」「スクリプト」「ナレーション」

### 骨組み生成（手動編集用）

```bash
npm run narration:skeleton -- --structure structure.json --out narration.md
```

### AI自動生成（APIキー必要）

```bash
# OpenAI
OPENAI_API_KEY=xxx npm run narration:generate -- --structure structure.json --out narration.md

# Anthropic
ANTHROPIC_API_KEY=xxx npm run narration:generate -- --structure structure.json --out narration.md --provider anthropic
```

---

## 動画を生成したい

キーワード: 「mp4」「動画生成」「レンダリング」「render:run」

```bash
npm run render:run -- \
  --structure structure.json \
  --narration narration.md \
  --out output.mp4
```

このコマンドは以下を自動実行:
1. narration.md と structure.json の整合性チェック
2. render.json の自動生成
3. アセットの解決とマテリアライズ
4. ffmpeg でのmp4レンダリング

---

## 重要なルール

- **1つずつ確認しながら進める**（自動で全部やらない）
- **各ステップで検証を通す**（壊れたまま次に進まない）
- **元動画のコピーにならないよう台本は必ず書き換える**
- **第三者の声・顔の模倣は禁止**（本人許諾がある素材のみ）

---

## 迷ったときの対応

ユーザーの意図が不明なときは、以下を確認する:
1. 何を入力として持っているか？
   - YouTubeリンク → ルート A
   - SRT/VTT字幕 → ルート B
   - ローカル動画 → ルート C
   - structure.json → 台本生成へ
   - structure + narration → 動画生成へ

2. 何を出力したいか？
   - 構造（structure.json）
   - 台本（narration.md）
   - 動画（output.mp4）

---

## 使い方の例

```
ユーザー: 「動画制作を始めたい」
→ 「何をお持ちですか？」
  - YouTubeリンク → ルート A
  - SRT/VTT字幕 → ルート B
  - ローカル動画 → ルート C

ユーザー: 「YouTubeの字幕が取れない」
→ ルート B（yt-dlp で字幕をダウンロード）または ルート C（Whisper）を案内

ユーザー: 「Whisperがインストールされていない」
→ インストール手順を案内:
  pip install openai-whisper

ユーザー: 「台本を早く作りたい」
→ npm run narration:skeleton を案内
→ APIキーがあれば npm run narration:generate も案内
```
