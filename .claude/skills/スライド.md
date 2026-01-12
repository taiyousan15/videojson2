# 日本語企業研修教材 自動生成スキル v9.0 (Critical Fix Edition)

MP4動画から日本語企業研修教材を自動生成するスキル。**v9.0では致命的バグを修正**。

**v9.0 主要修正:**
- **【致命的】Whisper言語自動検出の追加** - 日本語動画に英語設定を適用するバグを修正
- **【致命的】OCRフレーム参照必須化** - NanoBananaプロンプトに元フレーム情報を含める
- **【致命的】往復翻訳禁止** - 日本語→英語→日本語の劣化を防止
- **プロジェクトフォルダ構成の標準化**
- **品質検証チェックリストの強化**

---

## ■ 0. 致命的バグ回避チェックリスト（最最重要）

**以下のバグは過去に発生した致命的問題です。必ず回避してください。**

### 【バグ1: Whisper言語設定ミス】

```
❌ 間違い:
  日本語動画 → whisper --language en → 英語テキスト → Ollama翻訳 → 劣化した日本語

✓ 正しい:
  日本語動画 → whisper --language ja → 正確な日本語テキスト
```

**解決策: 言語自動検出を実行**

```bash
# 最初の30秒で言語を検出してから処理
ffmpeg -i source_video.mp4 -t 30 -vn -acodec pcm_s16le -ar 16000 sample.wav

# 言語検出（自動）
whisper sample.wav --language auto --model tiny --output_format json

# 検出結果を確認してから本番実行
DETECTED_LANG=$(python3 -c "import json; print(json.load(open('sample.json'))['language'])")
echo "検出言語: $DETECTED_LANG"

# 本番文字起こし（検出言語を使用）
whisper audio.wav --language $DETECTED_LANG --model medium --output_format json
```

### 【バグ2: 往復翻訳による劣化】

```
❌ 間違い:
  日本語音声 → 英語テキスト → 日本語翻訳 = 情報損失85%

✓ 正しい:
  日本語音声 → 日本語テキスト = 情報損失0%
  英語音声 → 英語テキスト → 日本語翻訳 = 情報損失10-20%
```

### 【バグ3: NanoBananaプロンプトに元フレーム情報なし】

```
❌ 間違い:
  プロンプト: "cute creature characters, game tutorial"
  → 元動画と無関係な画像が生成される

✓ 正しい:
  プロンプト: "
  Based on reference frame analysis:
  - Title: 'Axie Infinity パーフェクトガイド ③'
  - Layout: Left side text list, right side presenter profile
  - Characters: Blue aquatic with sunglasses, orange beast, pink bird
  - Style: Professional Japanese educational presentation
  - Background: Sky blue gradient with clouds

  Generate similar composition maintaining:
  - Same layout structure
  - Same character types and colors
  - Same text positioning
  - Japanese text elements
  "
```

### 【バグ4: セクション数が少なすぎる】

```
❌ 間違い:
  15分動画 → 9セクション = 1セクション約100秒（長すぎる）
  → 生成動画は2分51秒（元動画の19%しかない）

✓ 正しい:
  15分動画 → 30-50セクション = 1セクション約20-30秒
  → 生成動画も15分程度を目指す
```

---

## ■ 1. プロジェクトフォルダ構成（標準）

```
projects/
└── {project_name}/               # プロジェクトルート
    ├── source_video.mp4          # 元動画
    ├── metadata.json             # yt-dlpメタデータ
    │
    ├── audio.wav                 # 抽出音声
    ├── audio.json                # Whisper文字起こし結果
    │
    ├── frames/                   # 元動画フレーム
    │   ├── frame_0001.jpg
    │   ├── frame_0002.jpg
    │   └── ...
    │
    ├── ocr_analysis/             # フレームOCR分析結果
    │   ├── frame_0001_ocr.json
    │   ├── frame_0002_ocr.json
    │   └── summary.json          # 全フレームの要約
    │
    ├── structure.json            # セクション構造定義（必須）
    ├── transcript_ja.txt         # 日本語トランスクリプト
    │
    ├── generated_images/         # NanoBanana生成画像
    │   ├── 01_intro.png
    │   ├── 02_section.png
    │   └── ...
    │
    ├── audio/                    # TTS生成音声
    │   ├── 01_intro.mp3
    │   ├── 02_section.mp3
    │   └── ...
    │
    ├── slides/                   # 組み立て済みスライド
    │   ├── 01_intro.png
    │   ├── 02_section.png
    │   └── ...
    │
    ├── segments/                 # 動画セグメント
    │   ├── 01.mp4
    │   ├── 02.mp4
    │   └── ...
    │
    ├── quality_report.json       # 品質検証レポート
    └── final_video.mp4           # 最終出力
```

