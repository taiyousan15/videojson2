# 字幕付き研修動画生成スキル v2.0 - Remotion統合版

sections.jsonから字幕付きMP4動画を **Remotion** で自動生成するスキル。

---

## 【❌ 絶対禁止事項（NGワード）】

### 🚫 FFmpeg drawtext フィルター使用禁止
```python
# ❌ 絶対禁止
ffmpeg -vf "drawtext=y=945:text='テキスト':enable='between(t,start,end)'"
```

### 🚫 FFmpeg subtitles フィルター使用禁止
```python
# ❌ 絶対禁止
ffmpeg -vf "subtitles=file.srt:force_style='MarginV=100'"
```

**理由**:
- 字幕位置制御が不正確
- アニメーション不可
- 日本語フォント制御困難
- タイミング同期問題

---

## 【✅ 必須確定事項】

### 1. Remotion使用必須
**テロップ生成は必ずRemotionで実行**

```bash
# 必須プロジェクト
/Users/matsumototoshihiko/Desktop/テスト開発/videoJSON2/remotion-telop/
```

### 2. 使用技術スタック（確定）

| 技術 | バージョン | 用途 |
|------|----------|------|
| **Remotion** | 4.0.399 | 動画レンダリングエンジン |
| **React** | 19.2.3 | UIコンポーネント |
| **TypeScript** | 5.9.3 | 型安全 |
| **@remotion/captions** | 4.0.399 | TikTok風ワードハイライト |
| **@remotion/fonts** | 4.0.399 | 日本語フォント読み込み |
| **@remotion/layout-utils** | 4.0.399 | 自動フィット |

### 3. スタイルプリセット（6種類）

| スタイル | 用途 | フォントサイズ | アニメーション |
|---------|------|--------------|--------------|
| **lecture** | 研修・講義（推奨） | 42px | fade |
| **subtitle** | 字幕風 | 36px | fade |
| **tiktok** | TikTok風ポップ | 64px | pop |
| **news** | ニュース速報 | 32px | slide |
| **variety** | バラエティ | 56px | pop |
| **default** | 標準 | 48px | fade |

### 4. アニメーション（13種類）

```typescript
"fadeIn" | "fadeUp" | "fadeDown" | "slideLeft" | "slideRight" |
"scaleUp" | "scaleDown" | "rotateIn" | "bounceIn" | "typewriter" |
"wave" | "shake" | "rainbow"
```

### 5. 日本語フォント（3種類）

- **Noto Sans JP**: 標準ゴシック（研修推奨）
- **M PLUS Rounded 1c**: 丸ゴシック（柔らかい印象）
- **Zen Maru Gothic**: 角丸ゴシック

---

## 【必須ルール】実行前に必ず確認

### ルール1: 固有名詞は分割禁止
```typescript
const PROTECTED_WORDS = [
  'NotebookLM', 'Obsidian', 'Markdown', 'YouTube', 'Google',
  'OpenAI', 'Claude', 'Pentagon', 'AGI', 'DeepMind', 'Grok'
];

function smartSplitText(text: string, maxLength: number): string[] {
  // 固有名詞の途中で切断しない
}
```
**理由**: "NotebookLM"が"N"と"otebookLM"に分断される。

---

### ルール2: 語尾は孤立禁止
```typescript
// ❌ 禁止: "〜にもなりま" → "す。"
// ✅ 正解: "〜にもなります。"

if (chunk.length <= 6 && previousChunk) {
  previousChunk += chunk;  // 6文字以下は前にマージ
}
```

---

### ルール3: 読みと表示を分離
```typescript
// sections.json（TTS用）
"narration": "ファイブステップで進めます。いち、情報収集。"

// Remotion表示（変換後）
"displayText": "5ステップで進めます。１、情報収集。"

function convertReadingToDisplay(text: string): string {
  const replacements: [string, string][] = [
    ['ファイブステップ', '5ステップ'],
    ['いち、', '１、'], ['に、', '２、'], ['さん、', '３、'],
    ['よん、', '４、'], ['ご、', '５、'],
    ['80パーセント', '80%'], ['50パーセント', '50%'],
  ];
  return replacements.reduce((t, [old, n]) => t.replace(old, n), text);
}
```
**理由**: TTSは「ファイブステップ」と読み、字幕は「5ステップ」と表示したい。

---

### ルール4: レイアウトは75%+25%固定
```
1920x1080
├── 0-810px:    画像エリア (75%)
└── 810-1080px: 字幕バー (25%, ダークブルー #1A2A4A)

字幕位置: bottom（Remotion自動計算）
```

