---
name: narration_generator
description: structure.json のセグメントIDに合わせて narration.md を作る（コピーにならない台本）。
triggers:
  - "narration.md"
  - "台本を生成"
  - "structureから台本"
inputs:
  - structure.json
  - テーマ
  - 口調/対象者（任意）
outputs:
  - narration.md
---

# 手順（Claude Code向け）

1) structure.json の segments[].id を全部列挙する（順番を固定）
2) 各セグメントに対応する台本を作る
   - 元動画の言い回しを再現しない
   - 初心者向けの言葉を優先
3) narration.md は必ず見出し「## s01」形式にする
4) 完了後、render.json 作成へ進む（render_generator スキル）

## ガードレール（必須）
- 元動画の文章を復元・引用しない
- 誤解を招く断定が出る場合は「可能性」「例」などに言い換える
