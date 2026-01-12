---
name: youtube_channel_summary
description: YouTubeチャンネルの動画を深く分析し、日本語動画を生成する統合ワークフロー
triggers:
  - "YouTubeチャンネルをまとめて"
  - "チャンネルの動画を日本語化"
  - "1ヶ月分の動画をまとめて"
  - "動画を分析して"
  - "コンテンツを深く理解"
inputs:
  - YouTubeチャンネルURL / 動画URL
  - 対象期間（1週間 / 1ヶ月 / カスタム）
  - 分析深度（quick / standard / deep）
outputs:
  - 日本語ナレーション付き動画（MP4）
  - 分析レポート（JSON）
  - 概念マップ（JSON）
  - ナラティブ構成（MD）
---

# YouTubeチャンネル分析・動画生成スキル v2.0

**統合スキル**: content-analyzer + concept-extractor + narrative-builder + deep-research

---

## 統合アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────┐
│                        入力レイヤー                                  │
│  YouTube URL → yt-dlp → 字幕 + メタデータ                           │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase A: コンテンツ分析 (content-analyzer)                         │
│  ├── 字幕取得・構造化                                               │
│  ├── セクション検出（PySceneDetect 4段階パイプライン）              │
│  ├── 重要度スコアリング                                             │
│  └── 出力: analysis.json                                            │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase B: 本質抽出 (concept-extractor)                              │
│  ├── Socratic式6質問分析                                            │
│  │   ├── 明確化: これは何か？                                       │
│  │   ├── 前提: どんな仮定があるか？                                 │
│  │   ├── 根拠: なぜそう言えるか？                                   │
│  │   ├── 視点: 別の見方は？                                         │
│  │   ├── 帰結: どうなるか？                                         │
│  │   └── 本質: 最も重要なことは？                                   │
│  ├── 5W1H抽出                                                       │
│  ├── カテゴリ分類                                                   │
│  └── 出力: concepts.json                                            │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                      ┌─────────────┴─────────────┐
                      ▼                           ▼
┌────────────────────────────────┐  ┌────────────────────────────────┐
│  Phase C: ナラティブ構成        │  │  Phase D: ディープリサーチ      │
│  (narrative-builder)           │  │  (deep-research) ※任意         │
│  ├── WWH / PAS / SCQA選択      │  │  ├── 追加調査トピック特定       │
│  ├── セクションごとの台本      │  │  ├── ソース引用収集             │
│  ├── 画像プロンプト生成        │  │  ├── ファクトチェック           │
│  └── 出力: narration.md        │  │  └── 出力: research.json        │
└────────────────────────────────┘  └────────────────────────────────┘
                      │                           │
                      └─────────────┬─────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase E: sections_data_ja.json 生成                                │
│  ├── ナラティブ + 概念 + リサーチ統合                               │
│  ├── NanoBananaプロンプト生成                                       │
│  └── 出力: sections_data_ja.json                                    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase F-H: 画像・音声・動画生成（既存フロー）                      │
│  ├── NanoBanana画像生成                                             │
│  ├── Google Cloud TTS音声生成                                       │
│  ├── drawtext字幕合成                                               │
│  └── 出力: final_video.mp4                                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 絶対禁止事項

| 禁止事項 | 理由 |
|----------|------|
| **元動画からの画像・フレームの切り出し・コピー** | 著作権リスク |
| **元動画のフレームを背景として使用** | 暗くしても、ぼかしても禁止 |
| **翻訳をそのまま使用** | 必ずSocratic分析で再構成する |
| **セクション数を推測で決める** | 必ずシーン検出で確定する |
| **浅い要約** | concept-extractorで本質を抽出 |

---

## 使用モデル・ツール一覧

### コンテンツ分析系（新規統合）

| ツール | 用途 | 場所 |
|--------|------|------|
| **content-analyzer** | 構造化分析 | `~/.claude/skills/content-analyzer/` |
| **concept-extractor** | Socratic式本質抽出 | `~/.claude/skills/concept-extractor/` |
| **narrative-builder** | ナラティブ構成 | `~/.claude/skills/narrative-builder/` |
| **deep-research** | ソース引用リサーチ | `~/.claude/skills/deep-research/` |