---

## ■ 2. 正しいワークフロー（Phase 0-6）

### 【Phase 0-1: 動画取得】

```bash
# プロジェクトディレクトリ作成
PROJECT_NAME="youtube_VIDEO_ID"
mkdir -p "projects/${PROJECT_NAME}"
cd "projects/${PROJECT_NAME}"

# 動画ダウンロード
yt-dlp -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" \
  --merge-output-format mp4 \
  -o "source_video.mp4" \
  "VIDEO_URL"

# メタデータ保存
yt-dlp --skip-download --write-info-json -o "metadata" "VIDEO_URL"
```

### 【Phase 0-2: 言語検出 + 文字起こし】

```bash
# 音声抽出
ffmpeg -i source_video.mp4 -vn -acodec pcm_s16le -ar 16000 audio.wav

# 【重要】言語自動検出（最初の30秒でサンプリング）
ffmpeg -i audio.wav -t 30 -y sample.wav
whisper sample.wav --language auto --model tiny --output_format json --output_dir ./

# 検出言語を取得
DETECTED_LANG=$(python3 -c "import json; d=json.load(open('sample.json')); print(d.get('language', 'unknown'))")
echo "検出言語: $DETECTED_LANG"

# 本番文字起こし（検出言語を使用）
whisper audio.wav --language $DETECTED_LANG --model medium --output_format json --output_dir ./
```

### 【Phase 0-3: 翻訳（英語動画の場合のみ）】

```python
"""
【重要】日本語動画の場合は翻訳をスキップ！
往復翻訳（日本語→英語→日本語）は禁止。
"""

def should_translate(detected_language: str) -> bool:
    """翻訳が必要かどうか判定"""
    # 日本語の場合は翻訳不要
    if detected_language in ["ja", "japanese"]:
        print("【情報】日本語動画のため翻訳をスキップします")
        return False

    # 英語など他言語の場合は翻訳が必要
    print(f"【情報】{detected_language}動画のため日本語に翻訳します")
    return True

# 使用例
if should_translate(detected_language):
    # Ollamaで翻訳
    translated_text = translate_with_ollama(english_text, model="llama3.2:3b")
else:
    # そのまま使用（翻訳しない）
    japanese_text = original_text
```

### 【Phase 1: フレーム抽出 + OCR分析】

```bash
# フレーム抽出（10秒間隔）
mkdir -p frames
ffmpeg -i source_video.mp4 -vf "fps=1/10" frames/frame_%04d.jpg

# フレーム数確認
echo "抽出フレーム数: $(ls frames/*.jpg | wc -l)"
```

```python
"""
【重要】全フレームのOCR分析を実行
NanoBananaプロンプトに必要な情報を抽出
"""
import json
from pathlib import Path
from PIL import Image
import pytesseract

def analyze_frame_ocr(frame_path: Path) -> dict:
    """フレームのOCR分析を実行"""
    img = Image.open(frame_path)

    # OCRテキスト抽出（日本語）
    ocr_text = pytesseract.image_to_string(img, lang='jpn')

    # レイアウト情報取得
    ocr_data = pytesseract.image_to_data(img, lang='jpn', output_type=pytesseract.Output.DICT)

    return {
        "frame": frame_path.name,
        "text": ocr_text.strip(),
        "layout": extract_layout_info(ocr_data),
        "colors": extract_dominant_colors(img),
    }

def create_ocr_summary(ocr_results: list) -> dict:
    """全フレームのOCR結果を要約"""
    return {
        "total_frames": len(ocr_results),
        "unique_texts": list(set(r["text"] for r in ocr_results if r["text"])),
        "common_elements": find_common_elements(ocr_results),
    }
```

### 【Phase 2: セクション構造定義】

