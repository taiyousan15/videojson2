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

# 台本生成スキル

structure.json のセグメントIDに合わせて narration.md を作成する。

---

## 最重要原則

### 絶対禁止事項

| 禁止事項 | 理由 |
|----------|------|
| 元動画の文章を復元・引用 | 著作権リスク |
| 元動画の言い回しをそのまま使用 | コピーになる |
| ハルシネーション（新情報の追加） | 事実と異なる内容になる |

### 必須事項

| 必須事項 | 方法 |
|----------|------|
| 内容の再構成 | 元の意味を保ちつつ、別の表現で記述 |
| 初心者向け言葉 | 専門用語は平易な言葉に置き換え |
| セクション検証 | 全セクションIDに対応するナレーションがあること |

---

## 手順（Claude Code向け）

### Step 1: セグメントID確認
```bash
# structure.json の segments[].id を全部列挙
cat structure.json | jq '.segments[].id'
```

### Step 2: 台本作成
各セグメントに対応する台本を作成:
- 元動画の言い回しを再現しない
- 初心者向けの言葉を優先
- 1セクション20-40秒程度が目安

### Step 3: narration.md フォーマット
```markdown
## s01
導入部分のナレーション...

## s02
次のセクションのナレーション...
```

### Step 4: 検証
- 全セグメントIDにナレーションがあるか確認
- 元動画の文章が含まれていないか確認

### Step 5: 次のステップ
完了後、render.json 作成へ進む（render_generator スキル）

---

## 関連スキル

| スキル | 用途 |
|--------|------|
| videojson_pipeline | structure.json 作成 |
| render_generator | render.json 作成 |
| スライド.md | Quick Mode（高速） |
| advanced_video_analysis | Advanced Mode（高品質） |

---

## ガードレール（必須）
- 元動画の文章を復元・引用しない
- 誤解を招く断定が出る場合は「可能性」「例」などに言い換える
- **日本語音声は Google Cloud TTS Neural2 を使用**（推奨: ja-JP-Neural2-D）