### 既存ツール

| ツール | 用途 |
|--------|------|
| **PySceneDetect** | セクション検出 |
| **Ollama (llama3.1:70b)** | 翻訳・分析・生成 |
| **NanoBanana (Gemini)** | 画像生成 |
| **Google Cloud TTS Neural2-D** | 日本語音声 |
| **FFmpeg** | 動画合成 |

---

## Phase A: コンテンツ分析

### A-1. YouTube動画から字幕取得

```bash
VIDEO_ID="abc123"
OUTPUT_DIR="work/${VIDEO_ID}"

# 字幕ダウンロード
yt-dlp --write-auto-sub --sub-lang en,ja --skip-download \
  -o "${OUTPUT_DIR}/subtitles/source" \
  "https://www.youtube.com/watch?v=${VIDEO_ID}"
```

### A-2. content-analyzer で構造化分析

```bash
# コマンドライン実行
python3 ~/.claude/skills/content-analyzer/analyze.py \
  --input "https://www.youtube.com/watch?v=${VIDEO_ID}" \
  --output "${OUTPUT_DIR}/analysis.json" \
  --language ja

# または Claude Code 内で直接実行（Ollama MCP使用）
```

### A-3. 出力: analysis.json

```json
{
  "source": {
    "type": "youtube",
    "url": "https://youtube.com/watch?v=abc123",
    "title": "Google's Infinite Learning",
    "duration": 754,
    "language": "en"
  },
  "sections": [
    {
      "id": "s01",
      "start": 0,
      "end": 45,
      "summary": "Introduction to the topic",
      "key_points": ["Point 1", "Point 2"],
      "importance": 0.85
    }
  ],
  "key_concepts": [
    {"term": "Infinite Learning", "importance": 0.95}
  ],
  "metadata": {
    "total_sections": 87,
    "analyzed_at": "2026-01-08T02:30:00"
  }
}
```

---

## Phase B: Socratic式本質抽出

### B-1. concept-extractor で深い分析

```bash
python3 ~/.claude/skills/concept-extractor/extract.py \
  --input "${OUTPUT_DIR}/analysis.json" \
  --output "${OUTPUT_DIR}/concepts.json" \
  --model llama3.1:70b \
  --depth deep
```

### B-2. Ollama MCP で直接実行（推奨）

Claude Code内で以下のように実行:

```
mcp__ollama__ollama_generate を使用して:
- model: llama3.1:70b
- prompt: Socratic式分析プロンプト
- format: json
```

### B-3. 出力: concepts.json

```json
{
  "core_essence": {
    "one_sentence": "Googleの新学習手法は、AIの継続学習を可能にする画期的技術",
    "key_insight": "従来の再学習問題を解決し、AIが人間のように学び続けられる",
    "unique_value": "競合他社との差別化ポイントを明確に解説"
  },
  "socratic_analysis": {
    "clarification": {
      "answer": "Infinite Learningとは、AIが新しい情報を学習しても既存の知識を忘れない技術",
      "key_terms": ["Infinite Learning", "継続学習", "破滅的忘却"]
    },
    "assumptions": {
      "explicit": ["AIは継続的に学習する必要がある"],
      "implicit": ["現行のAIは再学習で既存知識を失う"]
    },
    "evidence": {
      "supporting": ["Googleの研究論文", "ベンチマーク結果"],
      "data_points": ["精度95%維持", "学習速度3倍向上"]
    },
    "perspectives": {
      "alternative_views": ["OpenAIは別アプローチ", "学術界は懐疑的"],
      "counterarguments": ["計算コストが増大する可能性"]
    },
    "implications": {
      "if_true": ["AIの実用性が飛躍的に向上", "競争優位性確立"]
    },
    "essence": {
      "core_message": "AIが人間のように学び続けられる時代の到来",
      "actionable_insight": "この技術動向を注視し、自社への適用可能性を検討"
    }
  },
  "category": "新モデル発表",
  "5w1h": {
    "what": "Infinite Learning技術の発表",
    "who": "Google DeepMind",
    "when": "2026年1月",
    "where": "Google AI Blog",
    "why": "継続学習の課題を解決するため",
    "how": "新しいニューラルアーキテクチャ"
  }
}
```

