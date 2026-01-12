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

## 最重要原則（絶対遵守）

### 【絶対禁止事項】

| 禁止事項 | 理由 |
|----------|------|
| **元動画からの画像・フレームの切り出し・コピー** | ユーザーが明示的に禁止。著作権リスク |
| **元動画のフレームを背景として使用** | 暗くしても、ぼかしても禁止 |
| **元動画の映像を加工して再利用** | いかなる形式での再利用も禁止 |

### 【必須実行事項】

| 必須事項 | 方法 |
|----------|------|
| 映像の新規生成 | **Sora2** または **NanoBanana** で生成 |
| 背景画像の新規生成 | **NanoBanana** で類似イメージを生成 |

### 【違反時の対応】

上記禁止事項に違反した場合は、**全工程をやり直す**こと。

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
- **画像リサイズ時は ImageOps.fit() でアスペクト比を維持**
- **セクション検証（カバー率100%）を必ず実施**

---

## 関連スキル

| スキル | 用途 |
|--------|------|
| videojson_pipeline | structure.json 作成 |
| narration_generator | narration.md 作成 |
| tts_video_generator | TTS動画生成 |
| スライド.md | Quick Mode（高速） |
| advanced_video_analysis | Advanced Mode（高品質） |

---

## 品質検証

Advanced Mode 使用時は品質検証を実施:

```bash
# 品質検証
python3 scripts/advanced_video_analysis/quality_checker.py \
  --generated "./generated_slides/" \
  --jobs "./nanobanana_jobs/"
```