```python
"""
【重要】セクション数は元動画の画面切り替え回数に合わせる
15分動画なら30-50セクションが適切
"""

def create_structure_json(whisper_data: dict, ocr_summary: dict, video_duration: float) -> dict:
    """
    structure.json を作成

    セクション数の目安:
    - 5分以下: 10-15セクション
    - 5-15分: 20-40セクション
    - 15分以上: 40-60セクション
    """
    segments = whisper_data.get("segments", [])

    # Whisperのセグメントをベースにセクションを作成
    sections = []
    for i, seg in enumerate(segments):
        # 短すぎるセグメント（5秒以下）は結合
        if seg["end"] - seg["start"] < 5:
            continue

        # 対応するOCRフレームを特定
        frame_index = int(seg["start"] / 10) + 1
        ocr_info = ocr_summary.get(f"frame_{frame_index:04d}", {})

        sections.append({
            "id": f"s{i+1:02d}",
            "start_time": seg["start"],
            "end_time": seg["end"],
            "title": extract_title_from_ocr(ocr_info),
            "narration": seg["text"],
            "visual_description": describe_visual_from_ocr(ocr_info),
            "frame_ref": f"frame_{frame_index:04d}.jpg"
        })

    return {
        "schema_version": "1.0",
        "video_id": "extracted_from_metadata",
        "duration_seconds": video_duration,
        "sections": sections
    }
```

### 【Phase 3: NanoBanana画像生成（OCR参照必須）】

```python
"""
【重要】NanoBananaプロンプトには必ず元フレームのOCR情報を含める
"""

def build_nanobanana_prompt(section: dict, ocr_analysis: dict) -> str:
    """
    OCR分析結果を反映したNanoBananaプロンプトを生成

    【禁止】
    - 元フレームを直接使用
    - OCR情報なしの汎用プロンプト
    """
    ocr = ocr_analysis.get(section["frame_ref"], {})

    prompt = f"""
Japanese educational slide with the following specifications:

LAYOUT (from OCR analysis):
- Title area: "{ocr.get('title', 'セクションタイトル')}"
- Main content position: {ocr.get('layout', 'center')}
- Text elements: {ocr.get('text_count', 0)} text blocks

VISUAL STYLE:
- Color scheme: {ocr.get('dominant_colors', 'professional blue and white')}
- Style: Clean Japanese corporate presentation
- Characters/Icons: {ocr.get('detected_icons', 'none')}

CONTENT:
{section.get('visual_description', 'Professional educational content')}

REQUIREMENTS:
- All text must be in Japanese
- Professional, clean design
- 1920x1080 aspect ratio
- No watermarks or logos
"""
    return prompt.strip()

def generate_all_images(sections: list, ocr_analysis: dict):
    """全セクションの画像を生成"""
    for i, section in enumerate(sections, 1):
        prompt = build_nanobanana_prompt(section, ocr_analysis)
        output_path = f"generated_images/{i:02d}_{section['id']}.png"

        print(f"[{i}/{len(sections)}] 生成中: {section['id']}")
        print(f"  プロンプト要約: {prompt[:100]}...")

        # NanoBanana生成
        success = generate_with_nanobanana(prompt, output_path)

        if not success:
            raise RuntimeError(f"NanoBanana生成失敗: {section['id']}")
```

### 【Phase 4: TTS音声生成（Neural2-D必須）】

```python
"""
Google Cloud TTS Neural2-D で音声生成
gTTSへのフォールバック禁止
"""
from google.cloud import texttospeech

def generate_tts(text: str, output_path: str):
    client = texttospeech.TextToSpeechClient()

    synthesis_input = texttospeech.SynthesisInput(text=text)
    voice = texttospeech.VoiceSelectionParams(
        language_code="ja-JP",
        name="ja-JP-Neural2-D"  # 必須
    )
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=1.0
    )

    response = client.synthesize_speech(
        input=synthesis_input,
        voice=voice,
        audio_config=audio_config
    )

    with open(output_path, "wb") as f:
        f.write(response.audio_content)
```

### 【Phase 5: スライド組立】

```bash
# 各セクションのスライド動画を作成
for i in $(seq -f "%02g" 1 $SECTION_COUNT); do
  ffmpeg -y -loop 1 \
    -i "generated_images/${i}_*.png" \
    -i "audio/${i}_*.mp3" \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" \
    -c:v libx264 -tune stillimage \
    -c:a aac -b:a 192k \
    -pix_fmt yuv420p -shortest \
    "segments/${i}.mp4"
done
```

### 【Phase 6: 動画結合】

