---
name: tts_video_generator
description: 元動画から日本語ナレーション付き動画を生成する完全ワークフロー。Google Cloud TTS Neural2で高品質な日本語音声を生成。
triggers:
  - "動画を日本語化"
  - "日本語ナレーション動画"
  - "TTS動画生成"
  - "Neural2で動画"
  - "研修動画を作成"
inputs:
  - 元動画（YouTubeリンク または 動画ファイル）
  - テーマ/対象者（任意）
outputs:
  - 日本語ナレーション付き動画（MP4）
  - sections_data.json（セクション定義）
  - 音声ファイル（MP3 × セクション数）
---

# 元動画 → 日本語動画 完全ワークフロー

---

## ■ 最重要原則（絶対遵守）

### 【絶対禁止事項】

| 禁止事項 | 理由 |
|----------|------|
| **元動画からの画像・フレームの切り出し・コピー** | ユーザーが明示的に禁止。著作権リスク |
| **元動画のフレームを背景として使用** | 暗くしても、ぼかしても禁止 |
| **元動画の映像を加工して再利用** | いかなる形式での再利用も禁止 |
| プレースホルダー（「[画像]」等）の使用 | 不完全な教材になる |

### 【必須実行事項】

| 必須事項 | 方法 |
|----------|------|
| 映像の新規生成 | **Sora2** または **NanoBanana** で生成 |
| 背景画像の新規生成 | **NanoBanana** で類似イメージを生成 |
| スライド画像の新規作成 | **PIL** でテキスト配置 + **NanoBanana** で画像生成 |

### 【違反時の対応】

上記禁止事項に違反した場合は、**全工程をやり直す**こと。

---

## 前提条件

### 必須設定
- Google Cloud プロジェクト設定済み
- Text-to-Speech API 有効化済み
- FAL API キー（Sora2用）

### GCP設定コマンド（未設定の場合）
```bash
gcloud config set project YOUR_PROJECT_ID
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
gcloud services enable texttospeech.googleapis.com
```

---

## Step 1: プロジェクト構成を作成

```
projects/{project_name}/
├── work/
│   └── sections_data.json   # セクション定義・ナレーション
├── video/
│   └── s01_sora2.mp4        # Sora2生成映像
├── audio_gcloud/
│   └── neural2_d_male/      # 日本語音声（Neural2-D推奨）
├── .tmp/
│   └── s01.ass              # 字幕ファイル
└── outputs/
    └── final.mp4            # 最終動画
```

---

## Step 2: 画面切り替えを計測

**セクション数 = 元動画の画面切り替え回数**（動画長さから推定しない）

```bash
# フレーム抽出（1秒間隔）
ffmpeg -i input.mp4 -vf "fps=1" frames/frame_%04d.png
```

### 画面切り替えの定義
- ✓ スライドが変わった → カウント
- ✓ 主要な画像が変わった → カウント
- ✓ レイアウトが大きく変わった → カウント
- ✗ 同じスライド内のアニメーション → カウントしない
- ✗ マウスカーソルの移動 → カウントしない

---

## Step 3: sections_data.json を作成

画面切り替えログに基づき、セクション構成を定義する。

```json
{
  "title": "動画タイトル",
  "sections": [
    {
      "id": "s01",
      "title": "導入",
      "narration": "日本語ナレーション文（ここが音声になる）",
      "telop": {
        "main_title": "メインタイトル",
        "subtitle": "サブタイトル"
      },
      "sora_prompt": "Sora2用の映像生成プロンプト（英語）"
    }
  ]
}
```

### ナレーション作成のポイント
- 元動画のコピーにならないよう、内容を再構成する
- 初心者向けの平易な言葉を使う
- 1セクション20-40秒程度が目安

---

## Step 4: セクション検証（必須）

```bash
# 検証スクリプト実行
python3 scripts/validate_sections.py --sections work/sections_data.json --video input.mp4
```

### 合格基準
- カバー率 = 100%（セクション欠落がないこと）
- ギャップ = 0（タイムスタンプが連続していること）

### 検証失敗時
```bash
# ギャップ部分のフレームを抽出して確認
python3 scripts/validate_sections.py --sections work/sections_data.json --video input.mp4 --extract-gaps
```

---

## Step 5: Sora2 映像を生成（FAL API）

各セクションの sora_prompt を使って映像を生成。

```bash
# FAL APIで生成（約12秒/本）
# 生成後: video/s01_sora2.mp4, s02_sora2.mp4, ...
```

---

## Step 6: 日本語音声を生成（Google Cloud TTS Neural2）

### 重要: 日本語は必ず Neural2 を使用

