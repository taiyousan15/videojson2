# 90%精度再現 完全版ワークフロー

## 対象動画
- **URL**: https://www.youtube.com/watch?v=qidLTyXROLA
- **タイトル**: ChatGPTより予測に強い！表形式に特化したAIの活用方法について解説してみた
- **長さ**: 20分4秒
- **チャンネル**: にゃんたのAIチャンネル

## 90%精度再現の定義

| 項目 | 精度目標 | 実現方法 |
|------|----------|----------|
| **構造・フロー** | 100% | structure.json で完全に再現 |
| **台本内容** | 90%+ | Ollama llama3.1:70b で圧縮率考慮 |
| **背景画像品質** | 90%+ | NanoBanana (Gemini) で高品質生成 |
| **テロップ配置** | 95%+ | Remotion lecture スタイル |
| **音声品質** | 90%+ | Google Cloud TTS Neural2-D |
| **セクション分割** | 100% | PySceneDetect + 手動検証 |

---

## Phase 0: 環境準備

### 0-1. プロジェクト作成

```bash
cd projects
mkdir youtube_qidLTyXROLA
cd youtube_qidLTyXROLA
mkdir work work/final_images work/final_audio work/remotion_segments
```

### 0-2. 動画ダウンロード

```bash
yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" \
  -o "input.mp4" \
  "https://www.youtube.com/watch?v=qidLTyXROLA"
```

**検証**:
```bash
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 input.mp4
# 期待: 1204 (20分4秒)
```

---

## Phase 1: セクション検出

### 1-1. PySceneDetect実行

```bash
scenedetect -i input.mp4 \
  detect-adaptive \
  --threshold 3.0 \
  list-scenes \
  --output work/scenes.csv
```

**重要**:
- 20分動画 → 予想40-60セクション
- threshold を調整して画面切り替えのみ検出

### 1-2. セクション数検証

```bash
python3 scripts/validate_sections.py \
  --sections work/scenes.csv \
  --video input.mp4

# 合格基準:
# ✓ カバー率 = 100%
# ✓ ギャップ = 0
# ✓ 重複 = 0
```

---

## Phase 2-1: 文字起こし (Whisper)

### 2-1. Whisper large-v3 実行

```bash
whisper input.mp4 \
  --model large-v3 \
  --language ja \
  --output_format json \
  --output_dir work/
```

**出力**: `work/input.json`

**品質チェック**:
```bash
jq '.text | length' work/input.json
# 期待: 15000-25000文字 (20分動画)
```

---

## Phase 2-2: 翻訳・オリジナル化 (Ollama)

### 2-2. Ollama llama3.1:70b で翻訳

```bash
python3 phase2_2_translate_batch.py
```

**スクリプト内容**:
```python
import json
import subprocess

with open('work/input.json', 'r') as f:
    data = json.load(f)

original_text = data['text']

# Ollama llama3.1:70b でオリジナル台本化
prompt = f"""
元の動画の内容を90%維持しつつ、オリジナルの表現に書き換えてください。

# 重要ルール:
1. 構成・順序は完全に維持
2. 専門用語・技術用語はそのまま
3. 説明の流れは同じだが、表現は変える
4. 例: 「ChatGPTは苦手です」→「ChatGPTでは難しい」

# 元テキスト:
{original_text}

# オリジナル台本:
"""

result = subprocess.run([
    'ollama', 'run', 'llama3.1:70b'
], input=prompt, capture_output=True, text=True)

with open('work/translated.txt', 'w') as f:
    f.write(result.stdout)
```

---

## Phase 2-3: 圧縮率計算

```bash
python3 phase2_5_compression_v2.py
```

**目標圧縮率**:
- 元文字数: 20,000文字
- 目標: 70-80% (14,000-16,000文字)
- セクション数50の場合: 1セクションあたり280-320文字

---

## Phase 3: 構造解析 (Ollama Vision)

### 3-1. 各セクションのフレーム抽出

```bash
python3 phase3_structure_analysis.py
```

**スクリプトの重要部分**:
```python
import subprocess
from pathlib import Path

def extract_middle_frame(video_path, start_time, end_time, output_path):
    """セクションの中間フレームを抽出"""
    middle_time = (start_time + end_time) / 2

    cmd = [
        'ffmpeg', '-y',
        '-ss', str(middle_time),
        '-i', video_path,
        '-vframes', '1',
        '-q:v', '2',
        output_path
    ]
    subprocess.run(cmd, capture_output=True)

# Ollama vision で解析
def analyze_frame_with_vision(image_path):
    """フレームを解析して視覚情報を抽出"""
    prompt = """
この画像から以下を抽出してください:

1. スライドタイトル
2. 主要なテキスト (箇条書きなど)
3. 図表・グラフの説明
4. コード・数式
5. 画面レイアウト (タイトル位置、本文位置、図の位置)

JSON形式で出力:
{
  "title": "...",
  "main_text": ["...", "..."],
  "visual_elements": ["グラフ", "コード"],
  "layout": {
    "title_position": "top-center",
    "content_position": "center",
    "has_sidebar": false
  }
}
"""

    result = subprocess.run([
        'ollama', 'run', 'llama3.1:70b',
        '--vision',
        '--image', image_path
    ], input=prompt, capture_output=True, text=True)

    return json.loads(result.stdout)
```