---

## Phase C: ナラティブ構成

### C-1. narrative-builder でストーリー化

```bash
python3 ~/.claude/skills/narrative-builder/build.py \
  --input "${OUTPUT_DIR}/concepts.json" \
  --output "${OUTPUT_DIR}/narration.md" \
  --format video \
  --framework wwh \
  --tone educational
```

### C-2. フレームワーク選択

| フレームワーク | 最適なコンテンツ |
|---------------|-----------------|
| **WWH** (What-Why-How) | 技術解説、ハウツー |
| **PAS** (Problem-Agitate-Solve) | ビジネス、マーケティング |
| **SCQA** (Situation-Complication-Question-Answer) | ニュース分析 |
| **HERO** (Hero's Journey) | ストーリー、事例紹介 |

### C-3. 出力: narration.md

```markdown
# Googleの『Infinite Learning』が変えるAIの未来

## オープニング（0:00-0:30）

[ナレーション]
AIは一度学習すると、新しいことを覚えると古いことを忘れてしまう。
そんな問題を解決する画期的な技術が発表されました。
今日は、Googleの『Infinite Learning』について解説します。

**画面指示**: タイトルカード「AIが学び続ける時代」

---

## セクション1: Infinite Learningとは何か（What）

[ナレーション]
Infinite Learningとは、AIが新しい情報を学習しても、
既存の知識を失わない技術です。
従来のAIは「破滅的忘却」という問題を抱えていました。

**画面指示**: 「破滅的忘却」の図解イラスト

---
...
```

---

## Phase D: ディープリサーチ（任意）

### D-1. 追加調査が必要な場合

```bash
python3 ~/.claude/skills/deep-research/research.py \
  --topic "Infinite Learning技術の競合比較" \
  --output "${OUTPUT_DIR}/research.md" \
  --depth comprehensive
```

### D-2. 使用タイミング

- 概念分析で「不確実」とマークされた領域
- 視聴者に追加情報が必要と判断した場合
- ファクトチェックが必要な場合

---

## Phase E: sections_data_ja.json 生成

### E-1. 統合処理

```python
def generate_sections_data(analysis, concepts, narration):
    """分析結果を統合してsections_data_ja.jsonを生成"""

    sections = []
    for i, section in enumerate(analysis["sections"]):
        # ナラティブからナレーションを取得
        narration_text = extract_narration(narration, section["id"])

        # 概念分析から表示テキストを生成
        display_text = generate_display_text(concepts, section)

        # NanoBananaプロンプト生成
        prompt = generate_nanobanana_prompt(
            concepts["core_essence"],
            section,
            style="risograph"
        )

        sections.append({
            "id": section["id"],
            "start_time": section["start"],
            "end_time": section["end"],
            "narration": narration_text,
            "display_text": display_text,
            "nanobanana_prompt": prompt
        })

    return {
        "video_id": analysis["source"]["url"].split("v=")[1],
        "title_ja": concepts["core_essence"]["one_sentence"],
        "category": concepts["category"],
        "key_points": [
            concepts["socratic_analysis"]["essence"]["core_message"],
            concepts["socratic_analysis"]["essence"]["actionable_insight"]
        ],
        "sections": sections
    }
```

### E-2. NanoBananaプロンプトテンプレート

```python
RISOGRAPH_STYLE = """
リソグラフ印刷風、粒状テクスチャ、パパイヤウィップ背景(#FFEFD5)、
紫のテキスト(#800080)、オレンジのアクセント(#FFA500)、
{scene_description}、
日本語テキスト「{display_text}」、
全てのテキストは日本語で、手描きイラスト風、レトロな雰囲気
"""

def generate_nanobanana_prompt(core_essence, section, style="risograph"):
    scene = describe_scene(section)
    display = section.get("display_text", "")[:20]

    if style == "risograph":
        return RISOGRAPH_STYLE.format(
            scene_description=scene,
            display_text=display
        )
```

---

## Phase F-H: 動画生成（既存フロー）

### F. NanoBanana画像生成

```bash
python ~/.claude/skills/gemini-image-generator/scripts/run.py \
  image_generator.py \
  --batch-file "${OUTPUT_DIR}/sections_data_ja.json" \
  --output-dir "${OUTPUT_DIR}/images" \
  --key nanobanana_prompt
```

### G. Google Cloud TTS音声生成

```python
# ja-JP-Neural2-D を使用
for section in sections:
    generate_audio(
        text=section["narration"],
        output_path=f"audio/{section['id']}.mp3",
        voice_name="ja-JP-Neural2-D"
    )
```

### H. FFmpeg動画合成

```bash
# drawtext字幕 + 音声 + 画像
ffmpeg -y \
  -loop 1 -i composite.png \
  -i audio.mp3 \
  -vf "drawtext=..." \
  -c:v libx264 -tune stillimage \
  -c:a aac -b:a 192k \
  -t ${duration} \
  output.mp4
```

---

## クイックスタート

### 単一動画の分析・生成

```bash
VIDEO_URL="https://www.youtube.com/watch?v=abc123"
OUTPUT_DIR="work/abc123"

# 1. コンテンツ分析
python3 ~/.claude/skills/content-analyzer/analyze.py \
  -i "${VIDEO_URL}" -o "${OUTPUT_DIR}/analysis.json"

# 2. 概念抽出（Ollama使用）
python3 ~/.claude/skills/concept-extractor/extract.py \
  -i "${OUTPUT_DIR}/analysis.json" -o "${OUTPUT_DIR}/concepts.json" \
  --model llama3.1:70b

# 3. ナラティブ構成
python3 ~/.claude/skills/narrative-builder/build.py \
  -i "${OUTPUT_DIR}/concepts.json" -o "${OUTPUT_DIR}/narration.md" \
  --format video --framework wwh

# 4. sections_data_ja.json生成 → 画像生成 → 音声生成 → 動画合成
# （既存フローを実行）
```

### Claude Code 内での実行（推奨）

```
ユーザー: 「このYouTube動画を深く分析して日本語動画を作成して」
    ↓
Claude Code が自動的に:
1. content-analyzer で構造化分析
2. Ollama MCP (llama3.1:70b) でSocratic分析
3. narrative-builder でWWH構成
4. sections_data_ja.json 生成
5. NanoBanana → TTS → FFmpeg
```

---

## 出力ファイル構成

```
work/{video_id}/
├── analysis.json           # Phase A: コンテンツ分析
├── concepts.json           # Phase B: 概念抽出
├── narration.md            # Phase C: ナラティブ構成
├── research.json           # Phase D: ディープリサーチ（任意）
├── sections_data_ja.json   # Phase E: 統合セクションデータ
├── images/                 # Phase F: NanoBanana画像
├── composites/             # 75%+25%合成画像
├── audio/                  # Phase G: TTS音声
├── subtitles/              # SRT字幕
├── segments/               # セグメント動画
└── final_video.mp4         # Phase H: 最終動画
```

---

## 関連スキル

| スキル | 場所 | 役割 |
|--------|------|------|
| content-analyzer | `~/.claude/skills/content-analyzer/` | 構造化分析 |
| concept-extractor | `~/.claude/skills/concept-extractor/` | Socratic式本質抽出 |
| narrative-builder | `~/.claude/skills/narrative-builder/` | ナラティブ構成 |
| deep-research | `~/.claude/skills/deep-research/` | ソース引用リサーチ |
| gemini-image-generator | `~/.claude/skills/gemini-image-generator/` | NanoBanana画像生成 |
| スライド.md | `.claude/skills/スライド.md` | 動画合成ルール |

---

**スキルバージョン: v2.0**
**更新日: 2026-01-08**
**統合スキル: content-analyzer, concept-extractor, narrative-builder, deep-research**