| 音声ID | 特徴 | 推奨用途 |
|--------|------|----------|
| ja-JP-Neural2-B | 女性・ニュースアナウンサー風 | 公式発表、報告 |
| ja-JP-Neural2-C | 男性・落ち着いた | ナレーション |
| ja-JP-Neural2-D | 男性・明るい | 研修、プレゼン（推奨） |

### 生成スクリプト

```python
from google.cloud import texttospeech

client = texttospeech.TextToSpeechClient()

def generate_audio(text: str, output_path: str, voice_name: str = "ja-JP-Neural2-D"):
    synthesis_input = texttospeech.SynthesisInput(text=text)

    voice = texttospeech.VoiceSelectionParams(
        language_code="ja-JP",
        name=voice_name
    )

    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=0.95,  # 研修向けに少しゆっくり
        effects_profile_id=["headphone-class-device"]
    )

    response = client.synthesize_speech(
        input=synthesis_input,
        voice=voice,
        audio_config=audio_config
    )

    with open(output_path, "wb") as out:
        out.write(response.audio_content)
```

---

## Step 7: 動画合成（FFmpeg）

### 重要: `-map` で音声を明示的に指定

Sora2映像には元音声が含まれている場合があるため、必ず `-map 0:v -map 1:a` で日本語音声を指定する。

```bash
# 各セクションを合成
ffmpeg -y -stream_loop -1 -i video/s01_sora2.mp4 -i audio_gcloud/neural2_d_male/s01_narration.mp3 \
  -map 0:v -map 1:a \
  -vf "ass=.tmp/s01.ass" \
  -t $(音声の長さ) \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 192k \
  .tmp/s01_composite.mp4
```

### よくあるミス（回避必須）
```bash
# ❌ NG: -map を指定しないと元音声が使われる
ffmpeg -i video.mp4 -i audio.mp3 -shortest output.mp4

# ✓ OK: 明示的に映像(0:v)と音声(1:a)を指定
ffmpeg -i video.mp4 -i audio.mp3 -map 0:v -map 1:a output.mp4
```

---

## Step 8: 全セクション結合

```bash
# concat_list.txt
file 's01_composite.mp4'
file 's02_composite.mp4'
file 's03_composite.mp4'
...

# 結合
ffmpeg -y -f concat -safe 0 -i concat_list.txt \
  -c:v libx264 -preset medium -crf 22 \
  -c:a aac -b:a 192k \
  outputs/final.mp4
```

---

## コスト目安（6セクション動画の場合）

| 項目 | コスト |
|------|--------|
| Sora2 映像（72秒） | 約 $7.26（約1,090円） |
| Google TTS（1,000文字） | 無料枠内（月100万文字まで） |
| **合計** | **約1,100円/動画** |

---

## ガードレール（必須）

1. **画像・映像の新規生成（最重要）**: 元動画のフレーム・画像は一切使用禁止。すべてSora2またはNanoBananaで新規生成すること
2. **著作権**: 元動画の台本をそのまま使わない（構成の参考に留める）
3. **肖像権**: 第三者の顔・声の模倣は許可がない限り行わない
4. **音声品質**: 日本語は必ず Neural2 を使用（ElevenLabs等は日本語品質が低い）
5. **FFmpeg**: 音声合成時は必ず `-map` で日本語音声を明示指定
6. **セクション検証**: カバー率100%を必ず確認（欠落禁止）
7. **画像アスペクト比**: `ImageOps.fit()`でカバースタイル（潰れ防止）

### 画像アスペクト比の正しい処理

```python
from PIL import Image, ImageOps

# ❌ 誤り（画像が潰れる）
img = img.resize((1920, 1080))

# ✓ 正しい（アスペクト比維持でクロップ）
img = ImageOps.fit(img, (1920, 1080), Image.LANCZOS)
```

### 絶対にやってはいけないこと

```python
# ❌ 絶対禁止: 元動画のフレームを使用
ref_img = Image.open("frames/frame_0001.jpg")
img.paste(ref_img, (0, 0))

# ❌ 絶対禁止: 暗くしても禁止
ref_img = ref_img.point(lambda p: p * 0.3)

# ✓ 正しい方法: NanoBananaで新規生成
# python scripts/run.py image_generator.py --prompt "..." --output background.png
```

---

## クイックコマンド

```bash
# 1. GCP設定確認
gcloud config list

# 2. TTS有効化確認
gcloud services list --enabled | grep texttospeech

# 3. 音声生成テスト
python3 -c "
from google.cloud import texttospeech
client = texttospeech.TextToSpeechClient()
voices = client.list_voices(language_code='ja-JP')
for v in voices.voices:
    if 'Neural2' in v.name:
        print(v.name)
"
```
