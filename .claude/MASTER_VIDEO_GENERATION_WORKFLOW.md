# YouTube動画生成 完全マスターワークフロー v4.0

**最終更新**: 2026-01-10
**対象**: YouTube URL → 日本語字幕付き研修動画の完全自動生成

このドキュメントは、動画生成における全プロセスを網羅した決定版ガイドです。

---

## 📋 目次

1. [全体フロー概要](#全体フロー概要)
2. [Phase 0: 事前準備](#phase-0-事前準備)
3. [Phase 1: セクション検出（4段階パイプライン）](#phase-1-セクション検出)
4. [Phase 2: トランスクリプト取得・翻訳](#phase-2-トランスクリプト取得翻訳)
5. [Phase 2.5: 圧縮率計算・セクション選択【重要】](#phase-25-圧縮率計算セクション選択)
6. [Phase 3: 構造分析（並列処理）](#phase-3-構造分析)
7. [Phase 4: 画像生成（NanoBanana + PIL）](#phase-4-画像生成)
8. [Phase 5: 品質検証ループ（5段階QC）](#phase-5-品質検証ループ)
9. [Phase 6: TTS音声生成](#phase-6-tts音声生成)
10. [Phase 7: テロップ生成](#phase-7-テロップ生成)
11. [Phase 8: 動画合成](#phase-8-動画合成)
12. [モデル選定ガイド](#モデル選定ガイド)
13. [処理時間見積もり](#処理時間見積もり)
14. [トラブルシューティング](#トラブルシューティング)

---

## 全体フロー概要

```
YouTube URL（例: 19分12秒の動画）
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 0: 事前準備                                       │
│ → 動画ダウンロード（yt-dlp）                           │
│ → メタデータ取得（タイトル、長さ、チャプター）         │
│ → 作業ディレクトリ作成                                 │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 1: セクション検出（4段階パイプライン）            │
│ → Step 1: High-Recall（PySceneDetect）                 │
│ → Step 2: High-Precision（SSIM + diff_area）          │
│ → Step 3: Deduplication（pHash）                       │
│ → Step 4: AI Verification（Ollama）                    │
│ → 確定セクション数: 20-40個                             │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 2: トランスクリプト取得・翻訳                     │
│ → Whisper large-v3 (英語→テキスト)                    │
│ → Ollama llama3.1:70b (英語→日本語翻訳・要約)         │
│ → TTS読み形式変換（「5ステップ」→「ファイブステップ」）│
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 2.5: 圧縮率計算・セクション選択【重要】          │
│ → 元動画長から目標時間計算（許容範囲: ±15秒）         │
│ → ナレーション音声長推定（1文字=0.15秒）              │
│ → 重要度スコアリング（0-20点）                        │
│ → 累積音声長が許容範囲に収まるまでセクション採用      │
│ → 許容範囲外→ナレーション調整（簡潔化/詳細化）        │
│ 例: 19分12秒 → 目標7分41秒（7分26秒〜7分56秒）       │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 3: 構造分析（並列処理）                           │
│ → OCR + 画像解析（10並列ワーカー）                     │
│ → analysis_json/*.json 生成                            │
│ → character_bible.json（キャラクター一貫性）           │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 4: 画像生成（NanoBanana + PIL）                   │
│ → NanaBanana背景生成（1920x810、テキストなし）         │
│ → PIL日本語テキスト配置（Hiragino Kaku Gothic）        │
│ → 75%+25%合成（画像810px + 字幕バー270px）            │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 5: 品質検証ループ（5段階QC）                     │
│ → Check 1: OCR読み戻し（90%一致）                     │
│ → Check 2: レイアウトIoU（> 0.8）                     │
│ → Check 3: キャラクター一貫性（頭身比率±10%）         │
│ → Check 4: 鮮明度（Laplacian > 100）                  │
│ → Check 5: 総合判定 → NG時は修正→再生成（最大3回）    │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 6: TTS音声生成                                    │
│ → Google Cloud TTS Neural2-D（ja-JP-Neural2-D）        │
│ → speaking_rate=1.0（研修向け標準速度）                │
│ → 実際の音声長を測定（ffprobe）                        │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 7: テロップ生成                                   │
│ → 読み/表示分離（「ファイブステップ」→「5ステップ」） │
│ → 固有名詞保護（「NotebookLM」分断防止）               │
│ → 語尾孤立防止（6文字以下マージ）                      │
│ → タイミング同期（音声長から自動計算）                 │
│ → 方法選択: Remotion（高度）or drawtext（シンプル）   │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 8: 動画合成                                       │
│ → セグメント動画生成（画像+音声+字幕）                 │
│ → FFmpeg concat（結合）                                │
│ → 最終動画出力（1920x1080, MP4, H.264）                │
└─────────────────────────────────────────────────────────┘
  ↓
完成動画（例: 7分48秒、許容範囲内✅）
```

---

## Phase 0: 事前準備

### 目的
動画のダウンロードとメタデータ取得

### 入力
- YouTube URL（例: `https://youtu.be/qjQH4XH4PBQ`）

### 処理

#### Step 0-1: 動画ダウンロード

**使用ツール**: `yt-dlp`

```bash
# 動画ダウンロード
yt-dlp -f 'bestvideo[height<=1080]+bestaudio/best[height<=1080]' \
  -o "downloads/video.%(ext)s" \
  "https://youtu.be/qjQH4XH4PBQ"

# 出力: downloads/video.mp4
```

#### Step 0-2: メタデータ取得

```bash
# メタデータJSON取得
yt-dlp --skip-download --write-info-json \
  -o "metadata/video_info" \
  "https://youtu.be/qjQH4XH4PBQ"

# 出力: metadata/video_info.info.json
```

**取得情報**:
- `title`: 動画タイトル
- `duration`: 長さ（秒）
- `description`: 説明文（チャプター情報含む）
- `channel`: チャンネル名
- `upload_date`: アップロード日

#### Step 0-3: 作業ディレクトリ作成

```bash
mkdir -p work/{video_01,video_02,...}/{
  images,
  audio,
  composites,
  subtitles,
  segments,
  analysis_json
}
```

### 出力
- `downloads/video.mp4`: 元動画
- `metadata/video_info.info.json`: メタデータ
- 作業ディレクトリ構造

### 処理時間
- 1-3分（動画サイズによる）

---

## Phase 1: セクション検出

### 目的
元動画を意味のあるセクション（場面）に分割

### 入力
- 元動画（MP4）

### 4段階パイプライン（Coarse-to-Fine）

#### Step 1-1: High-Recall候補抽出

**目的**: 漏れゼロで全候補を抽出

**使用ツール**: PySceneDetect
**使用モデル**: なし

```python
from scenedetect import detect, AdaptiveDetector, ContentDetector

# 低閾値で広く拾う
scenes_adaptive = detect("video.mp4", AdaptiveDetector(
    adaptive_threshold=2.0,  # 通常3.0→低めで漏れ防止
    min_scene_len=15
))

scenes_content = detect("video.mp4", ContentDetector(
    threshold=20.0,  # 通常30.0→低めで漏れ防止
    min_scene_len=15
))

# ヒストグラム差分で補強
def detect_by_histogram(video_path):
    """色ヒストグラムの相関で場面変化検出"""
    cap = cv2.VideoCapture(video_path)
    candidates = []

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv], [0, 1], None, [50, 60], [0, 180, 0, 256])
        hist = cv2.normalize(hist, hist).flatten()

        if prev_hist is not None:
            correlation = cv2.compareHist(prev_hist, hist, cv2.HISTCMP_CORREL)
            if correlation < 0.7:  # 大きな変化
                candidates.append(frame_num / fps)

        prev_hist = hist

    return candidates

# 3つの手法を統合
all_candidates = merge_candidates([
    scenes_adaptive,
    scenes_content,
    detect_by_histogram("video.mp4")
])
```

**結果例**: 80箇所の候補

#### Step 1-2: High-Precision フィルタリング

**目的**: 本当に意味のある境界だけを残す

**使用ツール**: scikit-image（SSIM）、OpenCV
**使用モデル**: なし

```python
from skimage.metrics import structural_similarity as ssim
import cv2

filtered_cuts = []

for cut in all_candidates:
    # カット前後のフレーム取得
    frame_before = extract_frame(video, cut - 1)
    frame_after = extract_frame(video, cut + 1)

    # SSIM計算（構造的類似度）
    ssim_score = ssim(frame_before, frame_after, channel_axis=2)

    # 差分面積計算
    diff = cv2.absdiff(frame_before, frame_after)
    diff_area = (diff > 30).sum() / diff.size

    # フィルタリング条件
    if ssim_score < 0.85 or diff_area > 0.3:
        filtered_cuts.append({
            'time': cut,
            'ssim': ssim_score,
            'diff_area': diff_area,
            'reason': 'significant_change'
        })
```

**フィルタリング基準**:
| 指標 | 閾値 | 意味 |
|------|------|------|
| SSIM | < 0.85 | 構造的に異なる |
| diff_area | > 0.3 | 30%以上変化 |

**結果例**: 25箇所に絞り込み

#### Step 1-3: Deduplication（重複排除）

**目的**: 似た画面の連続カットを統合

**使用ツール**: imagehash
**使用モデル**: なし

```python
import imagehash
from PIL import Image

deduped_cuts = []
prev_hash = None

for cut in filtered_cuts:
    frame = extract_frame(video, cut['time'])
    curr_hash = imagehash.phash(Image.fromarray(frame))

    # Hamming距離が10以上なら別セクション
    if prev_hash is None or (curr_hash - prev_hash) > 10:
        deduped_cuts.append(cut)
        prev_hash = curr_hash
    else:
        # 重複として除外
        cut['reason'] = 'duplicate_removed'
```

**結果例**: 18箇所に統合

#### Step 1-4: AI Verification（AI最終検証）

**目的**: 境界線が曖昧なケースをAIが判断

**使用MCP**: `mcp__ollama__ollama_generate`
**使用モデル**: `llama3.1:70b`（推論用）

```python
from ollama import Client

client = Client()

verified_sections = []

for i, cut in enumerate(deduped_cuts):
    frame_before = extract_frame(video, cut['time'] - 5)
    frame_after = extract_frame(video, cut['time'] + 5)

    # SSIM 0.8-0.9 の曖昧なケースのみAI検証
    if 0.8 <= cut['ssim'] < 0.9:
        prompt = f"""
        これは動画の{format_time(cut['time'])}における前後フレームです。

        前フレーム: [base64_image_before]
        後フレーム: [base64_image_after]

        SSIM: {cut['ssim']:.3f}
        差分面積: {cut['diff_area']:.3f}

        以下をJSON形式で回答してください：
        {{
          "is_boundary": true/false,
          "reason": "理由",
          "confidence": 0.0-1.0,
          "section_before_title": "前セクションのタイトル",
          "section_after_title": "後セクションのタイトル"
        }}
        """

        response = client.generate(
            model="llama3.1:70b",
            prompt=prompt,
            images=[encode_base64(frame_before), encode_base64(frame_after)]
        )

        result = json.loads(response['response'])

        if result['is_boundary'] and result['confidence'] > 0.7:
            cut['ai_verified'] = True
            cut['section_title'] = result['section_after_title']
            verified_sections.append(cut)
        else:
            cut['ai_verified'] = False
    else:
        # SSIM < 0.8 は明確な境界として採用
        cut['ai_verified'] = True
        verified_sections.append(cut)

print(f"AI検証後: {len(verified_sections)}セクション確定")
```

**結果例**: 12セクション確定

### 出力
- `sections_detected.json`: 確定セクション一覧

```json
{
  "sections": [
    {
      "id": "s01",
      "start_time": 0,
      "end_time": 72,
      "duration": 72,
      "detection_method": "adaptive",
      "ssim": 0.45,
      "ai_verified": true,
      "title": "オープニング"
    },
    {
      "id": "s02",
      "start_time": 72,
      "end_time": 331,
      "duration": 259,
      "detection_method": "content",
      "ssim": 0.62,
      "ai_verified": true,
      "title": "Gemini 2.0の革新的機能"
    }
  ]
}
```

### 処理時間
- 8-12分（19分動画の場合）

---

## Phase 2: トランスクリプト取得・翻訳

### 目的
動画の音声をテキスト化し、日本語ナレーションに変換

### 入力
- 元動画（MP4）

### 処理

#### Step 2-1: Whisper文字起こし

**使用ツール**: Whisper
**使用モデル**: `large-v3`

```bash
# 音声抽出
ffmpeg -i video.mp4 -vn -acodec pcm_s16le -ar 16000 audio.wav

# Whisper文字起こし
whisper audio.wav \
  --model large-v3 \
  --language en \
  --word_timestamps \
  --output_format json \
  --output_dir transcripts/
```

**出力例**: `transcripts/audio.json`

```json
{
  "text": "Gemini 2.0 has arrived and it's changing everything...",
  "segments": [
    {
      "start": 0.0,
      "end": 5.2,
      "text": "Gemini 2.0 has arrived and it's changing everything."
    }
  ],
  "word_timestamps": [
    {"word": "Gemini", "start": 0.0, "end": 0.8},
    {"word": "2.0", "start": 0.9, "end": 1.3}
  ]
}
```

#### Step 2-2: 日本語翻訳・要約

**使用MCP**: `mcp__ollama__ollama_chat`
**使用モデル**: `llama3.1:70b`（翻訳・要約用）

```python
from ollama import Client

client = Client()

def translate_and_summarize(english_text, section_id):
    """英語トランスクリプト → 日本語ナレーション"""

    prompt = f"""
以下の英語トランスクリプトを日本語に翻訳し、TTS読み形式で要約してください。

【要件】
1. 正確な翻訳（専門用語は原語併記）
2. TTS読み形式で出力
   - 数字: 「5ステップ」→「ファイブステップ」
   - 順序: 「1、2、3」→「いち、に、さん、」
   - パーセント: 「80%」→「80パーセント」
3. 冗長な口語表現を削除（「えー」「あのー」など）
4. 簡潔に要約（元の60-70%の長さ）

【トランスクリプト】
{english_text}

【出力フォーマット（JSON）】
{{
  "narration": "日本語ナレーション（TTS読み形式）",
  "char_count": 文字数,
  "keywords": ["キーワード1", "キーワード2"]
}}
"""

    response = client.chat(
        model="llama3.1:70b",
        messages=[
            {
                "role": "system",
                "content": "あなたは英語→日本語翻訳・要約の専門家です。"
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
    )

    # JSON抽出
    content = response['message']['content']
    json_start = content.find("{")
    json_end = content.rfind("}") + 1
    result = json.loads(content[json_start:json_end])

    return result

# 実行例
narration = translate_and_summarize(
    "Gemini 2.0 has three revolutionary features...",
    "s02"
)
```

**出力例**:
```json
{
  "narration": "Gemini 2.0は、さんつの革新的機能を持っています。第いちに、マルチモーダル理解。第にに、リアルタイム音声対話。第さんに、エージェント機能です。",
  "char_count": 89,
  "keywords": ["Gemini 2.0", "マルチモーダル", "音声対話", "エージェント"]
}
```

### 出力
- `transcripts/audio.json`: Whisperの文字起こし結果
- `summary_ja.json`: 日本語要約（TTS読み形式）

### 処理時間
- Whisper: 5-8分（19分動画の場合）
- 翻訳・要約: 3-5分

---

## Phase 2.5: 圧縮率計算・セクション選択

### 目的
**最重要フェーズ**: ナレーション音声長を考慮してセクションを選択し、目標時間（±15秒）に収める

### 入力
- Phase 1の確定セクション（12個）
- Phase 2の日本語ナレーション

### 必須ルール

#### 許容範囲: ±15秒

| 元動画 | 目標時間 | 許容範囲（±15秒） |
|--------|---------|------------------|
| 10分 | 4分 | **3分45秒〜4分15秒** |
| 20分 | 8分 | **7分45秒〜8分15秒** |
| 30分 | 12分 | **11分45秒〜12分15秒** |
| 40分 | 14分 | **13分45秒〜14分15秒** |
| 50分 | 15分 | **14分45秒〜15分15秒** |
| 60分 | 15分36秒 | **15分21秒〜15分51秒** |
| 60分以上 | 18-22分 | **±15秒** |

### 処理

#### Step 2.5-1: 目標時間計算

**使用モデル**: なし

```python
def calculate_target_duration(original_duration_minutes):
    """元動画の長さから目標時間と許容範囲を計算"""

    # 圧縮率計算
    if original_duration_minutes <= 30:
        compression_rate = 0.40  # 40%
    elif original_duration_minutes <= 40:
        compression_rate = 0.35  # 35%
    elif original_duration_minutes <= 50:
        compression_rate = 0.30  # 30%
    elif original_duration_minutes <= 60:
        compression_rate = 0.26  # 26%
    else:
        compression_rate = 20.0 / original_duration_minutes

    # 目標時間（秒）
    target_seconds = original_duration_minutes * 60 * compression_rate

    # 許容範囲（±15秒）
    TOLERANCE = 15
    min_seconds = target_seconds - TOLERANCE
    max_seconds = target_seconds + TOLERANCE

    return {
        'compression_rate': compression_rate,
        'target_seconds': target_seconds,
        'min_seconds': min_seconds,
        'max_seconds': max_seconds
    }

# 実行例: 19分12秒の動画
result = calculate_target_duration(19.2)
# 出力:
# {
#   'compression_rate': 0.40,
#   'target_seconds': 461,   # 7分41秒
#   'min_seconds': 446,      # 7分26秒
#   'max_seconds': 476       # 7分56秒
# }
```

#### Step 2.5-2: ナレーション音声長の推定

**重要**: セクション選択は「元動画の長さ」ではなく「ナレーション音声長」で計算

**推定式**:
```
音声長（秒） = ナレーション文字数 × 0.15
```

**根拠**: Google Cloud TTS Neural2-D（speaking_rate=1.0）
- 1文字 = 約0.15秒
- 1分間 = 約400文字

```python
def estimate_narration_duration(narration_text):
    """ナレーション文字数から音声長を推定"""

    # 空白・記号を除外してカウント
    char_count = len([c for c in narration_text
                      if c not in ' \n\t。、！？'])

    # 1文字 = 0.15秒
    duration_seconds = char_count * 0.15

    return duration_seconds

# 実行例
narration = "Gemini 2.0は、マルチモーダル理解、リアルタイム音声対話、エージェント機能を統合した画期的なモデルです。"
duration = estimate_narration_duration(narration)
# 56文字 × 0.15 = 8.4秒
```

#### Step 2.5-3: 重要度スコアリング

**使用モデル**: なし

```python
def calculate_importance_score(section):
    """セクションの重要度を計算（0-20点）"""

    score = 0

    # 1. 数値・データの有無（+3点）
    if re.search(r'\d+', section['narration']):
        score += 3

    # 2. 具体例の有無（+2点）
    example_keywords = ['例えば', '具体的に', 'デモ', '実際']
    if any(kw in section['narration'] for kw in example_keywords):
        score += 2

    # 3. キーワード密度（+2点）
    HIGH_VALUE_KEYWORDS = ['AI', 'Gemini', 'Google', 'OpenAI', 'Claude']
    keyword_count = sum(1 for kw in section['keywords']
                        if kw in HIGH_VALUE_KEYWORDS)
    if keyword_count >= 2:
        score += 2

    # 4. チャプター記載（+3点）
    if section['title'] in video_metadata['chapters']:
        score += 3

    # 5. 視聴者保持率（+5点）
    if section.get('retention_rate', 0) > 0.8:
        score += 5

    # 6. セクション長（+2点）
    # 60-180秒が最適（短すぎず長すぎず）
    if 60 <= section['duration'] <= 180:
        score += 2

    # 7. セクション位置補正（+3点）
    if section['position'] in ['intro', 'conclusion']:
        score += 3

    return score
```

**スコアリング基準**:
| 項目 | 配点 | 判定基準 |
|------|------|---------|
| 数値・データ | +3点 | 数字を含む |
| 具体例 | +2点 | 「例えば」「デモ」など |
| キーワード密度 | +2点 | 重要キーワード2個以上 |
| チャプター記載 | +3点 | description記載 |
| 視聴者保持率 | +5点 | > 80% |
| セクション長 | +2点 | 60-180秒 |
| 位置（導入/結論） | +3点 | intro or conclusion |

#### Step 2.5-4: セクション選択アルゴリズム

**使用モデル**: なし

```python
def select_sections_by_narration_duration(all_sections, original_duration_minutes):
    """ナレーション音声長を考慮してセクションを選択"""

    # 1. 目標時間と許容範囲
    target_info = calculate_target_duration(original_duration_minutes)
    target_seconds = target_info['target_seconds']
    min_seconds = target_info['min_seconds']
    max_seconds = target_info['max_seconds']

    print(f"元動画: {original_duration_minutes:.1f}分")
    print(f"目標時間: {target_seconds/60:.1f}分")
    print(f"許容範囲: {min_seconds/60:.1f}分 〜 {max_seconds/60:.1f}分")

    # 2. ナレーション音声長を推定
    for section in all_sections:
        section['narration_duration'] = estimate_narration_duration(section['narration'])
        section['importance_score'] = calculate_importance_score(section)

    # 3. 重要度スコア降順でソート
    sorted_sections = sorted(
        all_sections,
        key=lambda s: s['importance_score'],
        reverse=True
    )

    # 4. セクション採用
    selected = []
    cumulative_duration = 0

    for section in sorted_sections:
        # 最大許容時間を超えないかチェック
        if cumulative_duration + section['narration_duration'] <= max_seconds:
            selected.append(section)
            cumulative_duration += section['narration_duration']

            # 最小許容時間を超えたら終了
            if cumulative_duration >= min_seconds:
                break

    # 5. 不足している場合、追加採用
    if cumulative_duration < min_seconds:
        remaining = [s for s in sorted_sections if s not in selected]
        for section in remaining:
            if cumulative_duration + section['narration_duration'] <= max_seconds:
                selected.append(section)
                cumulative_duration += section['narration_duration']
                if cumulative_duration >= min_seconds:
                    break

    # 6. タイムスタンプ順に並び替え
    selected = sorted(selected, key=lambda s: s['start_time'])

    # 7. 結果判定
    in_tolerance = min_seconds <= cumulative_duration <= max_seconds

    print(f"\n【結果】")
    print(f"採用セクション: {len(selected)}個")
    print(f"累積音声長: {cumulative_duration/60:.1f}分")
    print(f"許容範囲判定: {'✅ OK' if in_tolerance else '❌ NG'}")

    return {
        'selected_sections': selected,
        'in_tolerance': in_tolerance,
        'cumulative_duration': cumulative_duration
    }
```

#### Step 2.5-5: ナレーション調整（必要時）

許容範囲外の場合、ナレーションを調整

**使用MCP**: `mcp__ollama__ollama_chat`
**使用モデル**: `llama3.1:70b`

```python
def adjust_narration_to_target(section, target_duration_seconds):
    """ナレーションを目標時間に合わせて調整"""

    current_duration = estimate_narration_duration(section['narration'])

    if current_duration > target_duration_seconds:
        # 長すぎる場合: 簡潔化
        ratio = target_duration_seconds / current_duration
        target_chars = int(len(section['narration']) * ratio)

        prompt = f"""
        以下のナレーションを約{target_chars}文字に簡潔化してください。
        重要なキーワードと数字は必ず残してください。

        元ナレーション:
        {section['narration']}
        """

        response = client.chat(
            model="llama3.1:70b",
            messages=[{"role": "user", "content": prompt}]
        )

        return response['message']['content'].strip()

    elif current_duration < target_duration_seconds * 0.8:
        # 短すぎる場合: 詳細化
        target_chars = int(target_duration_seconds * 6.67)

        prompt = f"""
        以下のナレーションに具体例や補足説明を追加して、
        約{target_chars}文字に拡充してください。

        元ナレーション:
        {section['narration']}
        """

        response = client.chat(
            model="llama3.1:70b",
            messages=[{"role": "user", "content": prompt}]
        )

        return response['message']['content'].strip()

    else:
        # 適切な長さ
        return section['narration']
```

### 出力
- `selected_sections.json`: 採用セクション一覧（ナレーション付き）

```json
{
  "metadata": {
    "original_duration_minutes": 19.2,
    "compression_rate": 0.40,
    "target_seconds": 461,
    "min_seconds": 446,
    "max_seconds": 476,
    "actual_duration_seconds": 468,
    "in_tolerance": true,
    "sections_total": 12,
    "sections_selected": 3
  },
  "selected_sections": [
    {
      "id": "s02",
      "title": "Gemini 2.0の革新的機能",
      "narration": "Gemini 2.0は、マルチモーダル理解、リアルタイム音声対話、エージェント機能を統合した画期的なモデルです。従来のAIとは一線を画す、3つの革新的機能を紹介します。第一に、画像・音声・テキストを同時に処理できるマルチモーダル能力。第二に、遅延わずか200ミリ秒のリアルタイム音声対話。第三に、複数のツールを自動的に組み合わせて使用するエージェント機能です。",
      "narration_duration": 264.0,
      "narration_char_count": 176,
      "importance_score": 15
    },
    {
      "id": "s03",
      "title": "実際のデモンストレーション",
      "narration": "実際にGemini 2.0を使ったデモをお見せします。画面に表示されているコードを見てください。Gemini 2.0はコードを理解し、バグを発見し、修正案を提示し、さらにテストコードまで生成しました。これまでのAIでは不可能だった、一連の作業を自動化できます。",
      "narration_duration": 189.0,
      "narration_char_count": 126,
      "importance_score": 13
    },
    {
      "id": "s05",
      "title": "まとめ",
      "narration": "Gemini 2.0は、AI開発の新時代を切り開く重要なマイルストーンです。",
      "narration_duration": 15.0,
      "narration_char_count": 38,
      "importance_score": 10
    }
  ]
}
```

### 処理時間
- 2-3分

### 重要ポイント

✅ **必ず守ること**:
1. セクション選択は「元動画の長さ」ではなく「ナレーション音声長」で計算
2. 許容範囲（±15秒）に必ず収める
3. 重要度スコアリングで優先順位を付ける
4. 許容範囲外なら、ナレーションを調整

---

## Phase 3: 構造分析

### 目的
各セクションの画像を分析し、テキスト配置情報を抽出

### 入力
- 選択されたセクション（3個）
- 元動画

### 処理

#### Step 3-1: 代表フレーム抽出

**使用ツール**: FFmpeg

```bash
# 各セクションの代表フレームを抽出（中間時点）
ffmpeg -i video.mp4 -ss 120 -vframes 1 frames/s02_frame.png
```

#### Step 3-2: OCR + レイアウト解析（並列処理）

**使用MCP**: `mcp__ollama__ollama_generate` (vision)
**使用モデル**: `llama3.1:70b`（ビジョン対応）

```python
from concurrent.futures import ThreadPoolExecutor
import base64

def analyze_frame(frame_path, section_id):
    """フレームを分析してテキスト配置情報を抽出"""

    with open(frame_path, 'rb') as f:
        image_base64 = base64.b64encode(f.read()).decode()

    prompt = """
    この画像を分析して、以下の情報をJSON形式で抽出してください：

    1. テキスト要素の位置とサイズ（バウンディングボックス）
    2. 各テキストの内容
    3. フォントサイズの推定
    4. レイアウトタイプ（タイトル/本文/キャプション）
    5. 背景色

    【出力フォーマット】
    {
      "text_elements": [
        {
          "text": "抽出されたテキスト",
          "bbox": {"x": 100, "y": 200, "width": 400, "height": 50},
          "font_size": 36,
          "layout_type": "title"
        }
      ],
      "background_color": "#1A2A4A",
      "overall_layout": "centered"
    }
    """

    response = client.generate(
        model="llama3.1:70b",
        prompt=prompt,
        images=[image_base64]
    )

    # JSON抽出
    content = response['response']
    json_start = content.find("{")
    json_end = content.rfind("}") + 1
    analysis = json.loads(content[json_start:json_end])

    # 保存
    save_json(f"analysis_json/{section_id}.json", analysis)

    return analysis

# 並列処理（10ワーカー）
with ThreadPoolExecutor(max_workers=10) as executor:
    futures = []
    for section in selected_sections:
        frame_path = f"frames/{section['id']}_frame.png"
        future = executor.submit(analyze_frame, frame_path, section['id'])
        futures.append(future)

    # 結果収集
    analyses = [f.result() for f in futures]
```

#### Step 3-3: キャラクター一貫性分析（該当する場合）

人物が登場する動画の場合、キャラクター一貫性を確保

**使用ツール**: MediaPipe Pose

```python
import mediapipe as mp

def analyze_character_proportions(frame_path):
    """人物の頭身比率を分析"""

    mp_pose = mp.solutions.pose
    pose = mp_pose.Pose()

    image = cv2.imread(frame_path)
    results = pose.process(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))

    if results.pose_landmarks:
        # 頭のサイズと体のサイズから頭身比率を計算
        head_size = calculate_head_size(results.pose_landmarks)
        body_size = calculate_body_size(results.pose_landmarks)

        head_body_ratio = body_size / head_size

        return {
            'head_body_ratio': head_body_ratio,
            'expected_ratio': 7.5  # 標準的な頭身
        }

    return None

# キャラクターバイブル作成
character_bible = {
    'character_name': 'Main Presenter',
    'head_body_ratio': 7.5,
    'tolerance': 0.75  # ±10%
}

save_json('character_bible.json', character_bible)
```

### 出力
- `analysis_json/s02.json`: テキスト配置情報
- `analysis_json/s03.json`: テキスト配置情報
- `analysis_json/s05.json`: テキスト配置情報
- `character_bible.json`: キャラクター一貫性情報（該当する場合）

### 処理時間
- 3-5分（並列処理）

---

## Phase 4: 画像生成

### 目的
NanoBananaで背景画像を生成し、PILで日本語テキストを配置

### 入力
- `selected_sections.json`: 採用セクション（ナレーション付き）
- `analysis_json/*.json`: テキスト配置情報

### 処理

#### Step 4-1: NanoBanana背景生成

**使用スキル**: `gemini-image-generator`
**使用モデル**: Google Gemini NanoBanana
**バックアップ**: FAL AI `fal-ai/nano-banana-pro`（API制限時のみ）

```python
import subprocess

def generate_background_image(section):
    """NanoBananaで背景画像を生成（テキストなし）"""

    # プロンプト生成
    prompt = f"""
    {section['visual_style']}.

    Theme: {section['title']}.

    Style: Professional, modern, high-tech.

    Resolution: 1920x810 pixels (landscape).

    Important: NO text, NO words, NO numbers on the image.
    Only visual background.
    """

    # gemini-image-generatorスキル実行
    result = subprocess.run([
        'python3',
        '/Users/matsumototoshihiko/.claude/skills/gemini-image-generator/scripts/run.py',
        'image_generator.py',
        '--prompt', prompt,
        '--output', f'images/{section["id"]}_bg.png',
        '--width', '1920',
        '--height', '810'
    ], capture_output=True, text=True)

    if result.returncode != 0:
        # バックアップ: FAL AI
        print("NanoBanana API制限、FAL AIにフォールバック")

        import fal_client

        result = fal_client.subscribe(
            "fal-ai/nano-banana-pro",
            arguments={
                "prompt": prompt,
                "image_size": {"width": 1920, "height": 810}
            }
        )

        # 画像をダウンロード
        image_url = result['images'][0]['url']
        download_image(image_url, f'images/{section["id"]}_bg.png')

    return f'images/{section["id"]}_bg.png'
```

**視覚スタイル例**:
- サイバーパンク: `Holographic futuristic AI with neon colors (#00FF41, #FF0080)`
- ビジネス: `Professional business presentation with blue tones (#1E3A8A, #D97706)`
- 科学的: `Quantum physics visualization with purple and cyan (#8B5CF6, #06B6D4)`

#### Step 4-2: PIL日本語テキスト配置

**使用ツール**: PIL (Python Imaging Library)

```python
from PIL import Image, ImageDraw, ImageFont

def add_japanese_text(bg_image_path, section, analysis):
    """背景画像に日本語テキストを配置"""

    # 画像読み込み（1920x810）
    img = Image.open(bg_image_path)

    draw = ImageDraw.Draw(img)

    # 日本語フォント
    font_path = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"

    # タイトル配置
    title_font = ImageFont.truetype(font_path, 48)
    title_text = section['title']

    # 配置情報を参照
    title_bbox = analysis['text_elements'][0]['bbox']

    # 中央揃え
    title_width = draw.textlength(title_text, font=title_font)
    x = (1920 - title_width) / 2
    y = title_bbox['y']

    # 縁取り付きテキスト
    for offset_x, offset_y in [(-2, -2), (-2, 2), (2, -2), (2, 2)]:
        draw.text((x + offset_x, y + offset_y), title_text,
                  fill='black', font=title_font)

    draw.text((x, y), title_text, fill='white', font=title_font)

    # 本文配置（必要に応じて）
    if len(analysis['text_elements']) > 1:
        body_font = ImageFont.truetype(font_path, 32)
        body_text = section['narration'][:50] + "..."
        body_bbox = analysis['text_elements'][1]['bbox']

        draw.text((body_bbox['x'], body_bbox['y']), body_text,
                  fill='white', font=body_font)

    # 保存
    img.save(f'images/{section["id"]}_text.png')

    return f'images/{section["id"]}_text.png'
```

#### Step 4-3: 75%+25%合成

**最終レイアウト**: 1920x1080
- 上75%（0-810px）: 画像エリア
- 下25%（810-1080px）: 字幕バー（ダークブルー #1A2A4A）

```python
def create_final_composite(text_image_path, section_id):
    """75%画像 + 25%字幕バーの合成"""

    # 画像読み込み（1920x810）
    img_top = Image.open(text_image_path)

    # キャンバス作成（1920x1080）
    canvas = Image.new('RGB', (1920, 1080), (26, 42, 74))  # #1A2A4A

    # 画像を上部に配置
    canvas.paste(img_top, (0, 0))

    # 保存
    canvas.save(f'composites/{section_id}_composite.png')

    return f'composites/{section_id}_composite.png'
```

### 出力
- `images/{section_id}_bg.png`: 背景画像（1920x810）
- `images/{section_id}_text.png`: テキスト付き画像（1920x810）
- `composites/{section_id}_composite.png`: 最終合成画像（1920x1080）

### 処理時間
- NanoBanana生成: 5-8分/画像（3画像 = 15-24分）
- PIL処理: 1-2分

---

## Phase 5: 品質検証ループ

### 目的
生成された画像の品質を自動検証し、NG時は再生成

### 入力
- `composites/*.png`: 合成画像
- `analysis_json/*.json`: 期待値

### 5段階QCプロセス

#### Check 1: OCR読み戻し

**使用ツール**: Tesseract OCR
**使用モデル**: なし

```python
import pytesseract

def check_ocr_accuracy(image_path, expected_text):
    """OCRで読み戻して一致度をチェック"""

    # OCR実行
    ocr_text = pytesseract.image_to_string(
        Image.open(image_path),
        lang='jpn'
    )

    # 一致度計算（Levenshtein距離）
    from difflib import SequenceMatcher

    similarity = SequenceMatcher(None, ocr_text, expected_text).ratio()

    return {
        'check': 'ocr',
        'passed': similarity > 0.90,  # 90%以上一致
        'similarity': similarity,
        'ocr_text': ocr_text,
        'expected_text': expected_text
    }
```

#### Check 2: レイアウト一致度（IoU）

**使用ツール**: OpenCV
**使用モデル**: なし

```python
def check_layout_iou(generated_bbox, expected_bbox):
    """レイアウトの一致度をIoU（Intersection over Union）で計算"""

    # IoU計算
    x1 = max(generated_bbox['x'], expected_bbox['x'])
    y1 = max(generated_bbox['y'], expected_bbox['y'])
    x2 = min(generated_bbox['x'] + generated_bbox['width'],
             expected_bbox['x'] + expected_bbox['width'])
    y2 = min(generated_bbox['y'] + generated_bbox['height'],
             expected_bbox['y'] + expected_bbox['height'])

    intersection = max(0, x2 - x1) * max(0, y2 - y1)

    area1 = generated_bbox['width'] * generated_bbox['height']
    area2 = expected_bbox['width'] * expected_bbox['height']
    union = area1 + area2 - intersection

    iou = intersection / union if union > 0 else 0

    return {
        'check': 'layout_iou',
        'passed': iou > 0.8,  # 80%以上一致
        'iou': iou
    }
```

#### Check 3: キャラクター一貫性

**使用ツール**: MediaPipe Pose
**使用モデル**: なし

```python
def check_character_consistency(image_path, character_bible):
    """キャラクターの頭身比率をチェック"""

    # 人物検出
    proportions = analyze_character_proportions(image_path)

    if proportions is None:
        # 人物なし
        return {'check': 'character', 'passed': True, 'reason': 'no_character'}

    # 頭身比率の差をチェック
    expected = character_bible['head_body_ratio']
    actual = proportions['head_body_ratio']
    tolerance = character_bible['tolerance']

    deviation = abs(actual - expected)

    return {
        'check': 'character',
        'passed': deviation <= tolerance,  # ±10%以内
        'expected': expected,
        'actual': actual,
        'deviation': deviation
    }
```

#### Check 4: 鮮明度（Sharpness）

**使用ツール**: OpenCV
**使用モデル**: なし

```python
def check_sharpness(image_path):
    """Laplacian分散で鮮明度をチェック"""

    image = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    laplacian_var = cv2.Laplacian(image, cv2.CV_64F).var()

    return {
        'check': 'sharpness',
        'passed': laplacian_var > 100,  # 閾値100以上
        'laplacian_variance': laplacian_var
    }
```

#### Check 5: 総合判定

```python
def quality_check_loop(section, max_retries=3):
    """5段階QCループ（最大3回リトライ）"""

    for attempt in range(max_retries):
        print(f"\n【{section['id']} 品質検証 {attempt+1}/{max_retries}】")

        # 画像生成
        bg_image = generate_background_image(section)
        text_image = add_japanese_text(bg_image, section, analysis)
        composite_image = create_final_composite(text_image, section['id'])

        # 5段階チェック実行
        check1 = check_ocr_accuracy(composite_image, section['title'])
        check2 = check_layout_iou(detected_bbox, expected_bbox)
        check3 = check_character_consistency(composite_image, character_bible)
        check4 = check_sharpness(composite_image)

        # 総合判定
        all_checks = [check1, check2, check3, check4]
        passed = all(c['passed'] for c in all_checks)

        if passed:
            print(f"✅ 品質検証合格")
            return {
                'success': True,
                'image_path': composite_image,
                'attempts': attempt + 1,
                'checks': all_checks
            }
        else:
            # 失敗理由をログ
            failed = [c['check'] for c in all_checks if not c['passed']]
            print(f"❌ 品質検証失敗: {', '.join(failed)}")

            # プロンプト修正
            section['visual_style'] = adjust_prompt_for_retry(
                section['visual_style'],
                failed
            )

    # 最大リトライ回数超過
    print(f"⚠️ 警告: {max_retries}回リトライしても品質基準未達")
    return {
        'success': False,
        'image_path': composite_image,
        'attempts': max_retries,
        'checks': all_checks
    }
```

### 出力
- 品質検証済み画像（3枚）
- `qc_report.json`: 検証レポート

### 処理時間
- 初回合格: 15-24分（Phase 4と同じ）
- リトライあり: +5-8分/回

---

## Phase 6: TTS音声生成

### 目的
選択されたセクションのナレーションを音声化

### 入力
- `selected_sections.json`: ナレーション（TTS読み形式）

### 処理

#### Step 6-1: Google Cloud TTS音声生成

**使用API**: Google Cloud Text-to-Speech
**使用モデル**: `ja-JP-Neural2-D`

```python
from google.cloud import texttospeech

def generate_tts_audio(section):
    """ナレーションを音声化"""

    client = texttospeech.TextToSpeechClient()

    # 音声設定
    synthesis_input = texttospeech.SynthesisInput(text=section['narration'])

    voice = texttospeech.VoiceSelectionParams(
        language_code="ja-JP",
        name="ja-JP-Neural2-D"  # Neural2は高品質
    )

    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=1.0,  # 研修向け標準速度
        pitch=0.0
    )

    # 音声生成
    response = client.synthesize_speech(
        input=synthesis_input,
        voice=voice,
        audio_config=audio_config
    )

    # 保存
    audio_path = f'audio/{section["id"]}.mp3'
    with open(audio_path, 'wb') as f:
        f.write(response.audio_content)

    return audio_path
```

#### Step 6-2: 実際の音声長を測定

**使用ツール**: FFprobe

```bash
# 音声長を取得
ffprobe -v error -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 \
  audio/s02.mp3
```

```python
import subprocess

def get_audio_duration(audio_path):
    """音声ファイルの実際の長さを取得"""

    result = subprocess.run([
        'ffprobe', '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        audio_path
    ], capture_output=True, text=True)

    duration = float(result.stdout.strip())
    return duration

# 推定と実際の差をチェック
for section in selected_sections:
    audio_path = generate_tts_audio(section)

    estimated = section['narration_duration']
    actual = get_audio_duration(audio_path)
    deviation = abs(actual - estimated)

    print(f"{section['id']}: 推定{estimated:.1f}秒 / 実際{actual:.1f}秒 / 差{deviation:.1f}秒")

    # 差が2秒以上ある場合、警告
    if deviation > 2.0:
        print(f"⚠️ 警告: 推定と実際の差が大きい（{deviation:.1f}秒）")
```

### 出力
- `audio/s02.mp3`: 音声ファイル（実際の長さ: 264秒）
- `audio/s03.mp3`: 音声ファイル（実際の長さ: 189秒）
- `audio/s05.mp3`: 音声ファイル（実際の長さ: 15秒）

### 処理時間
- 1-2分（3セクション）

### 重要ポイント

✅ **必ず守ること**:
1. 日本語音声は必ず Google Cloud TTS Neural2 を使用
2. speaking_rate=1.0（研修向け標準速度）
3. 実際の音声長を測定して、推定との差をチェック
4. 差が2秒以上ある場合、Phase 2.5に戻ってナレーション調整

---

## Phase 7: テロップ生成

### 目的
音声に同期した字幕を生成

### 入力
- `selected_sections.json`: ナレーション
- `audio/*.mp3`: 音声ファイル

### 重要ルール

#### 読み/表示分離

**TTS読み形式** → **字幕表示形式** に変換

| TTS読み（音声） | 字幕表示 |
|----------------|---------|
| ファイブステップ | 5ステップ |
| いち、に、さん、 | １、２、３、 |
| 80パーセント | 80% |
| ごふん | 5分 |
| じゅっぷん | 10分 |
| さん倍 | 3倍 |

```python
READING_TO_DISPLAY_MAP = {
    # 数字ステップ
    'ファイブステップ': '5ステップ',
    'テンステップ': '10ステップ',

    # 順序
    'いち、': '１、',
    'に、': '２、',
    'さん、': '３、',
    'よん、': '４、',
    'ご、': '５、',

    # パーセント
    '80パーセント': '80%',
    '90パーセント': '90%',

    # 時間
    'ごふん': '5分',
    'じゅっぷん': '10分',

    # 倍数
    'さん倍': '3倍',
    'ご倍': '5倍'
}

def convert_reading_to_display(narration_text):
    """TTS読み形式 → 字幕表示形式"""
    display_text = narration_text
    for reading, display in READING_TO_DISPLAY_MAP.items():
        display_text = display_text.replace(reading, display)
    return display_text
```

#### 固有名詞保護

以下の固有名詞は分割禁止：

```python
PROTECTED_WORDS = [
    'NotebookLM', 'Obsidian', 'Markdown', 'YouTube', 'Google',
    'OpenAI', 'Claude', 'Gemini', 'GPT', 'Anthropic',
    'DeepMind', 'AGI', 'Grok', 'Pentagon', 'API',
    'JavaScript', 'TypeScript', 'Python', 'React', 'Node.js'
]

def is_safe_to_split(text, pos):
    """指定位置での分割が安全かチェック"""
    for word in PROTECTED_WORDS:
        word_start = text.find(word)
        if word_start >= 0:
            word_end = word_start + len(word)
            if word_start < pos < word_end:
                return False  # word内での分割は禁止
    return True
```

#### 語尾孤立防止

6文字以下のチャンクは前にマージ：

```python
def prevent_orphan_suffix(chunks):
    """語尾孤立を防止"""
    merged = []

    for i, chunk in enumerate(chunks):
        if len(chunk) <= 6 and merged:
            # 前のチャンクにマージ
            merged[-1] += chunk
        else:
            merged.append(chunk)

    return merged

# 例
# ❌ 禁止: ["〜にもなりま", "す。"]
# ✅ 正解: ["〜にもなります。"]
```

### 処理

#### 方法1: Remotion（高度なアニメーション）

**使用プロジェクト**: `/Users/matsumototoshihiko/Desktop/テスト開発/videoJSON2/remotion-telop/`
**使用技術**: Remotion 4.0.399 + React 19.2.3

**6つのスタイルプリセット**:
- `lecture`: 研修・講義（推奨）
- `subtitle`: 標準字幕
- `tiktok`: TikTok風ワードハイライト
- `news`: ニュース風
- `variety`: バラエティ風
- `default`: デフォルト

**13種類のアニメーション**:
`fadeIn`, `fadeUp`, `fadeDown`, `slideLeft`, `slideRight`, `scaleUp`, `scaleDown`, `rotateIn`, `bounceIn`, `typewriter`, `wave`, `shake`, `rainbow`

```bash
cd /Users/matsumototoshihiko/Desktop/テスト開発/videoJSON2/remotion-telop/

# テロップ動画生成
npm run build -- \
  --props='{"audioFile":"../audio/s02.mp3","subtitles":[{"text":"Gemini 2.0は、マルチモーダル理解","startFrame":0,"endFrame":90}],"style":"lecture","animation":"fadeUp"}' \
  --output="../segments/s02_telop.mp4"
```

**Remotion優位性**:
- ✅ 字幕位置制御完璧（React CSS）
- ✅ 13種類のアニメーション
- ✅ 3種類の日本語フォント（Noto Sans JP, M PLUS Rounded, Zen Maru Gothic）
- ✅ フレーム単位のタイミング同期
- ✅ TikTok風ワードハイライト標準機能
- ✅ TypeScriptでプログラマブル制御

#### 方法2: FFmpeg drawtext（シンプル・高速）

**使用ツール**: FFmpeg

```python
def generate_subtitle_with_drawtext(section, audio_path):
    """drawtextで字幕を焼き込む"""

    # 読み/表示分離
    display_text = convert_reading_to_display(section['narration'])

    # スマートチャンク分割（30文字 or 句読点）
    chunks = smart_chunk_text(display_text, max_length=30)
    chunks = prevent_orphan_suffix(chunks)

    # 音声長から表示タイミング計算
    audio_duration = get_audio_duration(audio_path)
    total_frames = int(audio_duration * 30)  # 30fps
    frames_per_chunk = total_frames / len(chunks)

    # drawtext filter生成
    drawtext_filters = []
    for i, chunk in enumerate(chunks):
        start_time = i * (audio_duration / len(chunks))
        end_time = (i + 1) * (audio_duration / len(chunks))

        filter_str = f"drawtext=text='{chunk}':fontfile=/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc:fontsize=36:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=945:enable='between(t,{start_time},{end_time})'"

        drawtext_filters.append(filter_str)

    # FFmpeg実行
    cmd = [
        'ffmpeg', '-i', f'composites/{section["id"]}_composite.png',
        '-i', audio_path,
        '-filter_complex', ','.join(drawtext_filters),
        '-t', str(audio_duration),
        '-c:v', 'libx264', '-c:a', 'aac',
        f'segments/{section["id"]}.mp4'
    ]

    subprocess.run(cmd)
```

**drawtext優位性**:
- ✅ 高速処理
- ✅ シンプル
- ✅ 研修動画に最適

### 使い分けガイド

| ケース | 推奨方法 |
|--------|---------|
| 研修動画（シンプル） | drawtext |
| 研修動画（高品質） | Remotion (lectureスタイル) |
| アニメーション付き | Remotion |
| TikTok風ハイライト | Remotion |
| 高速処理が必要 | drawtext |

### 出力
- `segments/s02.mp4`: セグメント動画（画像+音声+字幕）
- `segments/s03.mp4`: セグメント動画
- `segments/s05.mp4`: セグメント動画

### 処理時間
- Remotion: 5-8分/セグメント
- drawtext: 2-3分/セグメント

---

## Phase 8: 動画合成

### 目的
セグメント動画を結合して最終動画を生成

### 入力
- `segments/*.mp4`: セグメント動画

### 処理

#### Step 8-1: セグメント結合

**使用ツール**: FFmpeg concat

```bash
# concat listファイル作成
cat > concat_list.txt <<EOF
file 'segments/s02.mp4'
file 'segments/s03.mp4'
file 'segments/s05.mp4'
EOF

# FFmpeg concat
ffmpeg -f concat -safe 0 -i concat_list.txt \
  -c copy \
  final_video.mp4
```

#### Step 8-2: 最終検証

```python
# 最終動画の長さをチェック
final_duration = get_audio_duration('final_video.mp4')

# 許容範囲チェック
target_info = calculate_target_duration(19.2)
min_seconds = target_info['min_seconds']
max_seconds = target_info['max_seconds']

in_tolerance = min_seconds <= final_duration <= max_seconds

if in_tolerance:
    print(f"✅ 最終動画: {final_duration/60:.1f}分（許容範囲内）")
else:
    print(f"❌ 最終動画: {final_duration/60:.1f}分（許容範囲外）")
    print(f"   目標範囲: {min_seconds/60:.1f}分 〜 {max_seconds/60:.1f}分")
```

### 出力
- `final_video.mp4`: 完成動画（1920x1080, MP4, H.264）

### 処理時間
- 1-2分

---

## モデル選定ガイド

### 使用モデル一覧

| フェーズ | 処理内容 | ツール/MCP | モデル | 理由 |
|---------|---------|-----------|--------|------|
| Phase 1 | セクション検出 | PySceneDetect | なし | ルールベース |
| Phase 1-4 | AI検証 | `mcp__ollama__ollama_generate` | `llama3.1:70b` | ビジョン対応、推論能力 |
| Phase 2-1 | 文字起こし | Whisper | `large-v3` | 最高精度 |
| Phase 2-2 | 翻訳・要約 | `mcp__ollama__ollama_chat` | `llama3.1:70b` | 長文処理、高精度翻訳 |
| Phase 2.5-5 | ナレーション調整 | `mcp__ollama__ollama_chat` | `llama3.1:70b` | 文章簡潔化/詳細化 |
| Phase 3 | 構造分析 | `mcp__ollama__ollama_generate` | `llama3.1:70b` | ビジョン+JSON出力 |
| Phase 4-1 | 画像生成 | gemini-image-generator | Google Gemini NanoBanana | 高品質、テキストなし |
| Phase 4-1 (backup) | 画像生成 | FAL AI | `fal-ai/nano-banana-pro` | API制限時のみ |
| Phase 6 | TTS音声 | Google Cloud TTS | `ja-JP-Neural2-D` | 日本語最高品質 |

### モデル選定理由

#### Whisper large-v3
- **用途**: 英語文字起こし
- **理由**: OpenAIの最高精度モデル、単語レベルのタイムスタンプ対応
- **代替案**: なし（他モデルは精度不足）

#### llama3.1:70b
- **用途**: 翻訳・要約・推論・ビジョン分析
- **理由**:
  - 70Bパラメータで高精度
  - ビジョン対応（画像分析可能）
  - JSON出力安定
  - ローカル実行（コスト削減）
- **代替案**:
  - `gemma3:27b`: 軽量版（精度劣る）
  - `deepseek-r1:8b`: 推論特化（翻訳は弱い）

#### Google Gemini NanoBanana
- **用途**: 画像生成
- **理由**:
  - テキストなし背景生成が得意
  - 高品質
  - Google公式
- **代替案**: FAL AI `fal-ai/nano-banana-pro`（API制限時のみ）

#### Google Cloud TTS Neural2-D
- **用途**: 日本語音声生成
- **理由**:
  - 日本語の自然さが最高
  - ElevenLabs等は日本語品質が低い
  - speaking_rate調整可能
- **代替案**: なし（他TTSは日本語品質不足）

---

## 処理時間見積もり

### 19分12秒の動画（3セクション選択）

| フェーズ | 処理時間 | 備考 |
|---------|---------|------|
| Phase 0 | 1-3分 | ダウンロード |
| Phase 1 | 8-12分 | 4段階パイプライン |
| Phase 2 | 8-13分 | Whisper 5-8分 + 翻訳 3-5分 |
| Phase 2.5 | 2-3分 | セクション選択 |
| Phase 3 | 3-5分 | 並列処理 |
| Phase 4 | 15-24分 | NanoBanana 5-8分/画像 × 3 |
| Phase 5 | 15-24分 | Phase 4と同時（QC込み） |
| Phase 6 | 1-2分 | TTS生成 |
| Phase 7 | 6-9分 | Remotion 2-3分/セグメント × 3 |
| Phase 8 | 1-2分 | 結合 |
| **合計** | **60-93分** | **1.0-1.5時間** |

### 並列化による短縮

Phase 3, 4, 5を並列実行すると：
- 逐次: 33-53分
- 並列: 15-24分
- **削減: 18-29分（55%短縮）**

### 最終見積もり

| ケース | 処理時間 |
|--------|---------|
| 最短（並列化＋初回合格） | **42分** |
| 標準（並列化＋1回リトライ） | **60分** |
| 最長（逐次＋3回リトライ） | **120分** |

---

## トラブルシューティング

### 問題1: 最終動画が許容範囲外

**症状**: 7分48秒の目標に対し、実際は8分20秒（範囲外）

**原因**: ナレーション音声長の推定誤差

**解決策**:
1. Phase 6で実際の音声長を測定
2. 差が2秒以上ある場合、Phase 2.5に戻ってナレーション調整
3. 再度Phase 6-8を実行

### 問題2: 画像生成が5回リトライしても品質未達

**症状**: OCR読み戻しが90%未達

**原因**: プロンプトが不適切、またはNanoBananaのランダム性

**解決策**:
1. プロンプトを具体化（色、スタイル、配置を明示）
2. "NO text, NO words"を強調
3. FAL AIにフォールバック

### 問題3: Whisperの文字起こしが不正確

**症状**: 専門用語が間違っている

**原因**: Whisperの語彙不足

**解決策**:
1. Phase 2-2の翻訳時にOllamaが修正
2. 重要キーワードリストを事前に用意し、翻訳プロンプトに含める

### 問題4: 字幕が音声とズレる

**症状**: 3分以降で字幕と音声が1-2秒ズレる

**原因**:
- `-shortest`フラグ使用（禁止）
- 累積誤差

**解決策**:
1. 必ず`-t`で動画長を指定（音声長と一致）
2. セグメント単位で検証

### 問題5: セクション選択で重要部分が漏れる

**症状**: 核心的なセクションが選択されない

**原因**: 重要度スコアリングの基準不適切

**解決策**:
1. チャプター記載セクションの配点を上げる（+3点 → +5点）
2. ユーザーが手動で重要セクションを指定できる機能を追加

---

## まとめ

### 最重要ポイント

1. **Phase 2.5（圧縮率計算・セクション選択）が最重要**
   - ナレーション音声長ベースで計算
   - 許容範囲（±15秒）を厳守
   - 重要度スコアリングで優先順位

2. **モデル選定は適材適所**
   - 翻訳・要約: llama3.1:70b
   - 画像生成: Google Gemini NanoBanana
   - TTS: Google Cloud Neural2-D

3. **品質検証ループは必須**
   - 5段階QCで自動検証
   - 最大3回リトライ

4. **処理時間は1-1.5時間**
   - 並列化で約60分に短縮可能

### 関連ドキュメント

- `.claude/COMPLETE_WORKFLOW.md`: 完全統合ワークフロー（Phase 1-8）
- `.claude/SUMMARY_COMPRESSION_RATE.md`: 圧縮率の詳細
- `.claude/VIDEO_SUMMARY_EXAMPLE.md`: 要約プロセスの実例
- `.claude/NARRATION_COMPRESSION_INTEGRATION.md`: ナレーション統合仕様
- `.claude/REMOTION_WORKFLOW.md`: Remotion詳細
- `.claude/CLAUDE.md`: リポジトリ共通ルール

---

**最終更新**: 2026-01-10
**バージョン**: 4.0