### 3-2. structure.json 生成

```python
{
  "metadata": {
    "schema_version": "2.0",
    "source_video": "https://www.youtube.com/watch?v=qidLTyXROLA",
    "total_duration": 1204.0,
    "sections_count": 50
  },
  "sections": [
    {
      "scene_number": 1,
      "start_time": 0.0,
      "end_time": 24.5,
      "duration": 24.5,
      "visual_analysis": {
        "title": "ChatGPTより予測に強い！表形式に特化したAI",
        "main_text": ["オープニング"],
        "visual_elements": ["タイトル画面"],
        "layout": {
          "title_position": "center",
          "has_background": true
        }
      },
      "narration_target_length": 350,
      "compression_rate": 0.75
    }
    // ... 49個のセクション
  ]
}
```

---

## Phase 4: NanoBanana背景画像生成

### 4-1. メタプロンプト設計

**重要**: 90%精度のためには、元画像の視覚情報を正確にプロンプト化する必要があります。

```python
def create_enhanced_prompt(section):
    """視覚情報を考慮した高品質プロンプト生成"""

    visual = section['visual_analysis']
    narration = section['narration']

    # レイアウト情報
    layout_prompt = ""
    if visual['layout']['title_position'] == 'top-left':
        layout_prompt = "Title area at top-left corner"
    elif visual['layout']['title_position'] == 'center':
        layout_prompt = "Title area at center"

    # ビジュアル要素
    visual_elements = []
    if 'グラフ' in visual['visual_elements']:
        visual_elements.append("chart visualization area")
    if 'コード' in visual['visual_elements']:
        visual_elements.append("code block area with monospace grid")
    if 'テーブル' in visual['visual_elements']:
        visual_elements.append("table/spreadsheet area")

    # メインプロンプト
    prompt = f"""
Professional presentation slide background for technical content.

## Layout Structure:
- {layout_prompt}
- Content area: {visual['layout']['content_position']}
- Leave WHITE SPACE for: {', '.join(visual_elements)}

## Visual Style:
- Modern tech aesthetic
- Blue gradient tones (#0066FF, #00D9FF, #E8F4FF)
- Clean, minimal design
- Professional presentation quality

## Content Theme:
{narration[:150]}

## Critical Requirements:
- NO TEXT on the image
- NO NUMBERS on the image
- Background ONLY
- 1920x1080 landscape
- Leave clear areas for text overlay

## Design Elements:
- Subtle geometric patterns
- Modern gradients
- Tech-focused aesthetic
- Clear visual hierarchy
"""

    return prompt
```

### 4-2. NanoBanana実行

```bash
python3 phase4_nanobanana_generate.py
```

**予想時間**: 50セクション × 30秒 = 25分

**出力検証**:
```bash
ls -lh work/final_images/*.png | wc -l
# 期待: 50

# 品質チェック
for img in work/final_images/*.png; do
    size=$(identify -format "%wx%h" "$img")
    if [ "$size" != "1920x1080" ]; then
        echo "❌ $img: Wrong size $size"
    fi
done
```

---

## Phase 5: 品質検証

```bash
python3 scripts/advanced_video_analysis/quality_checker.py \
  --generated "./work/final_images/" \
  --jobs "./nanobanana_jobs/"
```

**検証項目**:
1. **解像度**: 全て1920x1080
2. **ファイルサイズ**: 30KB以上
3. **鮮明度**: ラプラシアン分散 > 100
4. **テキストなし**: OCRで文字検出0個

**不合格の場合**: 該当セクションを再生成

---

## Phase 6: 音声生成 (Google Cloud TTS)

### 6-1. narration.md 生成

```bash
python3 phase6_generate_narration.py
```

**narration.md フォーマット**:
```markdown
# Scene 1 (0.0s - 24.5s)

こんにちは、今回は、ChatGPTなどの言語モデルが表形式データの予測を苦手としている理由と、その解決策について解説します。

---

# Scene 2 (24.5s - 48.0s)

まず、ChatGPTが表データ予測に弱い理由として、数値処理の仕組みがあります。

---

# Scene 3 (48.0s - 120.4s)

...
```

