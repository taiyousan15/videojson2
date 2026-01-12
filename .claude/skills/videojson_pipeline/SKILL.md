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

## Step 2: 画面切り替えの計測（必須）

**セクション数 = 元動画の画面切り替え回数**

```bash
# フレーム抽出（1秒間隔）
ffmpeg -i input.mp4 -vf "fps=1" frames/frame_%04d.png
```

### 画面切り替えの定義
```
カウントする（= 1セクション）:
  ✓ スライドが次のスライドに変わった
  ✓ 画面上の主要な画像が変わった
  ✓ レイアウトが大きく変わった
  ✓ 新しいUIや画面が表示された

カウントしない:
  ✗ 同じスライド内でのアニメーション
  ✗ マウスカーソルの移動のみ
  ✗ 小さなUI要素の変化
```

### 切り替えログの作成
```
No. | 時間     | 内容
----|----------|------------------
1   | 00:00    | タイトル画面
2   | 00:08    | 講師イントロ
3   | 00:23    | コース概要スライド
... | ...      | ...
```

## Step 3: structure.json を作る
- 切り替えログに基づいてセクションを作成
- 各セクションにタイムスタンプ（開始-終了）を必ず記録
- segments[].id は "s01" のような形式にする
- speaker_id は "host" を基本にする

## Step 4: セクション検証（必須）

```bash
# 検証スクリプト実行
python3 scripts/validate_sections.py --sections structure.json --video input.mp4
```

### 合格基準
- カバー率 = 100%
- ギャップ = 0
- 重複 = 0

### 検証失敗時
```bash
# ギャップ部分のフレームを抽出して確認
python3 scripts/validate_sections.py --sections structure.json --video input.mp4 --extract-gaps
```

## Step 5: schema validate
- 作成後、必ず npm run schema:validate を通す
- 失敗したら、エラー箇所を直して再実行

## Step 6: 次の作業へ繋げる
- 次は narration.md 作成（narration_generator スキル）
- その次が render.json（render_generator スキル）

## ガードレール（必須）
- 元動画のセリフを復元しない（構成の抽出に留める）
- 第三者の顔/声の模倣につながる情報を生成しない