```bash
# 結合リスト作成
ls -1 segments/*.mp4 | sort | sed 's/^/file /' > concat.txt

# 最終動画作成
ffmpeg -y -f concat -safe 0 -i concat.txt -c copy final_video.mp4

# 結果確認
echo "=== 生成完了 ==="
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 final_video.mp4
ls -lh final_video.mp4
```

---

## ■ 3. 品質検証チェックリスト

### 【生成前チェック】

| 項目 | 確認方法 | 合格基準 |
|------|----------|----------|
| 言語検出 | `cat sample.json \| jq .language` | 正しい言語が表示される |
| 往復翻訳回避 | 日本語動画で翻訳スキップ | 翻訳処理が実行されない |
| OCR分析完了 | `ls ocr_analysis/*.json \| wc -l` | フレーム数と一致 |
| セクション数 | `jq '.sections \| length' structure.json` | 動画長に適切な数 |

### 【生成後チェック】

| 項目 | 確認方法 | 合格基準 |
|------|----------|----------|
| 画像の日本語テキスト | 目視確認 | 日本語が正しく表示 |
| 画像スタイルの統一性 | 全画像を並べて確認 | スタイルが統一されている |
| 動画の長さ | ffprobe | 元動画の50%以上 |
| 音声品質 | 再生確認 | Neural2-Dの自然な音声 |

### 【よくある失敗パターン】

| 失敗 | 原因 | 対策 |
|------|------|------|
| 画像に英語テキスト | プロンプトが英語のみ | 日本語指定を明示 |
| 画像スタイルがバラバラ | OCR参照なし | 元フレームのスタイル情報を含める |
| 動画が短すぎる | セクション数不足 | Whisperセグメントを活用 |
| ナレーションが不自然 | 往復翻訳 | 言語検出を正しく行う |

---

## ■ 4. 依存関係・環境設定

### 【必須ツール】

```bash
# インストール確認
which yt-dlp || brew install yt-dlp
which ffmpeg || brew install ffmpeg
which whisper || pip install openai-whisper
pip show google-cloud-texttospeech || pip install google-cloud-texttospeech
pip show pillow || pip install pillow
pip show pytesseract || pip install pytesseract
brew list tesseract || brew install tesseract tesseract-lang

# Ollama
which ollama || brew install ollama
ollama serve &  # バックグラウンドで起動
ollama pull llama3.2:3b
```

### 【Google Cloud TTS設定】

```bash
# 認証設定（いずれかを実行）
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/credentials.json"
# または
gcloud auth application-default login
```

### 【NanoBanana認証】

```bash
cd ~/.claude/skills/gemini-image-generator
python3 scripts/run.py auth_manager.py status
# 未認証の場合
python3 scripts/run.py auth_manager.py setup
```

---

## ■ 5. 実行コマンド例（完全版）

```bash
#!/bin/bash
# 完全ワークフロー実行スクリプト

VIDEO_URL="$1"
PROJECT_NAME="$2"

if [ -z "$VIDEO_URL" ] || [ -z "$PROJECT_NAME" ]; then
  echo "Usage: $0 <VIDEO_URL> <PROJECT_NAME>"
  exit 1
fi

# Phase 0-1: ダウンロード
mkdir -p "projects/${PROJECT_NAME}"
cd "projects/${PROJECT_NAME}"
yt-dlp -f "bestvideo[height<=1080]+bestaudio/best" -o "source_video.mp4" "$VIDEO_URL"

# Phase 0-2: 言語検出 + 文字起こし
ffmpeg -i source_video.mp4 -vn -acodec pcm_s16le -ar 16000 audio.wav -y
ffmpeg -i audio.wav -t 30 sample.wav -y
whisper sample.wav --language auto --model tiny --output_format json --output_dir ./
LANG=$(python3 -c "import json; print(json.load(open('sample.json'))['language'])")
echo "検出言語: $LANG"
whisper audio.wav --language $LANG --model medium --output_format json --output_dir ./

# Phase 1: フレーム抽出
mkdir -p frames
ffmpeg -i source_video.mp4 -vf "fps=1/10" frames/frame_%04d.jpg -y

echo "=== Phase 0-2 完了 ==="
echo "次のステップ: OCR分析、セクション定義、NanoBanana生成..."
```

---

## ■ 6. バージョン履歴

| バージョン | 日付 | 主な変更 |
|------------|------|----------|
| v7.0 | - | Quick Mode + Parallel Mode 統合 |
| v8.0 | - | Remotion テロップ機能追加 |
| **v9.0** | 2026-01-05 | **致命的バグ修正版** |

