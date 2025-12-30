---
name: render_generator
description: narration.md + structure.json から render.json（自動編集用設計図）を作り、schema validate で壊れを防ぐ。
triggers:
  - "render.json"
  - "自動編集用JSON"
  - "narration + structure"
inputs:
  - structure.json
  - narration.md
  - 画像/音声アセットの方針（任意）
outputs:
  - render.json（schemas/render.schema.json に適合）
---

# 手順（Claude Code向け）

## Step 1: セグメント対応を確認
- narration.md の見出しID（s01等）が structure.json の segments[].id と一致しているか確認
- 足りない/余分がある場合は修正して整合させる

## Step 2: render_mode を決める
- remix: 元動画映像中心
- generative: 生成映像中心
- hybrid: 混在（最初はこれがおすすめ）

## Step 3: render.json を組み立てる
- segments は structure の順番で作る
- duration_ms は structure の end-start を目安に設定（ざっくりでもOK）
- audio.mode は最初は tts でOK
- lipsync が必要なら audio.lipsync.enabled を true にし、target_face_image_asset_id を設定

## Step 4: schema validate
- npm run schema:validate を必ず実行
- 通らない場合、エラー箇所を直して再実行

## ガードレール（必須）
- 第三者の声/顔を模倣する設定は入れない（本人許諾がある場合のみ）
- 元動画そのままの再現を目標にしない（台本・表現は作り替える）
