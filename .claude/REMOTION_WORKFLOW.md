# Remotion統合ワークフロー - 完全技術仕様書

YouTube動画 → 日本語字幕付き研修動画の完全ワークフロー（Remotion必須）

---

## 目次

1. [技術スタック](#技術スタック)
2. [NGワード・禁止事項](#ngワード禁止事項)
3. [必須確定事項](#必須確定事項)
4. [完全ワークフロー](#完全ワークフロー)
5. [Wes Roth 15本動画生成手順](#wes-roth-15本動画生成手順)

---

## 技術スタック

### 必須技術（確定）

| カテゴリ | ツール/ライブラリ | バージョン | 用途 |
|---------|----------------|----------|------|
| **動画レンダリング** | Remotion | 4.0.399 | テロップ生成・動画合成 |
| **UI** | React | 19.2.3 | コンポーネント |
| **型システム** | TypeScript | 5.9.3 | 型安全 |
| **字幕機能** | @remotion/captions | 4.0.399 | TikTok風ハイライト |
| **フォント** | @remotion/fonts | 4.0.399 | 日本語フォント読み込み |
| **レイアウト** | @remotion/layout-utils | 4.0.399 | 自動フィット |
| **画像生成** | Google Gemini NanoBanana | - | 背景画像生成 |
| **TTS** | Google Cloud TTS Neural2-D | - | 日本語音声生成 |
| **LLM** | Ollama qwen2.5:32b | - | トランスクリプト→台本 |

---

## NGワード・禁止事項

### 🚫 絶対使用禁止

#### 1. FFmpeg drawtext フィルター
```bash
# ❌ 絶対禁止
ffmpeg -vf "drawtext=y=945:text='テキスト':enable='between(t,start,end)'"
```

#### 2. FFmpeg subtitles フィルター
```bash
# ❌ 絶対禁止
ffmpeg -vf "subtitles=file.srt:force_style='MarginV=100'"
```

#### 3. SRTファイル生成（Remotion不要）
```python
# ❌ 禁止（Remotionでは不要）
def generate_srt(text, output_path):
    # SRT形式不要
```

**禁止理由**:
- 字幕位置制御が不正確（MarginV効かない）
- アニメーション不可
- 日本語フォント制御困難
- タイミング同期問題（5分以降でズレ発生）
- TikTok風ハイライト不可能

---

## 必須確定事項

### ✅ 1. Remotion使用必須

**すべてのテロップ生成はRemotionで実行**

プロジェクトパス:
```
/Users/matsumototoshihiko/Desktop/テスト開発/videoJSON2/remotion-telop/
```

### ✅ 2. スタイルプリセット（6種類）

| スタイル | 用途 | フォントサイズ | 背景色 | アニメーション |
|---------|------|--------------|--------|--------------|
| **lecture** | 研修・講義（推奨） | 42px | rgba(0,0,0,0.6) | fade |
| **subtitle** | 字幕風 | 36px | rgba(0,0,0,0.7) | fade |
| **tiktok** | TikTok風ポップ | 64px | なし | pop |
| **news** | ニュース速報 | 32px | rgba(0,0,150,0.9) | slide |
| **variety** | バラエティ | 56px | なし | pop |
| **default** | 標準 | 48px | なし | fade |

**Wes Roth動画推奨**: `lecture` （研修品質）

### ✅ 3. アニメーション（13種類）

```typescript
type AnimationType =
  | "fadeIn"       // フェードイン
  | "fadeUp"       // 上からフェードイン
  | "fadeDown"     // 下からフェードイン
  | "slideLeft"    // 左からスライド
  | "slideRight"   // 右からスライド
  | "scaleUp"      // 拡大
  | "scaleDown"    // 縮小
  | "rotateIn"     // 回転
  | "bounceIn"     // バウンス（弾む）
  | "typewriter"   // タイプライター
  | "wave"         // 波（上下動）
  | "shake"        // 揺れる
  | "rainbow";     // 虹色変化
```

**Wes Roth動画推奨**: `fade` （標準）、重要セクションで `bounceIn` （強調）

### ✅ 4. 日本語フォント（3種類）

| フォント | 用途 | ウェイト |
|---------|------|---------|
| **Noto Sans JP** | 標準ゴシック（研修推奨） | 400, 700 |
| **M PLUS Rounded 1c** | 丸ゴシック（柔らかい） | 700 |
| **Zen Maru Gothic** | 角丸ゴシック | 700 |

**Wes Roth動画推奨**: `Noto Sans JP` （標準、読みやすい）

---

## 完全ワークフロー

### Phase 0: 準備

```bash
# 作業ディレクトリ作成
mkdir -p /path/to/project/{audio,images,composites,remotion,out}
cd /path/to/project
```

---

### Phase 1: YouTube URL → 英語トランスクリプト

#### Step 1-1: 音声ダウンロード
```bash
yt-dlp -f "bestaudio" -o "source_audio.%(ext)s" [YouTube URL]
```

#### Step 1-2: Whisper文字起こし
```bash
whisper source_audio.m4a \
  --model large-v3 \
  --language en \
  --output_format txt \
  --output_dir transcripts/
```

**出力**: `transcripts/source_audio.txt` (英語トランスクリプト)

---

### Phase 2: 英語トランスクリプト → 日本語sections.json

#### Ollama qwen2.5:32b で変換

```python
import json
import subprocess

def transcript_to_sections(transcript_path, video_title):
    with open(transcript_path) as f:
        transcript = f.read()

    prompt = f"""
以下の英語トランスクリプトから、日本語研修動画用のsections.jsonを生成してください。

【要件】
1. 30-50セクションに分割（各10-15秒）
2. 各セクションに日本語タイトルとナレーション
3. Remotion設定を含める
4. TTS用読み形式（数字は「ファイブステップ」等）

【トランスクリプト】
{transcript}

【出力フォーマット（JSON）】
{{
  "title": "{video_title}",
  "tts_voice": "ja-JP-Neural2-D",
  "remotion": {{
    "fps": 30,
    "width": 1920,
    "height": 1080,
    "defaultStyle": "lecture",
    "defaultAnimation": "fade"
  }},
  "sections": [
    {{
      "id": "s01",
      "title": "セクションタイトル",
      "narration": "ナレーション（TTS読み形式）",
      "telop": {{
        "style": "lecture",
        "animation": "fade",
        "position": "bottom"
      }}
    }}
  ]
}}
"""

    result = subprocess.run(
        ['ollama', 'run', 'qwen2.5:32b'],
        input=prompt,
        text=True,
        capture_output=True
    )

    # JSON抽出
    response = result.stdout
    json_start = response.find('{')
    json_end = response.rfind('}') + 1
    sections = json.loads(response[json_start:json_end])

    # 保存
    with open('sections.json', 'w', encoding='utf-8') as f:
        json.dump(sections, f, ensure_ascii=False, indent=2)

    return sections
```

**出力**: `sections.json`

---

### Phase 3: 画像生成（NanoBanana背景 + PIL日本語テキスト）

#### Step 3-1: NanoBanana背景生成（1920x810）

```bash
cd ~/.claude/skills/gemini-image-generator

# Video 3用（サイバーパンク）
python scripts/run.py image_generator.py \
  --prompt "Cyberpunk futuristic background, neon colors, abstract tech patterns, NO TEXT, NO WORDS, clean background" \
  --output /path/to/project/images/s01_bg.png
```

**重要**: テキストなしの背景のみ

#### Step 3-2: PIL日本語テキスト配置（1920x810）

```python
from PIL import Image, ImageDraw, ImageFont

def add_japanese_text(bg_path, section, output_path):
    """背景に日本語テキスト配置"""
    img = Image.open(bg_path)
    draw = ImageDraw.Draw(img)

    # Noto Sans JP（Remotionと統一）
    font_title = ImageFont.truetype("NotoSansJP-Bold.ttf", 72)
    font_body = ImageFont.truetype("NotoSansJP-Regular.ttf", 48)

    # タイトル配置（中央上部）
    title = section['title']
    title_bbox = draw.textbbox((0, 0), title, font=font_title)
    title_w = title_bbox[2] - title_bbox[0]
    title_x = (1920 - title_w) // 2

    # 縁取り（4方向）
    for offset in [(-3,-3), (-3,3), (3,-3), (3,3)]:
        draw.text((title_x + offset[0], 100 + offset[1]), title,
                  font=font_title, fill='black')
    draw.text((title_x, 100), title, font=font_title, fill='white')

    # 本文配置（中央）
    body = section['narration'].split('。')[0] + '。'
    body_bbox = draw.textbbox((0, 0), body, font=font_body)
    body_w = body_bbox[2] - body_bbox[0]
    body_x = (1920 - body_w) // 2

    for offset in [(-2,-2), (-2,2), (2,-2), (2,2)]:
        draw.text((body_x + offset[0], 400 + offset[1]), body,
                  font=font_body, fill='black')
    draw.text((body_x, 400), body, font=font_body, fill='white')

    img.save(output_path)
```

#### Step 3-3: 75%+25%合成（1920x1080）

```python
def create_composite_1920x1080(img_810_path, output_path):
    """画像エリア75% + 字幕バー25%"""
    WIDTH, HEIGHT = 1920, 1080
    IMG_HEIGHT = 810
    SUB_BAR_COLOR = (26, 42, 74)  # #1A2A4A ダークブルー

    img = Image.open(img_810_path)
    canvas = Image.new('RGB', (WIDTH, HEIGHT), SUB_BAR_COLOR)
    canvas.paste(img, (0, 0))
    canvas.save(output_path)

# 全セクション処理
for section in sections['sections']:
    # 背景生成（省略）
    # テキスト配置
    add_japanese_text(
        f"images/{section['id']}_bg.png",
        section,
        f"images/{section['id']}.png"
    )
    # 合成
    create_composite_1920x1080(
        f"images/{section['id']}.png",
        f"composites/{section['id']}.png"
    )
```

**出力**: `composites/s01.png`, `s02.png`, ... (1920x1080)

---

### Phase 4: TTS音声生成（Google Cloud Neural2-D）

```python
from google.cloud import texttospeech

client = texttospeech.TextToSpeechClient()

def generate_tts_audio(section, output_path):
    voice = texttospeech.VoiceSelectionParams(
        language_code="ja-JP",
        name="ja-JP-Neural2-D"  # 女性、自然
    )

    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=1.0  # 標準速度
    )

    response = client.synthesize_speech(
        input=texttospeech.SynthesisInput(text=section['narration']),
        voice=voice,
        audio_config=audio_config
    )

    with open(output_path, 'wb') as f:
        f.write(response.audio_content)

    # 音声長取得（Remotionで使用）
    import subprocess
    duration = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries',
         'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1',
         output_path],
        capture_output=True, text=True
    ).stdout.strip()

    section['audio_duration'] = float(duration)

# 全セクション生成
for section in sections['sections']:
    generate_tts_audio(section, f"audio/{section['id']}.mp3")

# sections.json更新（音声長追加）
with open('sections.json', 'w') as f:
    json.dump(sections, f, ensure_ascii=False, indent=2)
```

**出力**: `audio/s01.mp3`, `s02.mp3`, ...

---

### Phase 5: 読み/表示変換

```typescript
function convertReadingToDisplay(text: string): string {
  const replacements: [string, string][] = [
    ['ファイブステップ', '5ステップ'],
    ['いち、', '１、'], ['に、', '２、'], ['さん、', '３、'],
    ['よん、', '４、'], ['ご、', '５、'],
    ['80パーセント', '80%'], ['50パーセント', '50%'],
    ['いつつ', '5つ'], ['ごふん', '5分'], ['じゅっぷん', '10分']
  ];

  return replacements.reduce((t, [old, n]) => t.replace(new RegExp(old, 'g'), n), text);
}
```

---

### Phase 6: Remotion VideoSegment生成

```typescript
// remotion/segments.ts
import { VideoSegment } from 'remotion-telop';
import { convertReadingToDisplay } from './utils';

export function generateVideoSegments(sections: any): VideoSegment[] {
  const segments: VideoSegment[] = [];
  let currentFrame = 0;
  const fps = 30;

  for (const section of sections.sections) {
    const durationInFrames = Math.round(section.audio_duration * fps);
    const displayText = convertReadingToDisplay(section.narration);

    segments.push({
      id: section.id,
      startFrame: currentFrame,
      durationInFrames,
      backgroundImage: `/path/to/composites/${section.id}.png`,
      telop: {
        text: displayText,
        style: section.telop?.style || 'lecture',
        position: section.telop?.position || 'bottom',
        animation: section.telop?.animation || 'fade'
      },
      audioSrc: `/path/to/audio/${section.id}.mp3`
    });

    currentFrame += durationInFrames;
  }

  return segments;
}

export const videoSegments = generateVideoSegments(sectionsData);
export const totalFrames = videoSegments.reduce((sum, s) => sum + s.durationInFrames, 0);
```

---

### Phase 7: Remotionコンポジション登録

```typescript
// src/Root.tsx
import React from 'react';
import { Composition } from 'remotion';
import { TelopVideo } from 'remotion-telop';
import { videoSegments, totalFrames } from './remotion/segments';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="WesRothVideo03"
      component={TelopVideo}
      durationInFrames={totalFrames}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        segments: videoSegments
      }}
    />
  );
};
```

---

### Phase 8: Remotionレンダリング

```bash
cd /Users/matsumototoshihiko/Desktop/テスト開発/videoJSON2/remotion-telop

# レンダリング実行
npx remotion render WesRothVideo03 out/final_video.mp4 \
  --codec h264 \
  --crf 23 \
  --audio-codec aac \
  --audio-bitrate 192k \
  --overwrite

# 確認
ls -lh out/final_video.mp4
ffprobe out/final_video.mp4
```

**パラメータ**:
- `--codec h264`: H.264エンコード
- `--crf 23`: 品質（18=高品質、28=低品質）
- `--audio-codec aac`: AAC音声
- `--audio-bitrate 192k`: 音声品質

**出力**: `out/final_video.mp4` (100-500MB)

---

### Phase 9: 保存

```bash
mkdir -p ~/Desktop/YouTube動画教材
cp out/final_video.mp4 ~/Desktop/YouTube動画教材/"WesRoth_03_CodeRed終了OpenAI爆発_HQ.mp4"
```

---

## Wes Roth 15本動画生成手順

### 動画リスト

| # | タイトル | video_id | スタイル | アニメーション |
|---|---------|----------|---------|--------------|
| 3 | Code Red Over, OpenAI is about to blow | F9EKRZ0wdxE | lecture | fade (重要部分でbounceIn) |
| 4 | GPT 5.2 is the first HUMAN LABOR replacement | aNYl-O-XxCA | lecture | fade |
| 5 | Google DeepMind: The arrival of AGI | hUabJaV0h8w | lecture | bounceIn (タイトル) |
| 6 | OpenAI is Hiding the Truth | NhMq52kqjC4 | news | slide |
| 7 | AI earns while you sleep | ivxVIdyY_Jc | lecture | fade |
| 8 | Avi Loeb reveals the truth about 3I/ATLAS | 3LAFmwf0RMM | lecture | fade |
| 9 | Can Grok and Claude run a business? | 37KHTE_HA2Y | lecture | fade |
| 10 | the creator of Claude Code just revealed the truth | fOKeVX8ZdDU | lecture | bounceIn (重要) |
| 11 | Meta just did the thing | XxsDlctCS1Y | tiktok | pop |
| 12 | Google's Infinite Learning and OpenAI's leaked AI Pen | yCYGNXNKoqw | lecture | fade |
| 13 | Lee Cronin: Sam Altman Is Delusional... | ATxeVj-JMlo | news | slide |
| 14 | the GOD company is coming... | jbBi1dlAbaQ | lecture | rainbow (タイトル) |
| 15 | this experiment could END the AI hype | EWAUutf9xKQ | lecture | fade |

### 自動化スクリプト

```python
# generate_all_wes_roth_videos.py
import json
from pathlib import Path

VIDEOS = [
    {"num": 3, "id": "F9EKRZ0wdxE", "title": "Code Red Over, OpenAI爆発"},
    {"num": 4, "id": "aNYl-O-XxCA", "title": "GPT5.2労働代替"},
    # ... 残り11本
]

BASE_DIR = Path("/Users/matsumototoshihiko/Desktop/テスト開発/videoJSON2/projects/wes_roth_videos_hq")
TRANSCRIPTS = Path("/Users/matsumototoshihiko/Desktop/テスト開発/videoJSON2/projects/wes_roth_summary/work/transcripts.json")

def generate_video(video_info):
    video_num = video_info['num']
    video_id = video_info['id']
    title = video_info['title']

    project_dir = BASE_DIR / f"video_{video_num:02d}"
    project_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"Video {video_num}: {title}")
    print(f"{'='*60}\n")

    # Phase 1: トランスクリプト取得
    with open(TRANSCRIPTS) as f:
        all_transcripts = json.load(f)
    transcript = all_transcripts[video_id]

    # Phase 2: sections.json生成（Ollama）
    sections = transcript_to_sections(transcript, title, project_dir)

    # Phase 3: 画像生成（全セクション）
    for section in sections['sections']:
        generate_images(section, project_dir)

    # Phase 4: TTS音声生成
    for section in sections['sections']:
        generate_audio(section, project_dir)

    # Phase 5: Remotion segments生成
    generate_remotion_segments(sections, project_dir)

    # Phase 6: Remotionレンダリング
    render_remotion_video(video_num, project_dir)

    # Phase 7: 保存
    save_final_video(video_num, title, project_dir)

    print(f"\n✓ Video {video_num} 完成\n")

# 全動画生成
for video in VIDEOS:
    generate_video(video)

print("\n{'='*60}")
print("全15本の動画生成完了！")
print(f"{'='*60}\n")
```

---

## 高度な機能

### TikTok風ワードハイライト（Video 11で使用）

```typescript
import { createCaptionSegments } from 'remotion-telop';

const captionSegment = createCaptionSegments(
  'Metaがついに大発表！',
  0,      // 開始フレーム
  30,     // FPS
  3       // 1秒あたり3単語
);

const segment: VideoSegment = {
  id: 's01',
  startFrame: 0,
  durationInFrames: 90,
  backgroundImage: '/path/to/image.png',
  captions: [captionSegment],  // TikTok風ハイライト
  audioSrc: '/path/to/audio.mp3'
};
```

**効果**: 読み上げに同期して単語ごとに黄色ハイライト（カラオケ風）

### 虹色アニメーション（Video 14で使用）

```typescript
const segment: VideoSegment = {
  id: 'god_company_title',
  startFrame: 0,
  durationInFrames: 60,
  backgroundColor: '#000000',
  animatedText: {
    text: '神企業到来',
    animationType: 'rainbow',  // 虹色変化
    position: 'center'
  }
};
```

**効果**: 文字色が虹色に連続変化（神秘的演出）

---

## まとめ

### Remotionワークフローの優位性

| 項目 | Remotion | FFmpeg drawtext |
|------|----------|----------------|
| 字幕位置制御 | ✅ 完璧（React CSS） | ❌ 不正確 |
| アニメーション | ✅ 13種類 | ❌ なし |
| 日本語フォント | ✅ 3種類完全対応 | ⚠️ 限定的 |
| タイミング同期 | ✅ フレーム単位 | ❌ ズレ発生 |
| TikTok風ハイライト | ✅ 標準機能 | ❌ 不可能 |
| プログラマブル制御 | ✅ TypeScript | ❌ FFmpegコマンド |
| プレビュー | ✅ Remotion Studio | ❌ レンダリング後のみ |

### 必須技術スタック

- ✅ Remotion 4.0.399（必須）
- ✅ React 19.2.3
- ✅ TypeScript 5.9.3
- ✅ Google Gemini NanoBanana（画像生成）
- ✅ Google Cloud TTS Neural2-D（音声生成）
- ✅ Ollama qwen2.5:32b（LLM）

### NGワード

- ❌ FFmpeg drawtext フィルター（絶対禁止）
- ❌ FFmpeg subtitles フィルター（絶対禁止）
- ❌ SRTファイル生成（Remotionでは不要）

---

**作成日**: 2026-01-10
**バージョン**: 1.0 - Remotion統合版