### 【v9.0 修正内容】

1. **Whisper言語自動検出の追加**
   - 以前: `--language en` 固定で日本語動画も英語として処理
   - 修正: `--language auto` で言語を検出してから本番処理

2. **往復翻訳の禁止**
   - 以前: 日本語動画→英語テキスト→日本語翻訳（85%情報損失）
   - 修正: 日本語動画→日本語テキスト（損失なし）

3. **OCR参照必須化**
   - 以前: NanoBananaプロンプトに元フレーム情報なし
   - 修正: 全フレームのOCR分析結果をプロンプトに含める

4. **セクション数の適正化**
   - 以前: 15分動画→9セクション（不足）
   - 修正: 15分動画→30-50セクション（Whisperセグメント活用）

5. **プロジェクトフォルダ構成の標準化**
   - 明確なディレクトリ構造を定義
   - 各Phase の出力先を統一

---

**スキルバージョン: v9.0 (Critical Fix Edition)**
**作成日: 2026-01-05**

---

## ■ 7. 字幕付き研修動画生成スキル（v10.1更新）

### 【概要】
sections.jsonからNanoBanana画像＋TTS音声＋字幕付き動画を自動生成するワークフロー。

**実績プロジェクト:**
- `projects/obsidian_training_ep1/` → 第1話（導入編）約8分26秒
- `projects/obsidian_training_ep2/` → 第2話（基礎構築編）約5分10秒

**完成動画:**
- `Obsidian×AI×NotebookLM_統合ワークフロー_第1話_導入編.mp4`
- `Obsidian×AI×NotebookLM_統合ワークフロー_第2話_基礎構築編.mp4`

**v10.1更新内容（2026-01-06）:**
- バグ9追加: 画像クロップによる上部切れ
- バグ10追加: 読み変換による人名誤変換（田中さん→田中３）
- バグ11追加: 話速調整による不自然な音声

---

### 【7-1. プロジェクト構成】

```
projects/{project_name}/
├── sections.json          # セクション定義（ナレーション含む）
├── composites_v2/         # 合成画像（75%画像＋25%字幕バー）
│   ├── 01_s01.png
│   └── ...
├── audio/                 # TTS音声（Google Cloud Neural2-D）
│   ├── 01_s01.mp3
│   └── ...
├── subtitles/             # SRT字幕ファイル
│   ├── 01_s01.srt
│   └── ...
├── segments_final/        # 各セクション動画
│   ├── 01.mp4
│   └── ...
├── generate_subtitles_v2.py  # 字幕生成スクリプト
├── create_video_final.py     # 動画生成スクリプト
└── final_video_v8.mp4        # 最終出力
```

---

### 【7-2. 致命的バグ修正（今回発見）】

#### 【バグ5: -shortest による動画長ズレ】

```
❌ 間違い:
  ffmpeg -loop 1 -i image.png -i audio.mp3 -shortest output.mp4
  → 動画が音声より2-3秒長くなる
  → セグメント結合後に字幕が累積でズレる（5分で10秒以上）

✓ 正しい:
  duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 audio.mp3)
  ffmpeg -loop 1 -i image.png -i audio.mp3 -t $duration output.mp4
  → 音声と完全同期
```

#### 【バグ6: subtitles フィルターの位置ズレ】

```
❌ 間違い:
  ffmpeg -vf "subtitles=file.srt:force_style='MarginV=100'" ...
  → MarginVが正しく反映されない
  → 字幕が画像に重なる

✓ 正しい:
  ffmpeg -vf "drawtext=text='字幕':y=945:enable='between(t,0,5)'" ...
  → 絶対Y座標で確実に配置
```

#### 【バグ7: 固有名詞の分断】

```
❌ 間違い:
  "Obsidian×AI×N" → "otebookLMで情報を..."
  NotebookLMが2つの字幕に分断される

✓ 正しい:
  PROTECTED_WORDS = ['NotebookLM', 'Obsidian', ...]
  分割時に保護ワードをチェックして分断を防ぐ
```

#### 【バグ8: 語尾の孤立】

```
❌ 間違い:
  "〜にもなりま" → "す。"
  「ます」が分断される

✓ 正しい:
  動詞語尾（す、た、る等）の前で分割しない
  短いチャンクは前のチャンクにマージ
```

