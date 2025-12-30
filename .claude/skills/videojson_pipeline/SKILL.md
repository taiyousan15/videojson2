---
name: videojson_pipeline
description: 元動画の"流れ"を structure.json（Event JSON）として整理し、検証可能な形で保存する手順。
triggers:
  - "動画をJSON化"
  - "Event JSON"
  - "structure.json"
  - "YouTube解析"
inputs:
  - 元動画（YouTubeリンク または 動画ファイル）
  - テーマ（任意）
outputs:
  - structure.json（schemas/structure.schema.json に適合）
---

# 手順（Claude Code向け）

## Step 1: 出力の前提を確認
- 生成物は structure.json
- segments[].id は "s01" のような形式にする
- speaker_id は "host" を基本にする（複数話者なら entities.speakers を増やす）

## Step 2: structure.json を作る
- まずは「導入」「本題」「まとめ」くらいの粗い分割でOK
- 後で細かく分割できるので、最初から完璧にしない
- on_screen_text（テロップ）や visual_hints（映像の雰囲気）は "推測" でよい

## Step 3: schema validate
- 作成後、必ず npm run schema:validate を通す
- 失敗したら、エラー箇所を直して再実行

## Step 4: 次の作業へ繋げる
- 次は narration.md 作成（narration_generator スキル）
- その次が render.json（render_generator スキル）

## ガードレール（必須）
- 元動画のセリフを復元しない（構成の抽出に留める）
- 第三者の顔/声の模倣につながる情報を生成しない
