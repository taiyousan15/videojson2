# 生成ファイル整理計画

## 📊 現状分析

### ファイル統計
- **MP4動画**: 226個
- **画像ファイル**: 329個（PNG, JPG）
- **合計サイズ**: 751MB
- **最終成果物**: 14個のfinal動画
- **一時ファイル**: 1個
- **作業ディレクトリ**: 115個（audio, images, composites, subtitles等）
- **プロジェクト**: 21個

### 問題点
1. **散在する最終成果物**: 14個の動画が各プロジェクトに散らばっている
2. **大量の中間ファイル**: セグメント動画（226-14=212個）
3. **作業ディレクトリの肥大化**: 115個のディレクトリ、329個の画像
4. **命名規則の不統一**: `final_video.mp4`, `Wes_Roth_Channel_Summary_Final.mp4`, `WesRoth_11_Meta_Acquisition.mp4`
5. **重複する可能性**: 同じ内容の動画が複数存在

---

## 🎯 整理目標

### 達成目標
1. **最終成果物の集約**: すべての完成動画を `outputs/` に集約
2. **命名規則の統一**: `{project_name}_final.mp4`
3. **中間ファイルの整理**: セグメント・作業ファイルをアーカイブ
4. **不要ファイルの削除**: 一時ファイル、重複ファイルを削除
5. **サイズ削減**: 751MB → 200MB以下（中間ファイルをアーカイブまたは削除）

---

## 📋 整理計画

### Phase 1: 最終成果物の収集と命名統一 ⏱️ 30分

#### 1.1 outputs/ ディレクトリ作成

```
outputs/
├── obsidian_training/
│   ├── obsidian_training_ep1_final.mp4
│   ├── obsidian_training_ep2_final.mp4
│   ├── obsidian_training_ep3_final.mp4
│   ├── obsidian_training_ep4_final.mp4
│   └── obsidian_training_ep5_final.mp4
│
├── wes_roth/
│   ├── wes_roth_summary_final.mp4
│   ├── wes_roth_video_01_final.mp4
│   ├── wes_roth_video_02_final.mp4
│   ├── ...
│   └── wes_roth_video_15_final.mp4
│
├── two_minute_papers/
│   └── two_minute_papers_final.mp4
│
├── gemini_training/
│   └── gemini_training_v2_final.mp4
│
└── other/
    ├── ai_goldrush_final.mp4
    ├── blast_airdrop_final.mp4
    └── ...
```

#### 1.2 最終成果物の検出とコピー

```bash
# 最終動画を検出
find projects/ -type f \( -name "*final*.mp4" -o -name "*Final*.mp4" \) > final_videos.txt

# 各動画をコピー（元ファイルは残す）
# 例:
cp projects/obsidian_training_ep2/final_video_v8.mp4 \
   outputs/obsidian_training/obsidian_training_ep2_final.mp4
```

#### 1.3 メタデータ記録

```
outputs/
└── INDEX.md  # 各動画の情報（元パス、サイズ、作成日時、内容説明）
```

**INDEX.md フォーマット**:
```markdown
# 生成動画インデックス

## obsidian_training_ep2_final.mp4
- **元パス**: projects/obsidian_training_ep2/final_video_v8.mp4
- **サイズ**: 12.3MB
- **作成日**: 2026-01-05
- **内容**: Obsidian×AI×NotebookLM 統合ワークフロー 第2話
- **尺**: 5分35秒

## wes_roth_video_10_final.mp4
- **元パス**: projects/wes_roth_videos/video_10/Wes_Roth_Channel_Summary_Final.mp4
- **サイズ**: 12.0MB
- **作成日**: 2026-01-09
- **内容**: Wes Roth チャンネル Claude Code開発者告白
- **尺**: 2分51秒
```

---

### Phase 2: 中間ファイルのアーカイブ ⏱️ 20分

#### 2.1 アーカイブ対象