#### 【バグ9: 画像クロップによる上部切れ】（v10.1追加）

```
❌ 間違い:
  # アスペクト比を維持してクロップ
  img = img.resize((new_width, new_height))
  img = img.crop((left, 0, left + WIDTH, IMG_HEIGHT))
  → 画像の上部・下部が切れる
  → タイトルが見切れる

✓ 正しい:
  # スキル通り: 単純リサイズ（クロップしない）
  img = img.resize((WIDTH, IMG_HEIGHT), Image.LANCZOS)
  → 画像全体が表示される（多少歪むが内容は見える）
```

**原因:** NanoBanana画像が正方形に近いアスペクト比の場合、16:9にフィットさせようとクロップすると上下が切れる

#### 【バグ10: 読み変換による人名誤変換】（v10.1追加）

```
❌ 間違い:
  convert_reading_to_display() に以下のルールがある場合:
    ('さん、', '３、')  # 順序「さん、」を「３、」に変換

  → 「田中さん、のように」が「田中３、のように」に誤変換される
  → 人名の敬称「さん」が数字「３」になる

✓ 正しい:
  # 人名や助詞と競合する変換ルールは使わない
  # 「いち、」「に、」「さん、」→「１、」「２、」「３、」は削除
  # 代わりに「ひとつめ」「ふたつめ」「みっつめ」を使用
```

**危険な変換ルール（削除すべき）:**
- `('に、', '２、')` → 「〜に、〜する」が「〜２、〜する」になる
- `('さん、', '３、')` → 「田中さん、」が「田中３、」になる

**安全な変換ルール（使用OK）:**
- `('ひとつめ', '1つ目')` → 人名と競合しない
- `('デイいち', 'Day1')` → 明確なパターン

#### 【バグ11: 話速調整による不自然な音声】（v10.1追加）

```
❌ 間違い:
  # 目標時間に合わせるため話速を下げる
  speaking_rate=0.54  # 5分→9分に伸ばす
  → ナレーションが遅すぎて不自然
  → 企業研修動画として使えない品質

✓ 正しい:
  speaking_rate=1.0  # 通常速度
  # 動画長は台本（ナレーション文字数）で調整する
  # 話速で無理に伸ばさない
```

**重要:** 動画の長さは「ナレーション文字数」で決まる。話速を下げて無理に伸ばすと品質が下がる。

---

### 【7-3. 画像レイアウト（75%＋25%方式）】

```python
from PIL import Image

WIDTH, HEIGHT = 1920, 1080
IMG_HEIGHT = 810      # 75% - 画像エリア
SUB_HEIGHT = 270      # 25% - 字幕バー
SUB_Y = 945           # 字幕Y座標（バー中央）

def create_composite(image_path, output_path):
    """画像＋字幕バーの合成画像を作成"""
    # 元画像を読み込み
    img = Image.open(image_path)
    img = img.resize((WIDTH, IMG_HEIGHT), Image.LANCZOS)

    # キャンバス作成（字幕バー部分はダークブルー）
    canvas = Image.new('RGB', (WIDTH, HEIGHT), (26, 42, 74))  # #1A2A4A

    # 画像を上部に配置
    canvas.paste(img, (0, 0))

    canvas.save(output_path)
```

---

### 【7-4. 字幕生成（読み/表示分離方式）】

```python
# sections.json のナレーション（TTS用）
"narration": "連携フローは、ファイブステップで覚えると...ひとつめ、情報収集。ふたつめ、デジタル化..."

# 字幕表示用に変換
def convert_reading_to_display(text):
    """TTS読みを字幕表示用に変換"""
    replacements = [
        # ✅ 安全な変換（人名・助詞と競合しない）
        ('ひとつめ', '1つ目'),
        ('ふたつめ', '2つ目'),
        ('みっつめ', '3つ目'),
        ('ファイブステップ', '5ステップ'),
        ('ろくじゅっぷん', '60分'),
        ('エーアイ', 'AI'),
        # ...

        # ❌ 削除した変換（人名・助詞と競合する）
        # ('いち、', '１、'),  # 削除
        # ('に、', '２、'),    # 削除 - 「〜に、」と競合
        # ('さん、', '３、'),  # 削除 - 「田中さん」と競合
    ]
    for old, new in replacements:
        text = text.replace(old, new)
    return text
```