---

## 【プロジェクト構成】

```
projects/{project_name}/
├── sections.json              # 必須: セクション定義
├── audio/                     # TTS音声
│   ├── s01.mp3
│   └── ...
├── images/                    # 背景画像（1920x810）
│   ├── s01.png
│   └── ...
├── composites/                # 合成画像（1920x1080）
│   ├── s01.png
│   └── ...
├── remotion/                  # Remotion設定
│   ├── segments.ts            # VideoSegment配列
│   └── render-config.json     # レンダリング設定
└── out/
    └── final_video.mp4        # 出力
```

---

## 【sections.json フォーマット】

```json
{
  "title": "動画タイトル",
  "duration_target": "8:55",
  "tts_voice": "ja-JP-Neural2-D",
  "remotion": {
    "fps": 30,
    "width": 1920,
    "height": 1080,
    "defaultStyle": "lecture",
    "defaultAnimation": "fade"
  },
  "sections": [
    {
      "id": "s01",
      "title": "セクションタイトル",
      "narration": "ナレーション文（TTS読み形式）",
      "display_time": 10,
      "telop": {
        "style": "lecture",
        "animation": "fade",
        "position": "bottom"
      }
    }
  ]
}
```

### ナレーション記述ルール
| 表示したい | 書き方（TTS用） |
|-----------|----------------|
| 5ステップ | ファイブステップ |
| ①②③④⑤ | いち、に、さん、よん、ご、 |
| 5つ | いつつ |
| 5分 | ごふん |
| 10分 | じゅっぷん |
| 80% | 80パーセント |
| 3倍 | さん倍 |

---

## 【完全実行手順】

### Step 1: sections.json作成
```json
{
  "title": "タイトル",
  "tts_voice": "ja-JP-Neural2-D",
  "remotion": {
    "fps": 30,
    "width": 1920,
    "height": 1080,
    "defaultStyle": "lecture"
  },
  "sections": [...]
}
```

---

### Step 2: 背景画像生成（1920x810）
```bash
# NanoBanana（gemini-image-generator）
cd ~/.claude/skills/gemini-image-generator

python scripts/run.py image_generator.py \
  --prompt "Abstract tech background, no text, 1920x810" \
  --output /path/to/project/images/s01.png
```

**重要**: テキストなしの背景のみ生成

---

### Step 3: PIL日本語テキスト配置（1920x810）
```python
from PIL import Image, ImageDraw, ImageFont

FONT = "Noto Sans JP"  # Remotionと統一
FONT_SIZE_TITLE = 72
FONT_SIZE_BODY = 48

def add_japanese_text_to_background(bg_path, section, output_path):
    """背景に日本語テキスト配置（1920x810）"""
    img = Image.open(bg_path)
    draw = ImageDraw.Draw(img)

    # フォント読み込み（Google Fonts）
    font_title = ImageFont.truetype("NotoSansJP-Bold.ttf", FONT_SIZE_TITLE)
    font_body = ImageFont.truetype("NotoSansJP-Regular.ttf", FONT_SIZE_BODY)

    # タイトル配置（中央上部）
    title = section['title']
    title_bbox = draw.textbbox((0, 0), title, font=font_title)
    title_w = title_bbox[2] - title_bbox[0]
    title_x = (1920 - title_w) // 2

    # 縁取り
    for offset in [(-3,-3), (-3,3), (3,-3), (3,3)]:
        draw.text((title_x + offset[0], 100 + offset[1]), title,
                  font=font_title, fill='black')
    draw.text((title_x, 100), title, font=font_title, fill='white')

    img.save(output_path)
```

---

### Step 4: 合成画像作成（1920x1080）
```python
def create_composite_1920x1080(img_810_path, output_path):
    """75%画像 + 25%字幕バー"""
    WIDTH, HEIGHT = 1920, 1080
    IMG_HEIGHT = 810
    SUB_BAR_COLOR = (26, 42, 74)  # #1A2A4A

    img = Image.open(img_810_path)
    canvas = Image.new('RGB', (WIDTH, HEIGHT), SUB_BAR_COLOR)
    canvas.paste(img, (0, 0))
    canvas.save(output_path)
```

---

### Step 5: TTS音声生成
```python
from google.cloud import texttospeech

client = texttospeech.TextToSpeechClient()

def generate_tts_audio(section, output_path):
    voice = texttospeech.VoiceSelectionParams(
        language_code="ja-JP",
        name="ja-JP-Neural2-D"
    )

    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=1.0
    )

    response = client.synthesize_speech(
        input=texttospeech.SynthesisInput(text=section['narration']),
        voice=voice,
        audio_config=audio_config
    )

    with open(output_path, 'wb') as f:
        f.write(response.audio_content)
```