**セグメント動画** (212個):
- projects/*/segments_final/*.mp4
- projects/*/segments/*.mp4

**作業ディレクトリ** (115個):
- projects/*/audio/
- projects/*/images/
- projects/*/composites*/
- projects/*/subtitles/

#### 2.2 アーカイブ方法

**方法A: 圧縮アーカイブ（推奨）**
```bash
# プロジェクトごとにアーカイブ
for project in projects/*/; do
    project_name=$(basename "$project")
    tar -czf "archives/${project_name}_assets.tar.gz" \
        "$project/segments_final" \
        "$project/segments" \
        "$project/audio" \
        "$project/images" \
        "$project/composites" \
        "$project/composites_v2" \
        "$project/subtitles" \
        2>/dev/null
done

# 元ディレクトリを削除
# rm -rf projects/*/segments_final
# rm -rf projects/*/audio
# ...
```

**方法B: 外部ストレージに移動**
```bash
# 外部ドライブやクラウドストレージに移動
mv projects/*/segments_final /Volumes/ExternalDrive/videoJSON2_assets/
mv projects/*/audio /Volumes/ExternalDrive/videoJSON2_assets/
```

**方法C: 削除（非推奨 - バックアップ後のみ）**
```bash
# 中間ファイルを完全削除（注意！）
rm -rf projects/*/segments_final
rm -rf projects/*/audio
rm -rf projects/*/images
rm -rf projects/*/composites*
rm -rf projects/*/subtitles
```

#### 2.3 削減見込み

- **セグメント動画**: 約200MB → 0MB
- **画像**: 約100MB → 0MB
- **音声**: 約50MB → 0MB
- **合計削減**: 約350MB → **400MB削減**

---

### Phase 3: 不要ファイルの削除 ⏱️ 10分

#### 3.1 削除対象

**一時ファイル**:
```bash
find projects/ -type f \( -name "*temp*.mp4" -o -name "*tmp*.mp4" -o -name "*.tmp" \)
```

**空ディレクトリ**:
```bash
find projects/ -type d -empty
```

**ログファイル**:
```bash
find projects/ -type f \( -name "*.log" -o -name "*_log.txt" \)
```

**重複ファイル** (同一内容):
```bash
# MD5ハッシュで重複検出
find projects/ -type f -name "*.mp4" -exec md5 {} \; | sort | uniq -d -w32
```

#### 3.2 削除スクリプト

```bash
#!/bin/bash
# cleanup_projects.sh

# 一時ファイル削除
echo "Deleting temporary files..."
find projects/ -type f \( -name "*temp*.mp4" -o -name "*tmp*.mp4" -o -name "*.tmp" \) -delete

# ログファイル削除
echo "Deleting log files..."
find projects/ -type f \( -name "*.log" -o -name "*_log.txt" \) -delete

# 空ディレクトリ削除
echo "Deleting empty directories..."
find projects/ -type d -empty -delete

echo "Cleanup complete!"
```

---

### Phase 4: プロジェクト構造の標準化 ⏱️ 20分

#### 4.1 標準構造

整理後の各プロジェクト:
```
projects/{project_name}/
├── sections.json            # セクション定義（保持）
├── config.json              # 設定（あれば保持）
├── raw/                     # 元素材（あれば保持）
│   └── source_video.mp4
└── README.md                # プロジェクト説明（新規作成）
```

**削除/移動対象**:
- ❌ segments_final/ → archives/ または削除
- ❌ audio/ → archives/ または削除
- ❌ images/ → archives/ または削除
- ❌ composites*/ → archives/ または削除
- ❌ subtitles/ → archives/ または削除
- ❌ *.py スクリプト → 統合スクリプトに移行済みのため削除可

#### 4.2 README.md 自動生成

各プロジェクトに README.md を作成:

```markdown
# {Project Name}

## 概要
- **動画**: outputs/{category}/{project_name}_final.mp4
- **尺**: X分XX秒
- **作成日**: YYYY-MM-DD

## 説明
このプロジェクトで生成した動画の説明...

## アセット
中間ファイル（セグメント、音声、画像等）は以下に保存:
- アーカイブ: archives/{project_name}_assets.tar.gz
- または削除済み

## 再生成
このプロジェクトを再生成する場合:
```bash
python scripts/video/generate_tts_video.py \
    --config projects/{project_name}/sections.json \
    --output outputs/{category}/{project_name}_final.mp4