**⚠️ 注意（v10.1で発覚）:**
- `('さん、', '３、')` は「田中さん、」を「田中３、」に誤変換する
- 順序を示す場合は「ひとつめ」「ふたつめ」「みっつめ」を使用する

**効果:**
- 音声: 「ふたつめ、デジタル化と要約」（ひらがなで読む）
- 字幕: 「2つ目、デジタル化と要約。」（数字で表示）

---

### 【7-5. 字幕分割アルゴリズム】

```python
MAX_CHARS = 20  # 1行表示の最大文字数

PROTECTED_WORDS = ['NotebookLM', 'Obsidian', 'Markdown', ...]

def is_safe_to_split(text, pos):
    """分割位置が安全かチェック"""
    # 保護ワード内での分割を禁止
    for word in PROTECTED_WORDS:
        for start in range(max(0, pos - len(word) + 1), pos + 1):
            if start < pos < start + len(word) and text[start:start+len(word)] == word:
                return False

    # 動詞語尾の孤立を防止
    if pos < len(text):
        next_char = text[pos]
        if next_char in "すたるくん" and pos + 1 < len(text):
            if text[pos + 1] in "。、":
                return False

    return True

def split_narration(text, max_chars=MAX_CHARS):
    """文を自然に分割"""
    # 1. 句点（。）で分割
    # 2. 読点（、）で分割（8文字以上の場合）
    # 3. 短いチャンクはマージ
    # 4. 保護ワード・語尾の分断を防止
    ...
```

---

### 【7-6. 動画生成（drawtextフィルター方式）】

```python
def create_drawtext_filter(srt_entries):
    """FFmpeg drawtextフィルターを生成"""
    filters = []
    for start, end, text in srt_entries:
        text_esc = text.replace("'", "'\\'").replace(":", "\\:")

        filter_str = (
            f"drawtext=fontfile='/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc':"
            f"text='{text_esc}':"
            f"fontsize=36:"              # スマホ対応の大きめサイズ
            f"fontcolor=white:"
            f"borderw=3:"                # 太めの縁取り
            f"bordercolor=black:"
            f"box=1:"                    # 背景ボックス有効
            f"boxcolor=black@0.6:"       # 半透明黒背景
            f"boxborderw=8:"             # ボックスのパディング
            f"x=(w-text_w)/2:"           # 水平中央
            f"y=945:"                    # 字幕バー中央（絶対座標）
            f"enable='between(t,{start:.3f},{end:.3f})'"
        )
        filters.append(filter_str)

    return ",".join(filters)

def create_segment(i, section_id):
    """動画セグメントを生成"""
    # 音声の正確な長さを取得
    duration = get_audio_duration(audio_path)

    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-i", str(img_path),
        "-i", str(audio_path),
        "-vf", drawtext_filter,
        "-c:v", "libx264", "-tune", "stillimage",
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-t", str(duration),  # ← -shortest ではなく -t を使用
        str(output_path)
    ]
```

---

### 【7-7. 完全ワークフロー】

```bash
# 1. sections.json を準備（ナレーションはTTS読み形式）

# 2. NanoBanana画像生成
python3 generate_nanobanana_images.py

# 3. 合成画像作成（75%+25%レイアウト）
python3 create_composites.py

# 4. TTS音声生成（Google Cloud Neural2-D）
python3 regenerate_audio.py

# 5. 字幕生成（読み→表示変換付き）
python3 generate_subtitles_v2.py

# 6. 動画生成（drawtext方式）
python3 create_video_final.py

# 7. 動画教材フォルダに保存
cp final_video_v8.mp4 ~/Desktop/動画教材/"タイトル.mp4"
```

---

### 【7-8. 品質チェックリスト】

| 項目 | 確認方法 | 合格基準 |
|------|----------|----------|
| 字幕と画像の重なり | フレーム抽出して目視 | 字幕が字幕バー内に収まる |
| 固有名詞の分断 | grep "otebook\|bsidian" subtitles/ | ヒットなし |
| 語尾の孤立 | 短いチャンク(≤4文字)がないか | なし |
| 音声と字幕の同期 | 5分以降を再生確認 | ずれ1秒以内 |
| 読み/表示の分離 | 字幕に数字、音声でひらがな | 一致 |
| セグメント長 | ffprobe で確認 | 音声長と一致 |

---

**スキルバージョン: v10.0 (Subtitle Integration Edition)**
**追加日: 2026-01-06**