### 6-2. TTS読み形式変換

**重要**: Google TTS Neural2-D で自然に読ませるため:

```python
READING_CONVERSIONS = {
    # 数字
    '90%': 'きゅうじゅっパーセント',
    '5ステップ': 'ごステップ',
    '10倍': 'じゅうばい',

    # 英語
    'ChatGPT': 'チャットジーピーティー',
    'LightGBM': 'ライトジービーエム',
    'XGBoost': 'エックスジーブースト',
    'Claude Code': 'クロード コード',

    # 記号
    '→': 'から',
    '×': 'かける',
    '÷': 'わる',
}

def convert_for_tts(text):
    for key, value in READING_CONVERSIONS.items():
        text = text.replace(key, value)
    return text
```

### 6-3. Google Cloud TTS実行

```bash
python3 scripts/gcloud_tts.py
```

**設定**:
```python
voice_params = {
    'language_code': 'ja-JP',
    'name': 'ja-JP-Neural2-D',
    'ssml_gender': 'MALE'
}

audio_config = {
    'audio_encoding': 'MP3',
    'speaking_rate': 1.0,  # 自然な速度
    'pitch': 0.0,
    'volume_gain_db': 0.0
}
```

**出力検証**:
```bash
ls -lh work/final_audio/*.mp3 | wc -l
# 期待: 50
```

---

## Phase 7: Remotionテロップ生成

### 7-1. 字幕表示変換

**TTS読み → 字幕表示**:
```python
SUBTITLE_DISPLAY_MAP = {
    'きゅうじゅっパーセント': '90%',
    'ごステップ': '5ステップ',
    'じゅうばい': '10倍',
    'チャットジーピーティー': 'ChatGPT',
    'ライトジービーエム': 'LightGBM',
    'エックスジーブースト': 'XGBoost',
    'クロード コード': 'Claude Code',
}
```

### 7-2. Remotion lecture スタイル設定

```typescript
// remotion-telop/src/components/Telop.tsx

lecture: {
  fontSize: 42,
  fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif",
  color: "#FFFFFF",
  backgroundColor: "rgba(0, 0, 0, 0.6)",
  padding: "20px 40px",
  borderRadius: "8px",
  position: "bottom",  // 画面下部10%
  animation: "fade",   // フェードイン・アウト
  autoFit: true,       // 長文自動調整
}
```

### 7-3. Remotionセグメント生成

```bash
python3 phase7_remotion_telop.py
```

**予想時間**: 50セクション × 平均30秒 = 25分

**出力検証**:
```bash
ls -lh work/remotion_segments/*.mp4 | wc -l
# 期待: 50

# 各セグメントの品質チェック
for seg in work/remotion_segments/*.mp4; do
    duration=$(ffprobe -v error -show_entries format=duration \
      -of default=noprint_wrappers=1:nokey=1 "$seg")
    echo "$seg: ${duration}秒"
done
```

---

## Phase 8: 最終動画結合

```bash
python3 phase8_concat_remotion.py
```

**出力**: `final_video_remotion.mp4`

**最終検証**:
```bash
# 長さチェック
ffprobe -v error -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 final_video_remotion.mp4
# 期待: 1200-1210秒 (元動画1204秒±1%)

# 品質チェック
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,codec_name \
  final_video_remotion.mp4
# 期待:
# width=1920
# height=1080
# codec_name=h264

# 音声チェック
ffprobe -v error -select_streams a:0 \
  -show_entries stream=codec_name,sample_rate \
  final_video_remotion.mp4
# 期待:
# codec_name=aac
# sample_rate=24000
```

---

## 90%精度検証チェックリスト

### 構造・フロー (100%)
- [ ] セクション数が元動画と±5%以内
- [ ] 各セクションの長さが元動画と±10%以内
- [ ] 画面遷移のタイミングが一致

### 台本内容 (90%+)
- [ ] 専門用語が全て正確
- [ ] 説明の順序が同じ
- [ ] 重要ポイントが全て含まれる
- [ ] 文字数が元動画の70-80%

### 背景画像品質 (90%+)
- [ ] 全画像が1920x1080
- [ ] テキストが一切含まれない
- [ ] レイアウトが元スライドと類似
- [ ] 視覚的に高品質 (ラプラシアン分散 > 100)

### テロップ配置 (95%+)
- [ ] lecture スタイルで統一
- [ ] 画面下部10%に配置
- [ ] フェードアニメーション
- [ ] 読みと表示の正しい変換