```
```

---

## 🔧 実行手順

### Step 1: バックアップ（必須）
```bash
# 現在のprojects/をバックアップ
cp -r projects/ projects_backup_$(date +%Y%m%d_%H%M%S)
```

### Step 2: outputs/ ディレクトリ作成
```bash
mkdir -p outputs/{obsidian_training,wes_roth,two_minute_papers,gemini_training,other}
```

### Step 3: 最終成果物を収集
```bash
# スクリプト実行
python scripts/utils/collect_final_outputs.py
```

### Step 4: 中間ファイルのアーカイブ
```bash
# 方法Aの場合
mkdir -p archives
bash scripts/utils/archive_assets.sh

# 方法Cの場合（削除）
bash scripts/utils/cleanup_projects.sh --delete-assets
```

### Step 5: 不要ファイルの削除
```bash
bash scripts/utils/cleanup_projects.sh
```

### Step 6: README.md 自動生成
```bash
python scripts/utils/generate_project_readmes.py
```

### Step 7: 検証
```bash
# 最終成果物が正しく収集されているか確認
ls -lh outputs/*/

# プロジェクトサイズを確認
du -sh projects/

# アーカイブサイズを確認
du -sh archives/
```

---

## 📦 期待される結果

### ファイル数削減
- **MP4**: 226個 → 14個（最終成果物のみ）
- **画像**: 329個 → 0個（アーカイブ/削除）
- **作業ディレクトリ**: 115個 → 0個（アーカイブ/削除）

### サイズ削減
- **現在**: 751MB
- **整理後**: 200MB以下（最終成果物のみ）
  - 最終動画: 約150MB（14個 × 平均10MB）
  - sections.json等: 約10MB
  - README等: 約1MB
- **削減率**: 約73%削減

### ディレクトリ構造
```
videoJSON2/
├── outputs/                  # 最終成果物（NEW）
│   ├── obsidian_training/
│   ├── wes_roth/
│   ├── two_minute_papers/
│   ├── gemini_training/
│   ├── other/
│   └── INDEX.md
│
├── archives/                 # 中間ファイル（NEW）
│   ├── obsidian_training_ep2_assets.tar.gz
│   ├── wes_roth_video_10_assets.tar.gz
│   └── ...
│
└── projects/                 # 整理済みプロジェクト
    ├── obsidian_training_ep2/
    │   ├── sections.json
    │   └── README.md
    ├── wes_roth_videos/
    │   └── video_10/
    │       ├── sections.json
    │       └── README.md
    └── ...
```

---

## ✅ チェックリスト

### 実行前
- [ ] プロジェクト全体をバックアップ（外部ドライブ推奨）
- [ ] 重要な動画が14個すべて存在することを確認
- [ ] ディスク空き容量を確認（アーカイブ用に+751MB必要）

### 実行中
- [ ] outputs/ ディレクトリに14個の動画がコピーされた
- [ ] INDEX.md が正しく生成された
- [ ] archives/ または外部ストレージにアーカイブ完了
- [ ] 不要ファイルが削除された

### 実行後
- [ ] outputs/ の動画が正常に再生できる
- [ ] プロジェクトサイズが200MB以下になった
- [ ] 各プロジェクトに README.md が作成された
- [ ] バックアップを保持（念のため1ヶ月）

---

## 🚀 開始承認

この整理計画を実行しますか？

### 推定時間
- **Phase 1**: 30分（最終成果物の収集）
- **Phase 2**: 20分（中間ファイルのアーカイブ）
- **Phase 3**: 10分（不要ファイルの削除）
- **Phase 4**: 20分（構造の標準化）
- **合計**: 約80分

### リスク
- **低**: バックアップを作成するため、元に戻せる
- **中**: アーカイブ作成に時間がかかる可能性（751MB圧縮）

**承認してPhase 1から開始しますか？**

**推奨**: まず **Phase 1のみ実行** して outputs/ に最終成果物を収集し、確認してから Phase 2-4 を実行
