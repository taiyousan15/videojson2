---
name: videojson_orchestrator
description: VideoJSON の作業フローを統括し、ユーザーの意図に応じて適切なスキルへ誘導する。
triggers:
  - "VideoJSON"
  - "動画制作"
  - "何から始めれば"
  - "フローを教えて"
  - "使い方"
inputs:
  - ユーザーの質問/要望
outputs:
  - 適切なスキルへの誘導、または直接の回答
---

# VideoJSON オーケストレーター

このスキルは VideoJSON の「入り口」です。
ユーザーの意図を分類し、適切な専門スキルへ誘導します。

## 意図の分類と誘導先

### 1) 構造を作りたい（元動画をJSON化）
キーワード: 「structure.json」「動画をJSON化」「YouTube解析」「構造を作る」「流れを抽出」

#### A) YouTubeリンクから構造を抽出

```bash
npm run analyze:youtube -- --url "https://www.youtube.com/watch?v=VIDEO_ID" --out myproject/structure.json
```

**注意**: YouTubeの字幕が取得できない場合は以下の代替手段を案内:

1. **yt-dlp で字幕をダウンロード**
   ```bash
   yt-dlp --write-auto-sub --sub-lang ja --skip-download "<URL>"
   ```

2. **Whisper で文字起こし**
   ```bash
   yt-dlp -o video.mp4 "<URL>"
   whisper video.mp4 --language ja --output_format json
   ```

3. **手動で transcript.json を作成**
   - `examples/fixtures/transcript.sample.json` を参考に

#### B) transcript.json から構造を抽出

```bash
npm run analyze:transcript -- --transcript myproject/transcript.json --out myproject/structure.json
```

→ 詳細は **videojson_pipeline** スキルを参照
- 入力: 元動画（YouTubeリンク or ファイルパス）
- 出力: structure.json
- 検証: npm run schema:validate

### 2) 台本を作りたい
キーワード: 「narration.md」「台本を生成」「スクリプト」「台詞」「ナレーション」

→ **narration_generator** スキルを使う
- 入力: structure.json + テーマ
- 出力: narration.md
- 検証: npm run validate（整合性チェック含む）

### 3) 自動編集用JSONを作りたい
キーワード: 「render.json」「自動編集」「レンダリング設計」「動画生成設定」

→ **render_generator** スキルを使う
- 入力: structure.json + narration.md
- 出力: render.json
- 検証: npm run schema:validate

### 4) 動画を生成したい
キーワード: 「mp4を作る」「動画を生成」「レンダリング」「render:run」

```bash
npm run render:run -- --structure myproject/structure.json --narration myproject/narration.md --out myproject/output.mp4
```

このコマンドは以下を自動実行:
1. narration.md と structure.json の整合性チェック
2. render.json の自動生成
3. アセットの解決とマテリアライズ
4. ffmpeg でのmp4レンダリング

### 5) 一括で全部やりたい
キーワード: 「全部」「一括」「最初から最後まで」「自動で」

→ 順番に実行:
1. analyze:youtube または analyze:transcript → structure.json
2. narration_generator → narration.md（手動で編集）
3. render:run → output.mp4
4. 最後に npm run validate

## 重要なルール

- **1つずつ確認しながら進める**（自動で全部やらない）
- **各ステップで検証を通す**（壊れたまま次に進まない）
- **元動画のコピーにならないよう台本は必ず書き換える**
- **第三者の声・顔の模倣は禁止**（本人許諾がある素材のみ）

## 迷ったときの対応

ユーザーの意図が不明なときは、以下を確認する:
1. 何を入力として持っているか（動画？structure.json？narration.md？）
2. 何を出力したいか（構造？台本？render設定？動画？）
3. その回答に応じて適切なスキルへ誘導する

## 使い方の例

```
ユーザー: 「動画制作を始めたい」
→ 「何を入力としてお持ちですか？（YouTubeリンク/動画ファイル/structure.json など）」

ユーザー: 「YouTubeリンクがある」
→ videojson_pipeline スキルを使って structure.json を生成

ユーザー: 「structure.json から台本を作りたい」
→ narration_generator スキルを使って narration.md を生成
```