### 音声品質 (90%+)
- [ ] Google Cloud TTS Neural2-D 使用
- [ ] 発音が自然
- [ ] 速度が適切 (speaking_rate: 1.0)
- [ ] 音量が適切

### 全体品質
- [ ] 総再生時間が元動画±5%以内
- [ ] セグメント間のギャップなし
- [ ] 音声と映像の同期
- [ ] 最終ファイルサイズ: 20-40MB (20分動画)

---

## トラブルシューティング

### Issue 1: セクション数が多すぎる

**症状**: PySceneDetectが100+セクションを検出

**解決**:
```bash
scenedetect -i input.mp4 \
  detect-adaptive \
  --threshold 5.0 \  # より高い閾値
  list-scenes
```

### Issue 2: NanoBanana生成失敗

**症状**: レート制限エラー

**解決**:
1. 5秒 → 10秒の待機時間に変更
2. 1日500枚制限を考慮
3. 失敗したセクションのみ再実行

### Issue 3: Remotion font エラー

**症状**: フォント読み込み失敗

**解決**: 既に修正済み (CDN + システムフォント使用)

### Issue 4: 音声と映像のズレ

**症状**: テロップと音声が合わない

**解決**:
```python
# phase7で音声長さを正確に取得
duration_cmd = ['ffprobe', '-v', 'error',
  '-show_entries', 'format=duration',
  '-of', 'default=noprint_wrappers=1:nokey=1',
  audio_path]
duration_sec = float(subprocess.check_output(duration_cmd).strip())
duration_frames = int(duration_sec * 30)  # 30fps
```

---

## 完成版スクリプト配置

```
projects/youtube_qidLTyXROLA/
├── input.mp4                          # Phase 0: ダウンロード済み
├── phase1_detect_scenes.py            # Phase 1: PySceneDetect
├── phase2_1_transcribe.py             # Phase 2-1: Whisper
├── phase2_2_translate_batch.py        # Phase 2-2: Ollama翻訳
├── phase2_5_compression.py            # Phase 2-3: 圧縮率計算
├── phase3_structure_analysis.py       # Phase 3: Ollama Vision
├── phase4_nanobanana_generate.py      # Phase 4: NanoBanana
├── phase5_quality_verification.py     # Phase 5: 品質検証
├── phase6_generate_audio.py           # Phase 6: Google TTS
├── phase7_remotion_telop.py           # Phase 7: Remotion
├── phase8_concat_remotion.py          # Phase 8: 結合
├── run_complete_workflow.py           # 全フェーズ実行
└── work/
    ├── scenes.csv                     # セクション情報
    ├── input.json                     # Whisper出力
    ├── translated.txt                 # Ollama翻訳
    ├── structure_analysis.json        # 構造解析
    ├── narration.md                   # 台本
    ├── final_images/                  # NanoBanana背景
    ├── final_audio/                   # TTS音声
    └── remotion_segments/             # Remotionセグメント
```

---

## 実行時間見積もり

| フェーズ | 所要時間 (50セクション) |
|---------|------------------------|
| Phase 0 | 5分 (ダウンロード) |
| Phase 1 | 3分 (PySceneDetect) |
| Phase 2-1 | 25分 (Whisper large-v3) |
| Phase 2-2 | 15分 (Ollama翻訳) |
| Phase 2-3 | 1分 (圧縮率計算) |
| Phase 3 | 30分 (Ollama Vision × 50) |
| Phase 4 | 30分 (NanoBanana × 50) |
| Phase 5 | 5分 (品質検証) |
| Phase 6 | 10分 (Google TTS × 50) |
| Phase 7 | 30分 (Remotion × 50) |
| Phase 8 | 3分 (結合) |
| **合計** | **約157分 (2時間37分)** |

---

## コスト見積もり (20分動画、50セクション)

| サービス | 使用量 | コスト |
|---------|--------|--------|
| Whisper large-v3 | 20分 | $0.12 |
| Ollama llama3.1:70b | ローカル | 無料 |
| NanoBanana (Gemini) | 50画像 | 無料 (500枚/日) |
| Google Cloud TTS Neural2 | 50リクエスト | $0.80 |
| **合計** | - | **約$0.92** |

---

## 次のステップ

1. **プロジェクト作成**:
   ```bash
   mkdir projects/youtube_qidLTyXROLA
   cd projects/youtube_qidLTyXROLA
   ```

2. **動画ダウンロード**:
   ```bash
   yt-dlp -f "best[ext=mp4]" -o "input.mp4" \
     "https://www.youtube.com/watch?v=qidLTyXROLA"
   ```

3. **全フェーズ実行**:
   ```bash
   python3 run_complete_workflow.py
   ```

---

**🎯 この完全版ワークフローで90%精度の再現動画を生成できます！**