---

### Step 6: Remotion VideoSegment生成
```typescript
// remotion/segments.ts
import { VideoSegment } from 'remotion-telop';

export const videoSegments: VideoSegment[] = [
  {
    id: 's01',
    startFrame: 0,
    durationInFrames: 300,  // 10秒 @ 30fps
    backgroundImage: '/path/to/composites/s01.png',
    telop: {
      text: '5ステップで進めます。１、情報収集。',  // 表示用変換後
      style: 'lecture',
      position: 'bottom',
      animation: 'fade'
    },
    audioSrc: '/path/to/audio/s01.mp3'
  },
  {
    id: 's02',
    startFrame: 300,
    durationInFrames: 450,  // 15秒
    backgroundImage: '/path/to/composites/s02.png',
    telop: {
      text: '２、デジタル化を進めます。',
      style: 'lecture',
      position: 'bottom',
      animation: 'fade'
    },
    audioSrc: '/path/to/audio/s02.mp3'
  }
];
```

---

### Step 7: Remotionコンポジション登録
```typescript
// src/Root.tsx
import React from 'react';
import { Composition } from 'remotion';
import { TelopVideo } from 'remotion-telop';
import { videoSegments } from './remotion/segments';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="WesRothVideo"
      component={TelopVideo}
      durationInFrames={750}  // 総フレーム数
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

### Step 8: Remotionレンダリング
```bash
cd /Users/matsumototoshihiko/Desktop/テスト開発/videoJSON2/remotion-telop

# レンダリング実行
npx remotion render WesRothVideo out/final_video.mp4 \
  --codec h264 \
  --audio-codec aac \
  --audio-bitrate 192k \
  --crf 23 \
  --overwrite
```

**パラメータ**:
- `--codec h264`: H.264エンコード
- `--crf 23`: 品質（18=高品質、28=低品質）
- `--audio-codec aac`: 音声コーデック
- `--audio-bitrate 192k`: 音声品質

---

### Step 9: 保存
```bash
mkdir -p ~/Desktop/YouTube動画教材
cp out/final_video.mp4 ~/Desktop/YouTube動画教材/"タイトル.mp4"
```

---

## 【高度な機能】

### TikTok風ワードハイライト使用
```typescript
import { createCaptionSegments } from 'remotion-telop';

const captionSegment = createCaptionSegments(
  '5ステップで進めます。１、情報収集。',
  0,      // 開始フレーム
  30,     // FPS
  3       // 1秒あたり3単語
);

const segment: VideoSegment = {
  id: 's01',
  startFrame: 0,
  durationInFrames: 300,
  backgroundImage: '/path/to/image.png',
  captions: [captionSegment],  // TikTok風ハイライト
  audioSrc: '/path/to/audio.mp3'
};
```

**効果**: 読み上げに同期して単語ごとに黄色ハイライト（カラオケ風）

---

### バラエティ番組風アニメーション
```typescript
import { AnimatedText } from 'remotion-telop';

const segment: VideoSegment = {
  id: 's01',
  startFrame: 0,
  durationInFrames: 90,
  backgroundColor: '#0984e3',
  animatedText: {
    text: 'AGI到来！',
    animationType: 'bounceIn',  // 弾むアニメーション
    position: 'center'
  }
};
```

**効果**: 文字が弾んで登場（インパクト大）

---

### 虹色アニメーション（rainbow）
```typescript
const segment: VideoSegment = {
  id: 'impact',
  startFrame: 0,
  durationInFrames: 60,
  backgroundColor: '#000000',
  animatedText: {
    text: 'OpenAI真実隠蔽',
    animationType: 'rainbow',  // 虹色変化
    position: 'center'
  }
};
```

**効果**: 文字色が虹色に変化（派手な演出）

---

## 【品質チェックリスト】

実行後、必ず以下を確認：

| # | チェック項目 | 確認方法 | 合格基準 |
|---|-------------|----------|----------|
| 1 | Remotionレンダリング成功 | 出力ファイル確認 | MP4生成済み |
| 2 | 字幕が字幕バー内に収まる | 再生確認 | Y=810-1080範囲内 |
| 3 | 固有名詞が分断されていない | 字幕目視 | "NotebookLM"完全 |
| 4 | 語尾が孤立していない | 字幕目視 | 6文字以下なし |
| 5 | 音声と字幕が同期 | 再生確認 | ズレなし |
| 6 | 数字が正しく表示 | 字幕で「１、２、」 | 数字表示 |
| 7 | アニメーション動作 | 再生確認 | fade/pop動作 |
| 8 | 日本語フォント表示 | フレーム確認 | Noto Sans JP |

---

## 【トラブルシューティング】

| 問題 | 原因 | 解決 |
|------|------|------|
| FFmpeg drawtextエラー | 禁止技術使用 | Remotion Telopに変更 |
| 字幕が表示されない | VideoSegment設定ミス | telop.textを確認 |
| アニメーション動かない | animation未指定 | 'fade'を指定 |
| フォントが表示されない | フォント未読み込み | preloadJapaneseFonts()実行 |
| 音声が再生されない | audioSrc未指定 | 絶対パスで指定 |
| レンダリング失敗 | durationInFrames不一致 | 音声長から計算 |

---

## 【ワークフロー自動化スクリプト】

### 完全自動生成（sections.json → MP4）

```python
# generate_remotion_video.py
import json
import subprocess
from pathlib import Path

