# 動画生成 完全統合ワークフロー v5.0

**最終更新**: 2026-01-10
**対象**: YouTube URL / MP3 / MP4 → 日本語字幕付き研修動画の完全自動生成

このドキュメントは、動画生成における**全プロセス**を網羅した決定版ガイドです。

---

## 📋 目次

1. [概要](#概要)
2. [入力形式とエントリーポイント](#入力形式とエントリーポイント)
3. [全体フロー図](#全体フロー図)
4. [Phase 0: 事前準備](#phase-0-事前準備)
5. [Phase 1: セクション検出](#phase-1-セクション検出)
6. [Phase 2: トランスクリプト取得・翻訳](#phase-2-トランスクリプト取得翻訳)
7. [Phase 2.5: 圧縮率計算・セクション選択（動画の要約）](#phase-25-圧縮率計算セクション選択)
8. [Phase 3: 構造分析](#phase-3-構造分析)
9. [Phase 3.5: メタプロンプト選択](#phase-35-メタプロンプト選択)
10. [Phase 4: 画像生成](#phase-4-画像生成)
11. [Phase 5: 品質検証ループ](#phase-5-品質検証ループ)
12. [Phase 6: TTS音声生成](#phase-6-tts音声生成)
13. [Phase 7: テロップ生成](#phase-7-テロップ生成)
14. [Phase 8: 動画合成](#phase-8-動画合成)
15. [モデル選定ガイド](#モデル選定ガイド)
16. [検品・チェック体制](#検品チェック体制)
17. [リファレンス管理](#リファレンス管理)
18. [処理時間見積もり](#処理時間見積もり)
19. [トラブルシューティング](#トラブルシューティング)

---

## 概要

### 目的

元動画（YouTube URL / MP3 / MP4）から、日本語ナレーション付き研修動画を自動生成します。

### 主要機能

- **動画の要約**: 元動画を40%以下に圧縮（±15秒の許容範囲）
- **ナレーション音声長ベース選択**: 実際の音声長を考慮したセクション選択
- **メタプロンプト統合**: 301個の高品質テンプレートから最適なスタイルを自動選択
- **品質検証ループ**: 5段階QCで自動品質保証
- **モデル選定**: 各フェーズで最適なモデルを自動選択

### 処理時間

- **標準**: 60分（19分動画 → 7分動画）
- **最短**: 42分（並列化 + 初回合格）
- **最長**: 120分（逐次処理 + 3回リトライ）

---

## 入力形式とエントリーポイント

### 1. YouTube URL

**対象**: YouTube動画
**エントリーポイント**: Phase 0

```bash
python generate_video.py \
  --input "https://youtu.be/qjQH4XH4PBQ" \
  --output "final_video.mp4"
```

**処理フロー**:
```
YouTube URL
  ↓
Phase 0: yt-dlpでダウンロード（MP4 + メタデータ）
  ↓
Phase 1: セクション検出（元動画から）
  ↓
Phase 2: Whisper文字起こし（音声から）
  ↓
Phase 2.5以降: 通常フロー
```

### 2. MP4ファイル

**対象**: ローカルMP4ファイル
**エントリーポイント**: Phase 1（Phase 0をスキップ）

```bash
python generate_video.py \
  --input "video.mp4" \
  --output "final_video.mp4"
```

**処理フロー**:
```
MP4ファイル
  ↓
Phase 1: セクション検出（動画から）
  ↓
Phase 2: Whisper文字起こし（音声抽出→文字起こし）
  ↓
Phase 2.5以降: 通常フロー
```

### 3. MP3ファイル

**対象**: 音声のみ（スライド動画など）
**エントリーポイント**: Phase 2（Phase 0-1をスキップ）

```bash
python generate_video.py \
  --input "audio.mp3" \
  --sections-json "sections_manual.json" \
  --output "final_video.mp4"
```

**処理フロー**:
```
MP3ファイル + sections_manual.json（手動定義）
  ↓
Phase 2: Whisper文字起こし（MP3から）
  ↓
Phase 2.5以降: 通常フロー
```

**sections_manual.json の例**:
```json
{
  "sections": [
    {
      "id": "s01",
      "title": "オープニング",
      "start_time": 0,
      "duration": 30
    },
    {
      "id": "s02",
      "title": "本編",
      "start_time": 30,
      "duration": 300
    }
  ]
}
```

### 入力形式別の処理時間

| 入力形式 | Phase 0 | Phase 1 | Phase 2 | Phase 2.5以降 | 合計 |
|---------|---------|---------|---------|--------------|------|
| YouTube URL | 1-3分 | 8-12分 | 8-13分 | 40-65分 | **60-93分** |
| MP4ファイル | スキップ | 8-12分 | 8-13分 | 40-65分 | **56-90分** |
| MP3ファイル | スキップ | スキップ | 5-8分 | 40-65分 | **45-73分** |

---

## 全体フロー図

```
【入力】
YouTube URL / MP4 / MP3
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 0: 事前準備（YouTube URLのみ）                    │
│ → yt-dlp ダウンロード                                   │
│ → メタデータ取得                                        │
│ ✓ チェックポイント: ダウンロード成功                    │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 1: セクション検出（MP4のみ、MP3はスキップ）       │
│ → 4段階パイプライン（PySceneDetect → SSIM → pHash → AI）│
│ ✓ チェックポイント: セクション数12-40個                │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 2: トランスクリプト取得・翻訳                     │
│ → Whisper large-v3 (英語文字起こし)                    │
│ → Ollama llama3.1:70b (日本語翻訳・要約)               │
│ ✓ チェックポイント: トランスクリプト完全性              │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 2.5: 圧縮率計算・セクション選択【動画の要約】    │
│ → 元動画長から目標時間計算（±15秒許容範囲）           │
│ → ナレーション音声長推定（1文字=0.15秒）              │
│ → 重要度スコアリング（0-20点）                        │
│ → 累積音声長が許容範囲に収まるまで採用                │
│ ✓ チェックポイント: 許容範囲判定（±15秒）              │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 3: 構造分析                                       │
│ → 代表フレーム抽出                                      │
│ → Ollama llama3.1:70b (OCR + レイアウト解析)           │
│ ✓ チェックポイント: analysis_json/*.json生成           │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 3.5: メタプロンプト選択【NEW】                   │
│ → Step 1: 視覚スタイル分析（llama3.1:70b vision）     │
│ → Step 2: メタプロンプト選択（301個から）             │
│ → Step 3: カスタマイズ（元動画スタイルに合わせる）     │
│ ✓ チェックポイント: メタプロンプト選択完了             │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 4: 画像生成                                       │
│ → NanaBanana背景生成（メタプロンプト使用）             │
│ → PIL日本語テキスト配置                                │
│ → 75%+25%合成（画像810px + 字幕バー270px）            │
│ ✓ チェックポイント: 画像生成成功                       │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 5: 品質検証ループ【検品体制】                    │
│ → Check 1: OCR読み戻し（90%一致）                     │
│ → Check 2: レイアウトIoU（> 0.8）                     │
│ → Check 3: キャラクター一貫性（頭身比率±10%）         │
│ → Check 4: 鮮明度（Laplacian > 100）                  │
│ → Check 5: 総合判定 → NG時は再生成（最大3回）         │
│ ✓ チェックポイント: 全画像品質合格                     │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 6: TTS音声生成                                    │
│ → Google Cloud TTS Neural2-D（ja-JP-Neural2-D）        │
│ → speaking_rate=1.0（研修向け標準速度）                │
│ ✓ チェックポイント: 推定音声長との差 < 2秒             │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 7: テロップ生成                                   │
│ → 読み/表示分離（「ファイブ」→「5」）                  │
│ → 固有名詞保護（「NotebookLM」分断防止）               │
│ → 方法選択: Remotion（高度）or drawtext（シンプル）   │
│ ✓ チェックポイント: 字幕同期確認                       │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 8: 動画合成                                       │
│ → セグメント動画生成（画像+音声+字幕）                 │
│ → FFmpeg concat（結合）                                │
│ ✓ チェックポイント: 最終動画が許容範囲内（±15秒）     │
└─────────────────────────────────────────────────────────┘
  ↓
【出力】
完成動画（1920x1080, MP4, H.264）
```

---

## Phase 0: 事前準備

### 目的
動画のダウンロードとメタデータ取得

### 対象入力
- ✅ YouTube URL
- ❌ MP4ファイル（スキップ）
- ❌ MP3ファイル（スキップ）

### 使用ツール
- `yt-dlp`: 動画ダウンロード
- `ffprobe`: メタデータ取得

### 処理フロー

#### Step 0-1: 動画ダウンロード

```bash
# 動画ダウンロード（1080p以下）
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
```json
{
  "title": "動画タイトル",
  "duration": 1152,
  "description": "動画説明文（チャプター情報含む）",
  "channel": "チャンネル名",
  "upload_date": "20260109"
}
```

#### Step 0-3: 作業ディレクトリ作成

```bash
mkdir -p work/{images,audio,composites,subtitles,segments,analysis_json,frames}
```

### 出力

- `downloads/video.mp4`: 元動画
- `metadata/video_info.info.json`: メタデータ
- `work/`: 作業ディレクトリ構造

### チェックポイント

✅ **必須チェック**:
1. ダウンロード成功（ファイルサイズ > 0）
2. メタデータ取得成功（JSON形式正常）
3. 作業ディレクトリ作成成功

### リファレンス管理

**生成ファイル**:
- `metadata/video_info.info.json`: 元動画のメタデータ（タイトル、長さ、チャプターなど）

**保存期間**: プロジェクト期間中

### 処理時間
- 1-3分（動画サイズによる）

---

## Phase 1: セクション検出

### 目的
元動画を意味のあるセクション（場面）に分割

### 対象入力
- ✅ YouTube URL（ダウンロード後のMP4）
- ✅ MP4ファイル
- ❌ MP3ファイル（スキップ、手動sections.json必須）

### 使用ツール・モデル
- PySceneDetect: シーン検出
- scikit-image (SSIM): 類似度計算
- imagehash (pHash): 重複検出
- **Ollama llama3.1:70b**: AI検証（ビジョン対応）

### 4段階パイプライン（Coarse-to-Fine）

#### Step 1-1: High-Recall候補抽出

**目的**: 漏れゼロで全候補を抽出

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

# 色ヒストグラム差分で補強
def detect_by_histogram(video_path):
    """色ヒストグラムの相関で場面変化検出"""
    # （実装省略）
    return candidates

# 3つの手法を統合
all_candidates = merge_candidates([
    scenes_adaptive,
    scenes_content,
    detect_by_histogram("video.mp4")
])

print(f"Step 1-1: {len(all_candidates)}個の候補抽出")
```

**結果例**: 80箇所の候補

#### Step 1-2: High-Precision フィルタリング

**目的**: 本当に意味のある境界だけを残す

```python
from skimage.metrics import structural_similarity as ssim

filtered_cuts = []

for cut in all_candidates:
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
            'diff_area': diff_area
        })

print(f"Step 1-2: {len(filtered_cuts)}個に絞り込み")
```

**結果例**: 25箇所に絞り込み

#### Step 1-3: Deduplication（重複排除）

**目的**: 似た画面の連続カットを統合

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

print(f"Step 1-3: {len(deduped_cuts)}個に統合")
```

**結果例**: 18箇所に統合

#### Step 1-4: AI Verification（AI最終検証）

**目的**: 境界線が曖昧なケースをAIが判断

**使用MCP**: `mcp__ollama__ollama_generate`
**使用モデル**: `llama3.1:70b`（ビジョン対応）

```python
from ollama import Client

client = Client()

verified_sections = []

for cut in deduped_cuts:
    frame_before = extract_frame(video, cut['time'] - 5)
    frame_after = extract_frame(video, cut['time'] + 5)

    # SSIM 0.8-0.9 の曖昧なケースのみAI検証
    if 0.8 <= cut['ssim'] < 0.9:
        prompt = f"""
        これは動画の{format_time(cut['time'])}における前後フレームです。

        前フレーム: [base64_image_before]
        後フレーム: [base64_image_after]

        以下をJSON形式で回答してください：
        {{
          "is_boundary": true/false,
          "reason": "理由",
          "confidence": 0.0-1.0,
          "section_title": "このセクションのタイトル"
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
            cut['section_title'] = result['section_title']
            verified_sections.append(cut)
    else:
        # SSIM < 0.8 は明確な境界として採用
        cut['ai_verified'] = True
        verified_sections.append(cut)

print(f"Step 1-4: {len(verified_sections)}セクション確定")
```

**結果例**: 12セクション確定

### 出力

`sections_detected.json`:
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

### チェックポイント

✅ **必須チェック**:
1. セクション数が12-40個の範囲内
2. 全セクションがAI検証済み
3. 各セクションにタイトル付与

### リファレンス管理

**生成ファイル**:
- `sections_detected.json`: 検出されたセクション一覧

**保存期間**: プロジェクト期間中

### 処理時間
- 8-12分（19分動画の場合）

---

## Phase 2: トランスクリプト取得・翻訳

### 目的
動画の音声をテキスト化し、日本語ナレーションに変換

### 対象入力
- ✅ YouTube URL（ダウンロード後のMP4から音声抽出）
- ✅ MP4ファイル（音声抽出）
- ✅ MP3ファイル（直接使用）

### 使用ツール・モデル
- FFmpeg: 音声抽出
- **Whisper large-v3**: 文字起こし
- **Ollama llama3.1:70b**: 翻訳・要約

### 処理フロー

#### Step 2-1: Whisper文字起こし

**使用モデル**: Whisper `large-v3`

```bash
# 音声抽出（MP4の場合）
ffmpeg -i video.mp4 -vn -acodec pcm_s16le -ar 16000 audio.wav

# Whisper文字起こし
whisper audio.wav \
  --model large-v3 \
  --language en \
  --word_timestamps \
  --output_format json \
  --output_dir transcripts/
```

**出力**: `transcripts/audio.json`

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
    {"word": "Gemini", "start": 0.0, "end": 0.8}
  ]
}
```

#### Step 2-2: 日本語翻訳・要約

**使用MCP**: `mcp__ollama__ollama_chat`
**使用モデル**: `llama3.1:70b`

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
            {"role": "system", "content": "あなたは英語→日本語翻訳・要約の専門家です。"},
            {"role": "user", "content": prompt}
        ]
    )

    # JSON抽出
    content = response['message']['content']
    json_start = content.find("{")
    json_end = content.rfind("}") + 1
    result = json.loads(content[json_start:json_end])

    return result
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

### チェックポイント

✅ **必須チェック**:
1. トランスクリプト完全性（全セクション対応）
2. 日本語ナレーション文字数が適切（元の60-70%）
3. TTS読み形式への変換完了

### リファレンス管理

**生成ファイル**:
- `transcripts/audio.json`: 元動画の全文字起こし
- `summary_ja.json`: 日本語要約（セクションごと）

**保存期間**: プロジェクト期間中

### 処理時間
- Whisper: 5-8分（19分動画の場合）
- 翻訳・要約: 3-5分

---

## Phase 2.5: 圧縮率計算・セクション選択

### 目的

**動画の要約**: ナレーション音声長を考慮してセクションを選択し、目標時間（±15秒）に収める

### 必須ルール

#### 許容範囲: ±15秒

すべての動画において、目標時間 **±15秒** の範囲内であれば合格とします。

| 元動画 | 目標時間 | 許容範囲（±15秒） |
|--------|---------|------------------|
| 10分 | 4分 | **3分45秒〜4分15秒** |
| 20分 | 8分 | **7分45秒〜8分15秒** |
| 30分 | 12分 | **11分45秒〜12分15秒** |
| 40分 | 14分 | **13分45秒〜14分15秒** |
| 50分 | 15分 | **14分45秒〜15分15秒** |
| 60分 | 15分36秒 | **15分21秒〜15分51秒** |
| 60分以上 | 18-22分 | **±15秒** |

### 処理フロー

#### Step 2.5-1: 目標時間計算

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
    if 60 <= section['duration'] <= 180:
        score += 2

    # 7. セクション位置補正（+3点）
    if section['position'] in ['intro', 'conclusion']:
        score += 3

    return score
```

#### Step 2.5-4: セクション選択アルゴリズム

```python
def select_sections_by_narration_duration(all_sections, original_duration_minutes):
    """ナレーション音声長を考慮してセクションを選択"""

    # 1. 目標時間と許容範囲
    target_info = calculate_target_duration(original_duration_minutes)
    target_seconds = target_info['target_seconds']
    min_seconds = target_info['min_seconds']
    max_seconds = target_info['max_seconds']

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
        if cumulative_duration + section['narration_duration'] <= max_seconds:
            selected.append(section)
            cumulative_duration += section['narration_duration']

            if cumulative_duration >= min_seconds:
                break

    # 5. タイムスタンプ順に並び替え
    selected = sorted(selected, key=lambda s: s['start_time'])

    # 6. 結果判定
    in_tolerance = min_seconds <= cumulative_duration <= max_seconds

    return {
        'selected_sections': selected,
        'in_tolerance': in_tolerance,
        'cumulative_duration': cumulative_duration
    }
```

#### Step 2.5-5: ナレーション調整（必要時）

許容範囲外の場合、ナレーションを調整

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

`selected_sections.json`:
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
      "narration": "...",
      "narration_duration": 264.0,
      "narration_char_count": 176,
      "importance_score": 15
    }
  ]
}
```

### チェックポイント

✅ **必須チェック**:
1. 許容範囲判定（±15秒以内）
2. セクション選択がナレーション音声長ベース
3. 重要度スコアが適切に計算

### リファレンス管理

**生成ファイル**:
- `selected_sections.json`: 採用セクション一覧（ナレーション付き）

**保存期間**: プロジェクト期間中

### 処理時間
- 2-3分

---

## Phase 3: 構造分析

### 目的
各セクションの画像を分析し、テキスト配置情報を抽出

### 使用ツール・モデル
- FFmpeg: 代表フレーム抽出
- **Ollama llama3.1:70b**: OCR + レイアウト解析（ビジョン対応）
- MediaPipe Pose: キャラクター一貫性分析

### 処理フロー

#### Step 3-1: 代表フレーム抽出

```bash
# 各セクションの代表フレームを抽出（中間時点）
ffmpeg -i video.mp4 -ss 120 -vframes 1 frames/s02_frame.png
```

#### Step 3-2: OCR + レイアウト解析（並列処理）

**使用MCP**: `mcp__ollama__ollama_generate`
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
    analysis = extract_json(response['response'])

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

    analyses = [f.result() for f in futures]
```

#### Step 3-3: キャラクター一貫性分析（該当する場合）

人物が登場する動画の場合、キャラクター一貫性を確保

```python
import mediapipe as mp

def analyze_character_proportions(frame_path):
    """人物の頭身比率を分析"""

    mp_pose = mp.solutions.pose
    pose = mp_pose.Pose()

    image = cv2.imread(frame_path)
    results = pose.process(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))

    if results.pose_landmarks:
        head_size = calculate_head_size(results.pose_landmarks)
        body_size = calculate_body_size(results.pose_landmarks)

        head_body_ratio = body_size / head_size

        return {
            'head_body_ratio': head_body_ratio,
            'expected_ratio': 7.5
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

### チェックポイント

✅ **必須チェック**:
1. 全セクションの分析完了
2. analysis_json/*.json生成
3. キャラクターバイブル生成（該当する場合）

### リファレンス管理

**生成ファイル**:
- `analysis_json/*.json`: 各セクションのレイアウト情報
- `character_bible.json`: キャラクター一貫性情報

**保存期間**: プロジェクト期間中

### 処理時間
- 3-5分（並列処理）

---

## Phase 3.5: メタプロンプト選択

### 目的
元動画の視覚スタイルを分析し、301個のメタプロンプトから最適なものを選択・カスタマイズ

### メタプロンプト集について

**ソース**: https://furoku.github.io/bananaX/projects/infographic-evaluation/index.html
**メタプロンプト数**: 301個
**品質スコア**: 0-50点（高いほど高品質）

### 3ステップ処理フロー

#### Step 3.5-1: 視覚スタイル分析

**使用MCP**: `mcp__ollama__ollama_generate`
**使用モデル**: `llama3.1:70b`（ビジョン対応）

```python
def analyze_visual_style(frame_path):
    """元動画フレームの視覚スタイルを分析"""

    with open(frame_path, 'rb') as f:
        image_base64 = base64.b64encode(f.read()).decode()

    prompt = """
    この画像の視覚スタイルを分析してください。

    以下の要素について詳しく説明してください：
    1. 全体的な雰囲気・トーン（例: モダン、レトロ、ミニマル、カラフル）
    2. 配色（主要色、アクセントカラー、背景色）
    3. デザインスタイル（例: フラット、3D、イラスト、写真）
    4. タイポグラフィ（使用されているフォントスタイル）
    5. 構図・レイアウト（シンプル、複雑、グリッドベース）
    6. テーマ（ビジネス、テクノロジー、教育など）

    【出力フォーマット（JSON）】
    {
      "atmosphere": "モダンでプロフェッショナル",
      "color_scheme": {
        "primary": "#4285F4",
        "accent": "#34A853",
        "background": "#FFFFFF"
      },
      "design_style": "Flat illustration",
      "typography": "サンセリフ体、クリーン",
      "layout": "グリッドベース、シンプル",
      "theme": "Technology / Business",
      "keywords": ["modern", "professional", "tech", "clean", "minimal"]
    }
    """

    response = client.generate(
        model="llama3.1:70b",
        prompt=prompt,
        images=[image_base64]
    )

    visual_style = extract_json(response['response'])

    return visual_style
```

**出力例**:
```json
{
  "atmosphere": "明るく活気ある",
  "color_scheme": {
    "primary": "#FFC107",
    "accent": "#8BC34A",
    "background": "#FFFFFF"
  },
  "design_style": "Flat illustration, minimal",
  "typography": "サンセリフ体、太め",
  "layout": "中央配置、シンプル",
  "theme": "Financial / Crypto / Bubble",
  "keywords": ["bright", "playful", "minimal", "flat", "crypto"]
}
```

#### Step 3.5-2: メタプロンプト選択

**使用モデル**: なし（ルールベース + スコアマッチング）

```python
def select_best_metaprompt(visual_style, metaprompts):
    """
    元動画の視覚スタイルに基づいて最適なメタプロンプトを選択

    スコアリング:
    - 品質スコア（0-50点）を基準点
    - キーワードマッチング（各+5点）
    - デザインスタイルマッチング（+10点）
    - テーママッチング（+10点）
    """

    keywords = visual_style['keywords']

    scored_prompts = []
    for mp in metaprompts:
        score = mp['total']  # 品質スコア（0-50点）

        # キーワードマッチング
        mp_name_lower = mp['name'].lower()
        for keyword in keywords:
            if keyword.lower() in mp_name_lower:
                score += 5

        # デザインスタイルマッチング
        design_style = visual_style['design_style'].lower()
        if any(style in mp_name_lower for style in design_style.split()):
            score += 10

        # テーママッチング
        theme = visual_style['theme'].lower()
        if any(t in mp_name_lower for t in theme.split('/')):
            score += 10

        scored_prompts.append({
            'metaprompt': mp,
            'match_score': score
        })

    # スコア順にソート
    scored_prompts = sorted(scored_prompts, key=lambda x: x['match_score'], reverse=True)

    # トップ5を返す
    top_5 = scored_prompts[:5]

    return {
        'selected': top_5[0]['metaprompt'],
        'alternatives': [item['metaprompt'] for item in top_5[1:]]
    }
```

#### Step 3.5-3: メタプロンプトのカスタマイズ

**使用MCP**: `mcp__ollama__ollama_chat`
**使用モデル**: `llama3.1:70b`

```python
def customize_metaprompt(base_metaprompt, visual_style, section_title):
    """メタプロンプトを元動画のスタイルに合わせてカスタマイズ"""

    prompt = f"""
    以下のメタプロンプトを、元動画のスタイルに合わせてカスタマイズしてください。

    【ベースメタプロンプト】
    {base_metaprompt['yaml']}

    【元動画のスタイル】
    - 雰囲気: {visual_style['atmosphere']}
    - 配色: 主要色 {visual_style['color_scheme']['primary']}, アクセント {visual_style['color_scheme']['accent']}
    - デザインスタイル: {visual_style['design_style']}
    - テーマ: {visual_style['theme']}

    【このセクションのタイトル】
    {section_title}

    【カスタマイズ要件】
    1. ベースメタプロンプトのトーンを維持
    2. 元動画の配色を反映
    3. セクションタイトルを自然に含める指示を追加
    4. "NO text, NO words, NO numbers on the image" を必ず含める

    【出力】
    カスタマイズされたメタプロンプト（自然言語形式）
    """

    response = client.chat(
        model="llama3.1:70b",
        messages=[{"role": "user", "content": prompt}]
    )

    customized_prompt = response['message']['content'].strip()

    return customized_prompt
```

### 出力

`metaprompts_selected.json`:
```json
{
  "sections": [
    {
      "section_id": "s01",
      "visual_style": {
        "atmosphere": "明るく活気ある",
        "color_scheme": {...}
      },
      "selected_metaprompt": {
        "id": "nano_111",
        "name": "Minimal / Monochrome / Line Art",
        "total": 50
      },
      "customized_prompt": "Minimalist line art illustration...",
      "match_score": 65
    }
  ]
}
```

### チェックポイント

✅ **必須チェック**:
1. 全セクションで視覚スタイル分析完了
2. メタプロンプト選択完了（スコア > 40）
3. カスタマイズ完了

### リファレンス管理

**生成ファイル**:
- `metaprompts_selected.json`: 選択されたメタプロンプト一覧

**保存期間**: プロジェクト期間中

### 処理時間
- 視覚スタイル分析: 1分/セクション
- メタプロンプト選択: 30秒/セクション
- カスタマイズ: 1分/セクション
- **合計**: 2.5分/セクション × 3セクション = **7.5分**

---

## Phase 4: 画像生成

### 目的
NanoBananaで背景画像を生成し、PILで日本語テキストを配置

### 使用ツール・モデル
- **Google Gemini NanoBanana**: 画像生成
- **FAL AI nano-banana-pro**: バックアップ（API制限時）
- PIL (Python Imaging Library): 日本語テキスト配置

### 処理フロー

#### Step 4-1: NanoBanana背景生成

**使用スキル**: `gemini-image-generator`

```python
import subprocess

def generate_background_with_metaprompt(section):
    """メタプロンプトを使ってNanaBananaで背景生成"""

    # カスタマイズされたメタプロンプト使用
    prompt = section['metaprompt']['customized_prompt']

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
        print("⚠️ NanoBanana API制限、FAL AIにフォールバック")

        import fal_client

        fal_result = fal_client.subscribe(
            "fal-ai/nano-banana-pro",
            arguments={
                "prompt": prompt,
                "image_size": {"width": 1920, "height": 810}
            }
        )

        image_url = fal_result['images'][0]['url']
        download_image(image_url, f'images/{section["id"]}_bg.png')

    return f'images/{section["id"]}_bg.png'
```

#### Step 4-2: PIL日本語テキスト配置

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

### チェックポイント

✅ **必須チェック**:
1. 画像生成成功（ファイルサイズ > 0）
2. 解像度正常（1920x1080）
3. テキスト配置正常

### リファレンス管理

**生成ファイル**:
- `images/*.png`: 生成された背景画像
- `composites/*.png`: 最終合成画像

**保存期間**: プロジェクト期間中

### 処理時間
- NanoBanana生成: 5-8分/画像（3画像 = 15-24分）
- PIL処理: 1-2分

---

## Phase 5: 品質検証ループ

### 目的
生成された画像の品質を自動検証し、NG時は再生成

### 5段階QCプロセス

#### Check 1: OCR読み戻し

**使用ツール**: Tesseract OCR

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
        'similarity': similarity
    }
```

#### Check 2: レイアウト一致度（IoU）

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

```python
def check_character_consistency(image_path, character_bible):
    """キャラクターの頭身比率をチェック"""

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
        'actual': actual
    }
```

#### Check 4: 鮮明度（Sharpness）

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
                'attempts': attempt + 1
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
        'attempts': max_retries
    }
```

### 出力

- 品質検証済み画像（3枚）
- `qc_report.json`: 検証レポート

### チェックポイント

✅ **必須チェック**:
1. 全画像品質合格
2. リトライ回数 ≤ 3回
3. QCレポート生成

### リファレンス管理

**生成ファイル**:
- `qc_report.json`: 各セクションの品質検証結果

**保存期間**: プロジェクト期間中

### 処理時間
- 初回合格: 15-24分（Phase 4と同じ）
- リトライあり: +5-8分/回

---

## Phase 6: TTS音声生成

### 目的
選択されたセクションのナレーションを音声化

### 使用ツール・モデル
- **Google Cloud Text-to-Speech**: TTS音声生成
- **ja-JP-Neural2-D**: 日本語Neural2モデル
- FFprobe: 音声長測定

### 処理フロー

#### Step 6-1: Google Cloud TTS音声生成

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

- `audio/s02.mp3`: 音声ファイル
- `audio/s03.mp3`: 音声ファイル
- `audio/s05.mp3`: 音声ファイル

### チェックポイント

✅ **必須チェック**:
1. 全セクションの音声生成成功
2. 推定音声長との差 < 2秒
3. 音声品質正常

### リファレンス管理

**生成ファイル**:
- `audio/*.mp3`: 生成された音声ファイル

**保存期間**: プロジェクト期間中

### 処理時間
- 1-2分（3セクション）

---

## Phase 7: テロップ生成

### 目的
音声に同期した字幕を生成

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
    'ファイブステップ': '5ステップ',
    'テンステップ': '10ステップ',
    'いち、': '１、',
    'に、': '２、',
    'さん、': '３、',
    '80パーセント': '80%',
    'ごふん': '5分',
    'じゅっぷん': '10分',
    'さん倍': '3倍'
}

def convert_reading_to_display(narration_text):
    """TTS読み形式 → 字幕表示形式"""
    display_text = narration_text
    for reading, display in READING_TO_DISPLAY_MAP.items():
        display_text = display_text.replace(reading, display)
    return display_text
```

#### 固有名詞保護

```python
PROTECTED_WORDS = [
    'NotebookLM', 'Obsidian', 'Markdown', 'YouTube', 'Google',
    'OpenAI', 'Claude', 'Gemini', 'GPT', 'Anthropic'
]

def is_safe_to_split(text, pos):
    """指定位置での分割が安全かチェック"""
    for word in PROTECTED_WORDS:
        word_start = text.find(word)
        if word_start >= 0:
            word_end = word_start + len(word)
            if word_start < pos < word_end:
                return False
    return True
```

#### 語尾孤立防止

```python
def prevent_orphan_suffix(chunks):
    """語尾孤立を防止（6文字以下のチャンクは前にマージ）"""
    merged = []

    for i, chunk in enumerate(chunks):
        if len(chunk) <= 6 and merged:
            merged[-1] += chunk
        else:
            merged.append(chunk)

    return merged
```

### 処理フロー

#### 方法1: Remotion（高度なアニメーション）

**使用プロジェクト**: `/Users/matsumototoshihiko/Desktop/テスト開発/videoJSON2/remotion-telop/`

```bash
cd /Users/matsumototoshihiko/Desktop/テスト開発/videoJSON2/remotion-telop/

# テロップ動画生成
npm run build -- \
  --props='{"audioFile":"../audio/s02.mp3","subtitles":[{"text":"Gemini 2.0は...","startFrame":0,"endFrame":90}],"style":"lecture","animation":"fadeUp"}' \
  --output="../segments/s02_telop.mp4"
```

#### 方法2: FFmpeg drawtext（シンプル・高速）

```python
def generate_subtitle_with_drawtext(section, audio_path):
    """drawtextで字幕を焼き込む"""

    # 読み/表示分離
    display_text = convert_reading_to_display(section['narration'])

    # スマートチャンク分割
    chunks = smart_chunk_text(display_text, max_length=30)
    chunks = prevent_orphan_suffix(chunks)

    # 音声長から表示タイミング計算
    audio_duration = get_audio_duration(audio_path)

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

### チェックポイント

✅ **必須チェック**:
1. 字幕同期確認（音声とズレなし）
2. 固有名詞分断なし
3. 語尾孤立なし

### リファレンス管理

**生成ファイル**:
- `segments/*.mp4`: セグメント動画

**保存期間**: プロジェクト期間中

### 処理時間
- Remotion: 5-8分/セグメント
- drawtext: 2-3分/セグメント

---

## Phase 8: 動画合成

### 目的
セグメント動画を結合して最終動画を生成

### 使用ツール
- FFmpeg concat: 動画結合

### 処理フロー

#### Step 8-1: セグメント結合

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

### チェックポイント

✅ **必須チェック**:
1. 最終動画が許容範囲内（±15秒）
2. 動画品質正常（1920x1080, H.264）
3. 音声同期正常

### リファレンス管理

**生成ファイル**:
- `final_video.mp4`: 完成動画

**保存期間**: 永久保存

### 処理時間
- 1-2分

---

## モデル選定ガイド

### 使用モデル一覧

| フェーズ | 処理内容 | ツール/MCP | モデル | 理由 | 代替案 |
|---------|---------|-----------|--------|------|--------|
| Phase 1-4 | AI検証 | `mcp__ollama__ollama_generate` | `llama3.1:70b` | ビジョン対応、推論能力 | なし |
| Phase 2-1 | 文字起こし | Whisper | `large-v3` | 最高精度 | なし |
| Phase 2-2 | 翻訳・要約 | `mcp__ollama__ollama_chat` | `llama3.1:70b` | 長文処理、高精度翻訳 | `gemma3:27b`（軽量版、精度劣る） |
| Phase 2.5-5 | ナレーション調整 | `mcp__ollama__ollama_chat` | `llama3.1:70b` | 文章簡潔化/詳細化 | なし |
| Phase 3 | 構造分析 | `mcp__ollama__ollama_generate` | `llama3.1:70b` | ビジョン+JSON出力 | なし |
| Phase 3.5-1 | 視覚スタイル分析 | `mcp__ollama__ollama_generate` | `llama3.1:70b` | ビジョン対応 | なし |
| Phase 3.5-3 | メタプロンプトカスタマイズ | `mcp__ollama__ollama_chat` | `llama3.1:70b` | 長文処理 | なし |
| Phase 4-1 | 画像生成 | gemini-image-generator | Google Gemini NanoBanana | 高品質、テキストなし | FAL AI `nano-banana-pro` |
| Phase 6 | TTS音声 | Google Cloud TTS | `ja-JP-Neural2-D` | 日本語最高品質 | なし |

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
  - メタプロンプト対応
- **代替案**: FAL AI `fal-ai/nano-banana-pro`（API制限時のみ）

#### Google Cloud TTS Neural2-D
- **用途**: 日本語音声生成
- **理由**:
  - 日本語の自然さが最高
  - ElevenLabs等は日本語品質が低い
  - speaking_rate調整可能
- **代替案**: なし（他TTSは日本語品質不足）

---

## 検品・チェック体制

### 各フェーズのチェックポイント

| フェーズ | チェック内容 | 合格基準 | NG時の対応 |
|---------|-------------|---------|-----------|
| Phase 0 | ダウンロード成功 | ファイルサイズ > 0 | リトライ |
| Phase 1 | セクション数 | 12-40個 | 閾値調整 |
| Phase 2 | トランスクリプト完全性 | 全セクション対応 | リトライ |
| **Phase 2.5** | **許容範囲判定** | **±15秒以内** | **ナレーション調整** |
| Phase 3 | analysis_json生成 | 全セクション完了 | リトライ |
| Phase 3.5 | メタプロンプト選択 | スコア > 40 | 代替案選択 |
| Phase 4 | 画像生成成功 | 解像度1920x1080 | リトライ |
| **Phase 5** | **品質検証** | **5段階QC全合格** | **再生成（最大3回）** |
| Phase 6 | 推定音声長との差 | < 2秒 | Phase 2.5に戻る |
| Phase 7 | 字幕同期 | ズレなし | タイミング再計算 |
| Phase 8 | 最終動画許容範囲 | ±15秒以内 | Phase 2.5に戻る |

### Phase 5: 品質検証ループ（詳細）

**5段階QCプロセス**:

1. **Check 1: OCR読み戻し**
   - 合格基準: 90%以上一致
   - NG時: プロンプト修正→再生成

2. **Check 2: レイアウトIoU**
   - 合格基準: > 0.8
   - NG時: レイアウト調整→再生成

3. **Check 3: キャラクター一貫性**
   - 合格基準: 頭身比率±10%
   - NG時: プロンプト修正→再生成

4. **Check 4: 鮮明度**
   - 合格基準: Laplacian > 100
   - NG時: プロンプト修正→再生成

5. **Check 5: 総合判定**
   - 合格基準: Check 1-4全合格
   - NG時: 最大3回リトライ

**リトライフロー**:
```
初回生成
  ↓
5段階QC
  ↓
[合格] → 次フェーズへ
[不合格] → プロンプト修正 → 再生成（1回目）
  ↓
5段階QC
  ↓
[合格] → 次フェーズへ
[不合格] → プロンプト修正 → 再生成（2回目）
  ↓
5段階QC
  ↓
[合格] → 次フェーズへ
[不合格] → プロンプト修正 → 再生成（3回目）
  ↓
5段階QC
  ↓
[合格] → 次フェーズへ
[不合格] → ⚠️ 警告（手動確認）
```

### 全体的な検品体制

**3層チェック体制**:

1. **リアルタイムチェック**: 各フェーズ完了時
2. **Phase 5品質検証ループ**: 画像品質の自動検証
3. **Phase 8最終検証**: 最終動画の許容範囲チェック

**ログ管理**:
- `logs/phase_*.log`: 各フェーズのログ
- `logs/qc_report.json`: 品質検証レポート
- `logs/error.log`: エラーログ

---

## リファレンス管理

### 生成ファイル一覧

| ファイル | 生成フェーズ | 内容 | 保存期間 |
|---------|------------|------|---------|
| `metadata/video_info.info.json` | Phase 0 | 元動画メタデータ | プロジェクト期間中 |
| `sections_detected.json` | Phase 1 | 検出されたセクション一覧 | プロジェクト期間中 |
| `transcripts/audio.json` | Phase 2 | 元動画の全文字起こし | プロジェクト期間中 |
| `summary_ja.json` | Phase 2 | 日本語要約 | プロジェクト期間中 |
| `selected_sections.json` | Phase 2.5 | 採用セクション一覧 | プロジェクト期間中 |
| `analysis_json/*.json` | Phase 3 | 各セクションのレイアウト情報 | プロジェクト期間中 |
| `character_bible.json` | Phase 3 | キャラクター一貫性情報 | プロジェクト期間中 |
| `metaprompts_selected.json` | Phase 3.5 | 選択されたメタプロンプト | プロジェクト期間中 |
| `images/*.png` | Phase 4 | 生成された背景画像 | プロジェクト期間中 |
| `composites/*.png` | Phase 4 | 最終合成画像 | プロジェクト期間中 |
| `qc_report.json` | Phase 5 | 品質検証結果 | プロジェクト期間中 |
| `audio/*.mp3` | Phase 6 | 生成された音声ファイル | プロジェクト期間中 |
| `segments/*.mp4` | Phase 7 | セグメント動画 | プロジェクト期間中 |
| `final_video.mp4` | Phase 8 | 完成動画 | 永久保存 |

### リファレンス管理の目的

1. **再現性**: 同じ入力から同じ出力を再現可能
2. **デバッグ**: 各フェーズの中間生成物を確認可能
3. **品質保証**: 品質検証レポートで問題追跡
4. **監査**: 元動画のメタデータと最終動画の対応関係を記録

### ディレクトリ構造

```
work/
├── metadata/
│   └── video_info.info.json
├── frames/
│   ├── s02_frame.png
│   ├── s03_frame.png
│   └── s05_frame.png
├── transcripts/
│   └── audio.json
├── analysis_json/
│   ├── s02.json
│   ├── s03.json
│   └── s05.json
├── images/
│   ├── s02_bg.png
│   ├── s02_text.png
│   ├── s03_bg.png
│   ├── s03_text.png
│   ├── s05_bg.png
│   └── s05_text.png
├── composites/
│   ├── s02_composite.png
│   ├── s03_composite.png
│   └── s05_composite.png
├── audio/
│   ├── s02.mp3
│   ├── s03.mp3
│   └── s05.mp3
├── segments/
│   ├── s02.mp4
│   ├── s03.mp4
│   └── s05.mp4
├── logs/
│   ├── phase_0.log
│   ├── phase_1.log
│   ├── ...
│   ├── qc_report.json
│   └── error.log
├── sections_detected.json
├── summary_ja.json
├── selected_sections.json
├── character_bible.json
├── metaprompts_selected.json
├── concat_list.txt
└── final_video.mp4
```

---

## 処理時間見積もり

### 19分12秒の動画（3セクション選択）

| フェーズ | 処理時間 | 備考 |
|---------|---------|------|
| Phase 0 | 1-3分 | YouTube URLのみ |
| Phase 1 | 8-12分 | 4段階パイプライン |
| Phase 2 | 8-13分 | Whisper 5-8分 + 翻訳 3-5分 |
| Phase 2.5 | 2-3分 | セクション選択 |
| Phase 3 | 3-5分 | 並列処理 |
| **Phase 3.5** | **7.5分** | **メタプロンプト選択（NEW）** |
| Phase 4 | 15-24分 | NanoBanana 5-8分/画像 × 3 |
| Phase 5 | 15-24分 | Phase 4と同時（QC込み） |
| Phase 6 | 1-2分 | TTS生成 |
| Phase 7 | 6-9分 | drawtext 2-3分/セグメント × 3 |
| Phase 8 | 1-2分 | 結合 |
| **合計** | **67-100分** | **1.1-1.7時間** |

### 並列化による短縮

Phase 3, 4, 5を並列実行すると：
- 逐次: 40-60分
- 並列: 15-24分
- **削減: 25-36分（62%短縮）**

### 最終見積もり

| ケース | 処理時間 |
|--------|---------|
| 最短（並列化＋初回合格） | **49分** |
| 標準（並列化＋1回リトライ） | **67分** |
| 最長（逐次＋3回リトライ） | **130分** |

### 入力形式別の処理時間

| 入力形式 | Phase 0 | Phase 1 | Phase 2 | Phase 2.5-8 | 合計 |
|---------|---------|---------|---------|------------|------|
| YouTube URL | 1-3分 | 8-12分 | 8-13分 | 48-72分 | **67-100分** |
| MP4ファイル | スキップ | 8-12分 | 8-13分 | 48-72分 | **64-97分** |
| MP3ファイル | スキップ | スキップ | 5-8分 | 48-72分 | **53-80分** |

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

### 問題6: Phase 3.5でメタプロンプト選択がうまくいかない

**症状**: 選択されたメタプロンプトのスコアが低い（< 40点）

**原因**: 視覚スタイル分析の精度不足

**解決策**:
1. 視覚スタイル分析プロンプトを詳細化
2. 代表フレームの選択位置を調整
3. 代替案（スコア上位5個）から手動選択

---

## まとめ

### 最重要ポイント

1. **Phase 2.5（動画の要約）が最重要**
   - ナレーション音声長ベースで計算
   - 許容範囲（±15秒）を厳守
   - 重要度スコアリングで優先順位

2. **Phase 3.5（メタプロンプト選択）で品質向上**
   - 301個のテンプレートから自動選択
   - 元動画スタイルに合わせてカスタマイズ
   - 視覚的一貫性を確保

3. **モデル選定は適材適所**
   - 翻訳・要約: llama3.1:70b
   - 画像生成: Google Gemini NanoBanana
   - TTS: Google Cloud Neural2-D

4. **品質検証ループは必須**
   - 5段階QCで自動検証
   - 最大3回リトライ

5. **検品・チェック体制**
   - 各フェーズで即座にチェック
   - Phase 5で集中的に品質検証
   - Phase 8で最終確認

6. **リファレンス管理**
   - 全中間生成物を保存
   - 再現性とデバッグ性を確保

### 処理時間

- **標準**: 67分（19分動画 → 7分動画）
- **最短**: 49分（並列化 + 初回合格）
- **最長**: 130分（逐次処理 + 3回リトライ）

### 関連ドキュメント

- `.claude/MASTER_VIDEO_GENERATION_WORKFLOW.md`: Phase 0-8の詳細
- `.claude/NANABANA_METAPROMPT_INTEGRATION.md`: Phase 3.5の詳細
- `.claude/NARRATION_COMPRESSION_INTEGRATION.md`: Phase 2.5の詳細
- `.claude/SUMMARY_COMPRESSION_RATE.md`: 圧縮率の詳細
- `.claude/VIDEO_SUMMARY_EXAMPLE.md`: 要約プロセスの実例
- `.claude/CLAUDE.md`: リポジトリ共通ルール
- `.claude/skills/README.md`: スキル全体マップ
- `docs/slide_quick_mode.md`: Quick Mode詳細

---

**バージョン**: 5.0
**最終更新**: 2026-01-10
**作成者**: Claude Code
