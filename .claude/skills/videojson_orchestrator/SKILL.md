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

→ **videojson_pipeline** スキルを使う
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

### 4) 一括で全部やりたい
キーワード: 「全部」「一括」「最初から最後まで」「自動で」

→ 順番に実行:
1. videojson_pipeline → structure.json
2. narration_generator → narration.md
3. render_generator → render.json
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