def sections_to_remotion_segments(sections_json_path, project_dir):
    """sections.json → Remotion VideoSegments"""

    with open(sections_json_path) as f:
        data = json.load(f)

    segments = []
    current_frame = 0
    fps = data.get('remotion', {}).get('fps', 30)

    for section in data['sections']:
        # 音声長取得
        audio_path = project_dir / f"audio/{section['id']}.mp3"
        duration = get_audio_duration(audio_path)
        frames = int(duration * fps)

        # 読み→表示変換
        display_text = convert_reading_to_display(section['narration'])

        segment = {
            'id': section['id'],
            'startFrame': current_frame,
            'durationInFrames': frames,
            'backgroundImage': str(project_dir / f"composites/{section['id']}.png"),
            'telop': {
                'text': display_text,
                'style': section.get('telop', {}).get('style', 'lecture'),
                'position': 'bottom',
                'animation': section.get('telop', {}).get('animation', 'fade')
            },
            'audioSrc': str(audio_path)
        }
        segments.append(segment)
        current_frame += frames

    return segments, current_frame

def render_with_remotion(segments, total_frames, output_path):
    """Remotionレンダリング実行"""

    # segments.tsに書き出し
    segments_ts = f"""
import {{ VideoSegment }} from 'remotion-telop';

export const videoSegments: VideoSegment[] = {json.dumps(segments, indent=2)};
export const totalFrames = {total_frames};
"""

    Path('remotion/segments.ts').write_text(segments_ts)

    # Remotionレンダリング
    subprocess.run([
        'npx', 'remotion', 'render', 'WesRothVideo', output_path,
        '--codec', 'h264',
        '--crf', '23',
        '--audio-codec', 'aac',
        '--audio-bitrate', '192k',
        '--overwrite'
    ], check=True)

# 実行
project_dir = Path('/path/to/project')
segments, total = sections_to_remotion_segments(
    project_dir / 'sections.json',
    project_dir
)
render_with_remotion(segments, total, project_dir / 'out/final.mp4')
```

---

## 【バージョン履歴】

| Ver | 日付 | 変更内容 |
|-----|------|----------|
| 2.0 | 2026-01-10 | Remotion統合版（FFmpeg drawtext完全廃止） |
| 1.0 | 2026-01-06 | 初版作成（FFmpegベース） |

---

## 【技術的優位性】

### Remotion vs FFmpeg drawtext

| 項目 | Remotion | FFmpeg drawtext |
|------|----------|----------------|
| **字幕位置制御** | ✅ 完璧（React CSS） | ❌ 不正確（MarginV効かない） |
| **アニメーション** | ✅ 13種類 | ❌ なし |
| **日本語フォント** | ✅ 3種類完全対応 | ⚠️ 限定的 |
| **タイミング同期** | ✅ フレーム単位 | ❌ ズレ発生 |
| **TikTok風ハイライト** | ✅ 標準機能 | ❌ 不可能 |
| **プログラマブル制御** | ✅ TypeScript | ❌ FFmpegコマンド |
| **プレビュー** | ✅ Remotion Studio | ❌ レンダリング後のみ |

---

**実績プロジェクト（予定）**: `projects/wes_roth_videos_hq/video_01/`
**完成動画（予定）**: `WesRoth_01_Meta大発表_HQ.mp4`

**必須技術**: Remotion 4.0.399 + React 19.2.3 + TypeScript 5.9.3
