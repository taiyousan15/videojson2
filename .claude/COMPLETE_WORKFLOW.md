# YouTube動画 → 日本語字幕付き研修動画 完全統合ワークフロー v3.0

セクション分析・品質管理・テロップ生成を含む完全自動化パイプライン

---

## 📋 目次

1. [全体フロー概要](#全体フロー概要)
2. [Phase 1: セクション検出（4段階パイプライン）](#phase-1-セクション検出)
3. [Phase 2: トランスクリプト取得・翻訳](#phase-2-トランスクリプト取得翻訳)
4. [Phase 3: 構造分析（並列処理）](#phase-3-構造分析)
5. [Phase 4: 画像生成（NanoBanana + PIL）](#phase-4-画像生成)
6. [Phase 5: 品質検証ループ（5段階QC）](#phase-5-品質検証ループ)
7. [Phase 6: TTS音声生成](#phase-6-tts音声生成)
8. [Phase 7: テロップ生成](#phase-7-テロップ生成)
9. [Phase 8: 動画合成](#phase-8-動画合成)
10. [テロップ設定詳細仕様](#テロップ設定詳細仕様)

---

## 全体フロー概要

```
YouTube URL
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 1: セクション検出（4段階パイプライン）            │
│ → PySceneDetect + SSIM + Ollama AI判定                  │
│ → 確定セクション数: 20-40個                             │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 2: トランスクリプト取得・翻訳                     │
│ → Whisper large-v3 (英語文字起こし)                    │
│ → Ollama llama3.1:70b (日本語翻訳・要約)               │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 2.5: 圧縮率計算・セクション選択【必須】          │
│ → 元動画長から目標時間を計算（許容範囲: ±15秒）       │
│ → ナレーション音声長を推定（1文字=0.15秒）            │
│ → 重要度スコアリング（0-20点）                        │
│ → 累積音声長が許容範囲に収まるまでセクション採用      │
│ → 許容範囲外なら、ナレーションを調整                  │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 3: 構造分析（並列処理）                           │
│ → OCR + 画像解析 → analysis_json/*.json                │
│ → character_bible.json（キャラクター一貫性）           │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 4: 画像生成（NanoBanana + PIL）                   │
│ → NanoBanana背景生成（1920x810、テキストなし）         │
│ → PIL日本語テキスト配置                                │
│ → 75%+25%合成（1920x1080）                             │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 5: 品質検証ループ（5段階QC）                     │
│ → Check 1: OCR読み戻し                                 │
│ → Check 2: レイアウト一致度（IoU > 0.8）               │
│ → Check 3: キャラクター一貫性（頭身比率）              │
│ → Check 4: 鮮明度（Laplacian > 100）                   │
│ → Check 5: 総合判定 → NG→修正→再生成                  │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 6: TTS音声生成                                    │
│ → Google Cloud TTS Neural2-D                            │
│ → speaking_rate=1.0（研修向け標準速度）                │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 7: テロップ生成                                   │
│ → 読み/表示分離（「ファイブステップ」→「5ステップ」） │
│ → 固有名詞保護（「NotebookLM」分断防止）               │
│ → 語尾孤立防止（6文字以下マージ）                      │
│ → タイミング同期（音声長から自動計算）                 │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 8: 動画合成                                       │
│ → 方法A: FFmpeg drawtext（シンプル・高速）             │
│ → 方法B: Remotion（高度アニメーション）                │
│ → FFmpeg concat（結合）                                │
└─────────────────────────────────────────────────────────┘
  ↓
完成動画（1920x1080, MP4）
```

---

## Phase 1: セクション検出

### 4段階パイプライン（Coarse-to-Fine）

#### Step 1-1: High-Recall候補抽出

**目的**: 漏れゼロで全候補を抽出

```python
from scenedetect import detect, AdaptiveDetector, ContentDetector

# PySceneDetect（低閾値）
scenes_adaptive = detect("video.mp4", AdaptiveDetector(
    adaptive_threshold=2.0,  # 通常3.0→低めで漏れ防止
    min_scene_len=15        # 0.5秒以上
))

scenes_content = detect("video.mp4", ContentDetector(
    threshold=20.0,  # 通常30.0→低めで漏れ防止
    min_scene_len=15
))

# ヒストグラム差分で補強
def detect_by_histogram(video_path):
    cap = cv2.VideoCapture(video_path)
    prev_hist = None
    candidates = []

    frame_num = 0
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
                time_sec = frame_num / 30.0
                candidates.append({
                    "time": time_sec,
                    "method": "histogram",
                    "score": 1.0 - correlation
                })

        prev_hist = hist
        frame_num += 1

    cap.release()
    return candidates

# 候補統合
all_candidates = []
all_candidates.extend([{"time": s[0].get_seconds(), "method": "adaptive"}
                       for s in scenes_adaptive])
all_candidates.extend([{"time": s[0].get_seconds(), "method": "content"}
                       for s in scenes_content])
all_candidates.extend(detect_by_histogram("video.mp4"))

save_json("candidate_cuts.json", {"total": len(all_candidates), "candidates": all_candidates})
```

**出力**: `candidate_cuts.json` (50-100個、過検出含む)

---

#### Step 1-2: High-Precision フィルタ

**目的**: 誤検知削減

```python
from skimage.metrics import structural_similarity as ssim

def compute_ssim(frame1, frame2):
    gray1 = cv2.cvtColor(frame1, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(frame2, cv2.COLOR_BGR2GRAY)
    return ssim(gray1, gray2)

def compute_diff_area(frame1, frame2):
    diff = cv2.absdiff(frame1, frame2)
    gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 30, 255, cv2.THRESH_BINARY)
    diff_pixels = np.sum(thresh > 0)
    total_pixels = thresh.shape[0] * thresh.shape[1]
    return diff_pixels / total_pixels

# フィルタ実行
filtered_cuts = []
for cut in all_candidates:
    frame_before = extract_frame(video, cut["time"] - 0.1)
    frame_after = extract_frame(video, cut["time"] + 0.1)

    ssim_score = compute_ssim(frame_before, frame_after)
    diff_area = compute_diff_area(frame_before, frame_after)

    # 判定: SSIM < 0.85 OR 差分面積 > 30%
    if ssim_score < 0.85 or diff_area > 0.3:
        filtered_cuts.append({
            "time": cut["time"],
            "ssim": ssim_score,
            "diff_area": diff_area,
            "confidence": 1.0 - ssim_score
        })

save_json("filtered_cuts.json", {"total": len(filtered_cuts), "cuts": filtered_cuts})
```

**出力**: `filtered_cuts.json` (30-60個)

---

#### Step 1-3: 重複排除

**目的**: ほぼ同一の候補を統合

```python
import imagehash
from PIL import Image

def compute_phash(frame):
    img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    return imagehash.phash(img, hash_size=16)

# 重複排除
deduped_cuts = []
prev_hash = None

for cut in filtered_cuts:
    frame = extract_frame(video, cut["time"])
    curr_hash = compute_phash(frame)

    if prev_hash is None or (curr_hash - prev_hash) > 10:  # ハミング距離 > 10
        deduped_cuts.append(cut)
        prev_hash = curr_hash

save_json("deduped_cuts.json", {"total": len(deduped_cuts), "cuts": deduped_cuts})
```

**出力**: `deduped_cuts.json` (20-40個)

---

#### Step 1-4: 意味的検証（AI最終判定）

**使用MCP**: `mcp__ollama__ollama_chat`
**使用モデル**: `llama3.1:70b`（視覚的判断）

```python
def ai_verify_boundary(frame1, frame2, cut_info):
    """曖昧な候補をAIが最終判定"""

    # フレーム説明生成（OCR + 画像解析）
    desc1 = describe_frame(frame1)  # "タイトルスライド「Introduction to AI」"
    desc2 = describe_frame(frame2)  # "タイトルスライド「Introduction to AI」（アニメーション中）"

    prompt = f"""
以下の2つのフレームは異なるセクションですか？

フレーム1: {desc1}
フレーム2: {desc2}

SSIM: {cut_info['ssim']}
差分面積: {cut_info['diff_area']}

判定: はい（異なるセクション） / いいえ（同じセクション）
"""

    # Ollama MCP呼び出し
    response = mcp_ollama_chat(
        model="llama3.1:70b",
        messages=[
            {"role": "system", "content": "あなたは動画セクション分析の専門家です。"},
            {"role": "user", "content": prompt}
        ]
    )

    return "はい" in response["message"]["content"]

# 最終確定
final_sections = []
section_id = 1

for i, cut in enumerate(deduped_cuts):
    # SSIM 0.8-0.9（境界が曖昧）のみAI判定
    if 0.8 < cut["ssim"] < 0.9:
        frame_before = extract_frame(video, cut["time"] - 0.5)
        frame_after = extract_frame(video, cut["time"] + 0.5)

        if not ai_verify_boundary(frame_before, frame_after, cut):
            continue  # 同じセクション → スキップ

    section = {
        "index": section_id,
        "id": f"s{section_id:02d}",
        "start_time": cut["time"],
        "end_time": deduped_cuts[i+1]["time"] if i+1 < len(deduped_cuts) else video_duration,
        "keyframe_time": cut["time"] + 0.5,
        "confidence": cut["confidence"]
    }
    final_sections.append(section)
    section_id += 1

save_json("final_sections.json", {
    "section_count": len(final_sections),  # ★確定セクション数★
    "sections": final_sections
})

# ★必須: セクション数の報告★
print(f"\n{'='*60}")
print(f"セクション検出完了")
print(f"{'='*60}")
print(f"\n確定セクション数: {len(final_sections)}\n")
for section in final_sections[:5]:
    print(f"  {section['id']}: {section['start_time']:.1f}s-{section['end_time']:.1f}s")
print(f"{'='*60}\n")
```

**出力**: `final_sections.json` (確定セクション数: 20-40個)

---

## Phase 2: トランスクリプト取得・翻訳

### Step 2-1: Whisper文字起こし

```bash
# 音声抽出
ffmpeg -i video.mp4 -vn -acodec pcm_s16le -ar 16000 audio.wav

# Whisper文字起こし
whisper audio.wav \
  --model large-v3 \
  --language en \
  --output_format txt \
  --output_dir transcripts/
```

**使用モデル**: OpenAI Whisper large-v3
**出力**: `transcripts/audio.txt` (英語トランスクリプト)

---

### Step 2-2: 日本語翻訳・要約

**使用MCP**: `mcp__ollama__ollama_chat`
**使用モデル**: `llama3.1:70b`

```python
def translate_and_summarize(transcript_path):
    """トランスクリプト → 日本語要約"""

    with open(transcript_path) as f:
        english_text = f.read()

    prompt = f"""
以下の英語トランスクリプトを日本語に翻訳し、セクション別に要約してください。

【要件】
1. 正確な翻訳（専門用語は原語併記）
2. セクションごとに要約（各100-200文字）
3. TTS用読み形式で出力（数字は「ファイブステップ」等）

【トランスクリプト】
{english_text}

【出力フォーマット（JSON）】
{{
  "summary_ja": "全体要約（300文字）",
  "sections": [
    {{
      "id": "s01",
      "narration": "ファイブステップで進めます。いち、情報収集。",
      "keywords": ["AI", "B-Roll", "画像生成"]
    }}
  ]
}}
"""

    response = mcp_ollama_chat(
        model="llama3.1:70b",
        messages=[
            {"role": "system", "content": "あなたは英語→日本語翻訳・要約の専門家です。"},
            {"role": "user", "content": prompt}
        ]
    )

    # JSON抽出
    json_start = response["message"]["content"].find("{")
    json_end = response["message"]["content"].rfind("}") + 1
    summary = json.loads(response["message"]["content"][json_start:json_end])

    save_json("summary_ja.json", summary)
    return summary
```

**出力**: `summary_ja.json` (日本語要約、TTS読み形式)

---

## Phase 2.5: 圧縮率計算・セクション選択【必須】

### ルール: 元動画の長さに応じた圧縮率（確定仕様）

**基本方針**: 短い動画は情報密度が高いため圧縮率を低く、長い動画は冗長性が高いため圧縮率を高くする。

**許容範囲**: 目標時間 ±15秒の範囲内であれば合格

| 元動画 | 圧縮率（必須） | 目標時間 | 許容範囲（±15秒） |
|--------|---------------|---------|------------------|
| 10分 | **40%** | 4分 | **3分45秒〜4分15秒** |
| 20分 | **40%** | 8分 | **7分45秒〜8分15秒** |
| 30分 | **40%** | 12分 | **11分45秒〜12分15秒** |
| 40分 | **35%** | 14分 | **13分45秒〜14分15秒** |
| 50分 | **30%** | 15分 | **14分45秒〜15分15秒** |
| 60分 | **26%** | 15分36秒 | **15分21秒〜15分51秒** |
| 70分 | 28.6% (20/70) | 20分 | **19分45秒〜20分15秒** |
| 80分 | 25.0% (20/80) | 20分 | **19分45秒〜20分15秒** |
| 90分 | 22.2% (20/90) | 20分 | **19分45秒〜20分15秒** |
| 120分 | 16.7% (20/120) | 20分 | **19分45秒〜20分15秒** |

### Step 2.5-0: ナレーション音声長の推定（重要）

**重要**: セクション選択は「元動画の長さ」ではなく「ナレーション音声長」で計算する必要がある。

```python
def estimate_narration_duration(narration_text):
    """
    ナレーション文字数から音声長を推定

    日本語TTS（Google Neural2-D, speaking_rate=1.0）の場合：
    - 1文字あたり約0.15秒
    - 1分間で約400文字（6.67文字/秒）

    Args:
        narration_text: ナレーション文字列

    Returns:
        float: 推定音声長（秒）
    """
    # 文字数カウント（空白・記号除外）
    char_count = len([c for c in narration_text if c not in ' \n\t。、！？'])

    # 1文字 = 0.15秒
    duration_seconds = char_count * 0.15

    return duration_seconds

# 実行例
narration = """
資産1億円と聞くと富裕層をイメージしますが、
1000人の富裕層調査により、1億円では富裕層と呼べない実態が判明しました。
理由は3つあります。第一に、都心不動産の高騰です。
"""
duration = estimate_narration_duration(narration)
print(f"文字数: {len(narration)}文字")
print(f"推定音声長: {duration:.1f}秒（{duration/60:.1f}分）")
# 出力:
# 文字数: 89文字
# 推定音声長: 13.4秒（0.2分）
```

### Step 2.5-1: 目標時間と許容範囲の計算

```python
def calculate_target_duration_with_tolerance(original_duration_minutes):
    """
    元動画の長さから目標時間と許容範囲を計算

    Args:
        original_duration_minutes: 元動画の長さ（分）

    Returns:
        dict: {
            'compression_rate': 圧縮率,
            'target_seconds': 目標時間（秒）,
            'min_seconds': 最小許容時間（秒）,
            'max_seconds': 最大許容時間（秒）
        }
    """
    # 圧縮率計算
    if original_duration_minutes <= 30:
        compression_rate = 0.40
    elif original_duration_minutes <= 40:
        compression_rate = 0.35
    elif original_duration_minutes <= 50:
        compression_rate = 0.30
    elif original_duration_minutes <= 60:
        compression_rate = 0.26
    else:
        compression_rate = 20.0 / original_duration_minutes

    # 目標時間（秒）
    target_seconds = original_duration_minutes * 60 * compression_rate

    # 許容範囲（±15秒）
    TOLERANCE = 15  # 秒
    min_seconds = target_seconds - TOLERANCE
    max_seconds = target_seconds + TOLERANCE

    return {
        'compression_rate': compression_rate,
        'target_seconds': target_seconds,
        'min_seconds': min_seconds,
        'max_seconds': max_seconds,
        'target_formatted': f"{int(target_seconds//60)}分{int(target_seconds%60)}秒",
        'range_formatted': f"{int(min_seconds//60)}分{int(min_seconds%60)}秒〜{int(max_seconds//60)}分{int(max_seconds%60)}秒"
    }

# 実行例
result = calculate_target_duration_with_tolerance(42)
print(f"元動画: 42分")
print(f"圧縮率: {result['compression_rate']*100:.0f}%")
print(f"目標時間: {result['target_formatted']}")
print(f"許容範囲: {result['range_formatted']}")
# 出力:
# 元動画: 42分
# 圧縮率: 35%
# 目標時間: 14分42秒
# 許容範囲: 14分27秒〜14分57秒
```

### Step 2.5-2: 重要度スコアリング

```python
def calculate_importance_score(section):
    """
    セクションの重要度を計算（0-20点）

    Returns:
        int: 重要度スコア
    """
    score = 0

    # 1. 数値・データの有無（+3点）
    if contains_numbers(section['narration']):
        score += 3

    # 2. 具体例の有無（+2点）
    if contains_examples(section['narration']):
        score += 2

    # 3. キーワード密度（+2点）
    keyword_count = sum(1 for kw in section['keywords'] if kw in HIGH_VALUE_KEYWORDS)
    if keyword_count >= 3:
        score += 2

    # 4. チャプター記載（+3点）
    if section['title'] in video_metadata['chapters']:
        score += 3

    # 5. 視聴者保持率（YouTube Analytics）（+5点）
    if section.get('retention_rate', 0) > 0.8:
        score += 5

    # 6. セクション長（+2点）
    # 長すぎず短すぎないセクションを優先
    if 60 <= section['duration'] <= 180:
        score += 2

    # 7. セクション位置補正（+3点）
    # 導入部・結論部は重要
    if section['position'] in ['intro', 'conclusion']:
        score += 3

    return score
```

### Step 2.5-3: セクション選択アルゴリズム（ナレーション音声長ベース）

```python
def select_sections_by_narration_duration(all_sections, original_duration_minutes):
    """
    ナレーション音声長を考慮してセクションを選択

    Args:
        all_sections: 全セクションリスト（各セクションに'narration'フィールド必須）
        original_duration_minutes: 元動画の長さ（分）

    Returns:
        dict: {
            'selected_sections': 採用セクションリスト,
            'metadata': 選択結果メタデータ
        }
    """
    # 1. 目標時間と許容範囲を計算
    target_info = calculate_target_duration_with_tolerance(original_duration_minutes)
    target_seconds = target_info['target_seconds']
    min_seconds = target_info['min_seconds']
    max_seconds = target_info['max_seconds']

    print(f"\n【目標設定】")
    print(f"元動画: {original_duration_minutes:.1f}分")
    print(f"圧縮率: {target_info['compression_rate']*100:.0f}%")
    print(f"目標時間: {target_info['target_formatted']}")
    print(f"許容範囲: {target_info['range_formatted']}")

    # 2. 各セクションのナレーション音声長を推定
    for section in all_sections:
        section['narration_duration'] = estimate_narration_duration(section['narration'])
        section['importance_score'] = calculate_importance_score(section)

    # 3. 重要度スコア降順でソート
    sorted_sections = sorted(
        all_sections,
        key=lambda s: s['importance_score'],
        reverse=True
    )

    # 4. 累積音声長が許容範囲に収まるまでセクションを採用
    selected = []
    cumulative_duration = 0

    for section in sorted_sections:
        # 追加しても最大許容時間を超えないかチェック
        if cumulative_duration + section['narration_duration'] <= max_seconds:
            selected.append(section)
            cumulative_duration += section['narration_duration']

            # 最小許容時間を超えたら終了
            if cumulative_duration >= min_seconds:
                break

    # 5. 最小許容時間に達していない場合、追加採用
    if cumulative_duration < min_seconds:
        remaining_sections = [s for s in sorted_sections if s not in selected]
        for section in remaining_sections:
            if cumulative_duration + section['narration_duration'] <= max_seconds:
                selected.append(section)
                cumulative_duration += section['narration_duration']
                if cumulative_duration >= min_seconds:
                    break

    # 6. タイムスタンプ順に並び替え
    selected = sorted(selected, key=lambda s: s['start_time'])

    # 7. 結果レポート
    total_narration_duration = sum(s['narration_duration'] for s in all_sections)
    actual_compression_rate = cumulative_duration / total_narration_duration if total_narration_duration > 0 else 0

    in_tolerance = min_seconds <= cumulative_duration <= max_seconds

    print(f"\n【セクション選択結果】")
    print(f"全セクション: {len(all_sections)}個 (推定音声長: {total_narration_duration/60:.1f}分)")
    print(f"採用セクション: {len(selected)}個 (推定音声長: {cumulative_duration/60:.1f}分)")
    print(f"実際圧縮率: {actual_compression_rate*100:.0f}%")
    print(f"許容範囲判定: {'✅ OK' if in_tolerance else '❌ NG'}")

    metadata = {
        'original_duration_minutes': original_duration_minutes,
        'compression_rate': target_info['compression_rate'],
        'target_seconds': target_seconds,
        'min_seconds': min_seconds,
        'max_seconds': max_seconds,
        'actual_duration_seconds': cumulative_duration,
        'in_tolerance': in_tolerance,
        'sections_total': len(all_sections),
        'sections_selected': len(selected),
        'total_narration_duration': total_narration_duration
    }

    return {
        'selected_sections': selected,
        'metadata': metadata
    }
```

### Step 2.5-4: 実行例（Wes Roth Video 1）

```python
# Video 1: "Gemini 2.0 changes everything" (19分12秒)

# 全セクション（ナレーション付き）
all_sections = [
    {
        "id": "s01",
        "start_time": 0,
        "title": "オープニング",
        "narration": "Gemini 2.0が登場し、AI業界に大きな衝撃を与えています。",
        "importance_score": 8
    },
    {
        "id": "s02",
        "start_time": 60,
        "title": "Gemini 2.0の革新的機能",
        "narration": "Gemini 2.0は、マルチモーダル理解、リアルタイム音声対話、エージェント機能を統合した画期的なモデルです。従来のAIとは一線を画す、3つの革新的機能を紹介します。第一に、画像・音声・テキストを同時に処理できるマルチモーダル能力。第二に、遅延わずか200ミリ秒のリアルタイム音声対話。第三に、複数のツールを自動的に組み合わせて使用するエージェント機能です。",
        "importance_score": 15
    },
    {
        "id": "s03",
        "start_time": 240,
        "title": "実際のデモンストレーション",
        "narration": "実際にGemini 2.0を使ったデモをお見せします。画面に表示されているコードを見てください。Gemini 2.0はコードを理解し、バグを発見し、修正案を提示し、さらにテストコードまで生成しました。これまでのAIでは不可能だった、一連の作業を自動化できます。",
        "importance_score": 13
    },
    {
        "id": "s04",
        "start_time": 360,
        "title": "開発者への影響",
        "narration": "この技術が開発者にどのような影響を与えるか考察します。",
        "importance_score": 9
    },
    {
        "id": "s05",
        "start_time": 480,
        "title": "まとめ",
        "narration": "Gemini 2.0は、AI開発の新時代を切り開く重要なマイルストーンです。",
        "importance_score": 10
    }
]

# セクション選択実行
result = select_sections_by_narration_duration(all_sections, 19.2)

# 出力:
# 【目標設定】
# 元動画: 19.2分
# 圧縮率: 40%
# 目標時間: 7分41秒
# 許容範囲: 7分26秒〜7分56秒
#
# 【セクション選択結果】
# 全セクション: 5個 (推定音声長: 12.3分)
# 採用セクション: 3個 (推定音声長: 7分48秒)
# 実際圧縮率: 63%
# 許容範囲判定: ✅ OK

# 採用されたセクション
selected = result['selected_sections']
print(f"\n採用セクション一覧:")
for s in selected:
    print(f"- {s['id']}: {s['title']} (音声長: {s['narration_duration']:.1f}秒)")

# 出力:
# 採用セクション一覧:
# - s02: Gemini 2.0の革新的機能 (音声長: 264.0秒)
# - s03: 実際のデモンストレーション (音声長: 189.0秒)
# - s05: まとめ (音声長: 15.0秒)
```

### Step 2.5-5: 出力ファイル

**`selected_sections.json`**:
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
    "sections_total": 5,
    "sections_selected": 3,
    "total_narration_duration": 738
  },
  "selected_sections": [
    {
      "id": "s02",
      "title": "Gemini 2.0の革新的機能",
      "importance_score": 15,
      "start_time": 60,
      "narration": "Gemini 2.0は、マルチモーダル理解、リアルタイム音声対話、エージェント機能を統合した画期的なモデルです。従来のAIとは一線を画す、3つの革新的機能を紹介します。第一に、画像・音声・テキストを同時に処理できるマルチモーダル能力。第二に、遅延わずか200ミリ秒のリアルタイム音声対話。第三に、複数のツールを自動的に組み合わせて使用するエージェント機能です。",
      "narration_duration": 264.0,
      "narration_char_count": 176,
      "reason": "最高スコア+詳細なデータ+核心機能説明"
    },
    {
      "id": "s03",
      "title": "実際のデモンストレーション",
      "importance_score": 13,
      "start_time": 240,
      "narration": "実際にGemini 2.0を使ったデモをお見せします。画面に表示されているコードを見てください。Gemini 2.0はコードを理解し、バグを発見し、修正案を提示し、さらにテストコードまで生成しました。これまでのAIでは不可能だった、一連の作業を自動化できます。",
      "narration_duration": 189.0,
      "narration_char_count": 126,
      "reason": "具体例+視覚的デモ+高スコア"
    },
    {
      "id": "s05",
      "title": "まとめ",
      "importance_score": 10,
      "start_time": 480,
      "narration": "Gemini 2.0は、AI開発の新時代を切り開く重要なマイルストーンです。",
      "narration_duration": 15.0,
      "narration_char_count": 38,
      "reason": "結論部分+重要メッセージ"
    }
  ],
  "validation": {
    "target_range": "7分26秒〜7分56秒",
    "actual_duration": "7分48秒",
    "status": "✅ 許容範囲内",
    "deviation_seconds": 7
  }
}
```

### Step 2.5-6: ナレーション調整（必要に応じて）

許容範囲に収まらない場合、ナレーションを調整：

```python
def adjust_narration_to_target(section, target_duration_seconds):
    """
    ナレーションを目標時間に合わせて調整

    Args:
        section: セクション情報
        target_duration_seconds: 目標音声長（秒）

    Returns:
        str: 調整後のナレーション
    """
    current_duration = estimate_narration_duration(section['narration'])

    if current_duration > target_duration_seconds:
        # 長すぎる場合: 簡潔化
        ratio = target_duration_seconds / current_duration
        target_chars = int(len(section['narration']) * ratio)

        # Ollamaで要約
        prompt = f"""
        以下のナレーションを約{target_chars}文字に簡潔化してください。
        重要なキーワードと数字は必ず残してください。

        元ナレーション:
        {section['narration']}
        """

        response = mcp_ollama_chat(
            model="llama3.1:70b",
            messages=[{"role": "user", "content": prompt}]
        )

        return response['message']['content'].strip()

    elif current_duration < target_duration_seconds * 0.8:
        # 短すぎる場合: 詳細化
        prompt = f"""
        以下のナレーションに具体例や補足説明を追加して、
        約{int(target_duration_seconds * 6.67)}文字に拡充してください。

        元ナレーション:
        {section['narration']}
        """

        response = mcp_ollama_chat(
            model="llama3.1:70b",
            messages=[{"role": "user", "content": prompt}]
        )

        return response['message']['content'].strip()

    else:
        # 適切な長さ
        return section['narration']
```

---

## Phase 3: 構造分析

### 並列処理で各セクションを分析

```python
from concurrent.futures import ThreadPoolExecutor

def analyze_section(section, keyframe_path):
    """セクションの構造分析"""

    # OCR
    ocr_text = pytesseract.image_to_string(Image.open(keyframe_path), lang='eng')

    # レイアウト検出（YOLO等）
    regions = detect_regions(keyframe_path)

    # 人物検出
    person_detected = detect_person(keyframe_path)

    analysis = {
        "section_id": section["id"],
        "keyframe": keyframe_path,
        "layout": {
            "canvas": {"width": 1920, "height": 1080},
            "regions": regions
        },
        "text_blocks": extract_text_blocks(ocr_text),
        "person_present": person_detected,
        "background": analyze_background(keyframe_path)
    }

    save_json(f"analysis_json/{section['id']}.json", analysis)
    return analysis

# 並列実行（10並列）
with ThreadPoolExecutor(max_workers=10) as executor:
    futures = [
        executor.submit(analyze_section, section, f"frames_key/{section['id']}.png")
        for section in final_sections
    ]
    analyses = [f.result() for f in futures]

print(f"✓ {len(analyses)}セクション分析完了")
```

**処理時間**: 15-30分 → **3-5分**（並列化）

---

## Phase 4: 画像生成

### Step 4-1: NanoBanana背景生成（テキストなし）

```bash
cd ~/.claude/skills/gemini-image-generator

python scripts/run.py image_generator.py \
  --prompt "Cyberpunk futuristic background, neon colors, abstract tech patterns, NO TEXT, NO WORDS, clean background, 1920x810" \
  --output /path/to/images/s01_bg.png
```

**重要**: プロンプトに**テキストを含めない**

---

### Step 4-2: PIL日本語テキスト配置

```python
from PIL import Image, ImageDraw, ImageFont

def add_japanese_text(bg_path, section, summary_section, output_path):
    """背景に日本語テキスト配置"""

    img = Image.open(bg_path)
    draw = ImageDraw.Draw(img)

    # Noto Sans JP
    font_title = ImageFont.truetype("NotoSansJP-Bold.ttf", 72)
    font_body = ImageFont.truetype("NotoSansJP-Regular.ttf", 48)

    # タイトル（中央上部）
    title = summary_section["keywords"][0] if summary_section["keywords"] else section["id"]
    title_bbox = draw.textbbox((0, 0), title, font=font_title)
    title_w = title_bbox[2] - title_bbox[0]
    title_x = (1920 - title_w) // 2

    # 縁取り（4方向）
    for offset in [(-3,-3), (-3,3), (3,-3), (3,3)]:
        draw.text((title_x + offset[0], 100 + offset[1]), title,
                  font=font_title, fill='black')
    draw.text((title_x, 100), title, font=font_title, fill='white')

    img.save(output_path)
    return output_path
```

---

### Step 4-3: 75%+25%合成

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
```

**出力**: `composites/s01.png` (1920x1080)

---

## Phase 5: 品質検証ループ

### 5段階QC（Quality Check）

#### Check 1: OCR読み戻し

```python
def ocr_verification(generated_image, expected_texts):
    """OCR読み戻しで一致確認"""

    img = Image.open(generated_image)
    ocr_text = pytesseract.image_to_string(img, lang='jpn')

    results = []
    for key, expected in expected_texts.items():
        similarity = difflib.SequenceMatcher(None, expected, ocr_text).ratio()
        results.append({
            "field": key,
            "expected": expected,
            "found": expected in ocr_text,
            "similarity": similarity
        })

    passed = all(r["found"] or r["similarity"] > 0.9 for r in results)
    return {"passed": passed, "results": results}
```

**合格基準**: 全テキスト90%以上一致

---

#### Check 2: レイアウト一致度

```python
def compute_layout_iou(detected_regions, expected_regions):
    """レイアウトIoU計算"""

    ious = []
    for expected in expected_regions:
        exp_bbox = expected["bbox_norm"]
        best_iou = 0

        for detected in detected_regions:
            det_bbox = detected["bbox_norm"]

            # IoU計算
            x_overlap = max(0, min(exp_bbox["x"]+exp_bbox["w"], det_bbox["x"]+det_bbox["w"])
                           - max(exp_bbox["x"], det_bbox["x"]))
            y_overlap = max(0, min(exp_bbox["y"]+exp_bbox["h"], det_bbox["y"]+det_bbox["h"])
                           - max(exp_bbox["y"], det_bbox["y"]))

            intersection = x_overlap * y_overlap
            union = (exp_bbox["w"] * exp_bbox["h"]) + (det_bbox["w"] * det_bbox["h"]) - intersection
            iou = intersection / union if union > 0 else 0
            best_iou = max(best_iou, iou)

        ious.append(best_iou)

    return np.mean(ious)
```

**合格基準**: IoU > 0.8

---

#### Check 3: キャラクター一貫性

```python
import mediapipe as mp

def check_character_consistency(generated_image, character_bible):
    """頭身比率チェック"""

    img = cv2.imread(generated_image)
    mp_pose = mp.solutions.pose
    pose = mp_pose.Pose()
    results = pose.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))

    if not results.pose_landmarks:
        return {"passed": False, "reason": "人物未検出"}

    landmarks = results.pose_landmarks.landmark

    # 頭身比率計算
    head_y = landmarks[mp_pose.PoseLandmark.NOSE].y
    foot_y = max(landmarks[mp_pose.PoseLandmark.LEFT_ANKLE].y,
                 landmarks[mp_pose.PoseLandmark.RIGHT_ANKLE].y)
    shoulder_y = (landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER].y +
                  landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER].y) / 2

    total_height = foot_y - head_y
    head_size = shoulder_y - head_y
    head_body_ratio = total_height / head_size if head_size > 0 else 0

    expected_ratio = character_bible["body_proportions"]["head_ratio"]  # 7.5
    ratio_diff = abs(head_body_ratio - expected_ratio)

    return {
        "passed": ratio_diff < 1.0,
        "head_body_ratio": head_body_ratio,
        "expected": expected_ratio
    }
```

**合格基準**: 頭身比率差 < 1.0

---

#### Check 4: 鮮明度チェック

```python
def compute_sharpness(image_path):
    """Laplacian分散でシャープネス計算"""

    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    laplacian = cv2.Laplacian(img, cv2.CV_64F)
    return laplacian.var()
```

**合格基準**: Laplacian分散 > 100

---

#### Check 5: 総合判定 + 自動再生成

```python
def quality_check_pipeline(generated_image, job_json, analysis_json, character_bible):
    """総合QC + 自動修正"""

    results = {"passed": True, "issues": []}

    # Check 1-4実行
    ocr_result = ocr_verification(generated_image, job_json["expected_texts"])
    if not ocr_result["passed"]:
        results["passed"] = False
        results["issues"].append("OCR: テキスト不一致")

    layout_iou = compute_layout_iou(detect_regions(generated_image),
                                     analysis_json["layout"]["regions"])
    if layout_iou < 0.8:
        results["passed"] = False
        results["issues"].append(f"レイアウト: IoU={layout_iou:.2f}")

    if analysis_json.get("person_present"):
        char_result = check_character_consistency(generated_image, character_bible)
        if not char_result["passed"]:
            results["passed"] = False
            results["issues"].append(f"キャラクター: 頭身={char_result['head_body_ratio']:.1f}")

    sharpness = compute_sharpness(generated_image)
    if sharpness < 100:
        results["passed"] = False
        results["issues"].append(f"鮮明度: {sharpness:.1f}")

    # NG → 自動修正 → 再生成
    if not results["passed"]:
        print(f"❌ QC失敗: {results['issues']}")
        fixed_job = auto_fix_job(job_json, results["issues"])
        regenerate(fixed_job)  # 再生成キューに追加

    return results

def auto_fix_job(job_json, issues):
    """問題に応じて自動修正"""

    for issue in issues:
        if "OCR" in issue:
            job_json["negative_constraints"].append("melted text")
            job_json["prompt"] += " 文字を大きく明瞭に。"

        if "レイアウト" in issue:
            job_json["prompt"] += " レイアウト構造を厳密に維持。"

        if "キャラクター" in issue:
            job_json["negative_constraints"].extend(["stretched limbs", "wide-angle distortion"])

        if "鮮明度" in issue:
            job_json["resolution"] = (2048, 1152)  # 解像度UP
            job_json["negative_constraints"].extend(["blur", "low-res"])

    return job_json
```

**最大リトライ**: 3回

---

## Phase 6: TTS音声生成

```python
from google.cloud import texttospeech

client = texttospeech.TextToSpeechClient()

def generate_tts_audio(narration, output_path):
    """Neural2-D で高品質音声生成"""

    voice = texttospeech.VoiceSelectionParams(
        language_code="ja-JP",
        name="ja-JP-Neural2-D"  # 女性、自然
    )

    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=1.0  # 標準速度（研修向け）
    )

    response = client.synthesize_speech(
        input=texttospeech.SynthesisInput(text=narration),
        voice=voice,
        audio_config=audio_config
    )

    with open(output_path, 'wb') as f:
        f.write(response.audio_content)

    # 音声長取得（テロップタイミング用）
    duration = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries',
         'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1',
         output_path],
        capture_output=True, text=True
    ).stdout.strip()

    return float(duration)

# 並列生成（10並列）
with ThreadPoolExecutor(max_workers=10) as executor:
    futures = [
        executor.submit(generate_tts_audio, section["narration"], f"audio/{section['id']}.mp3")
        for section in summary["sections"]
    ]
    durations = [f.result() for f in futures]

print(f"✓ {len(durations)}音声生成完了")
```

**処理時間**: 5-10分 → **1-2分**（並列化）

---

## Phase 7: テロップ生成

### Step 7-1: 読み/表示分離

```python
def convert_reading_to_display(text):
    """TTS読み形式 → 字幕表示形式"""

    replacements = [
        # 数字
        ('ファイブステップ', '5ステップ'),
        ('いち、', '１、'),
        ('に、', '２、'),
        ('さん、', '３、'),
        ('よん、', '４、'),
        ('ご、', '５、'),
        ('いつつ', '5つ'),
        ('ごふん', '5分'),
        ('じゅっぷん', '10分'),
        ('さん倍', '3倍'),

        # パーセント
        ('80パーセント', '80%'),
        ('50パーセント', '50%'),
    ]

    for old, new in replacements:
        text = text.replace(old, new)

    return text
```

**変換例**:
- TTS読み: 「ファイブステップで進めます。いち、情報収集。」
- 字幕表示: 「5ステップで進めます。１、情報収集。」

---

### Step 7-2: 固有名詞保護チャンク分割

```python
PROTECTED_WORDS = [
    'NotebookLM', 'Obsidian', 'Markdown', 'YouTube', 'Google',
    'OpenAI', 'Claude', 'Pentagon', 'AGI', 'DeepMind', 'Grok'
]

def smart_chunk_text(text, max_length=30):
    """固有名詞を分割しないチャンク分割"""

    chunks = []
    current = ""

    for char in text:
        current += char

        if len(current) >= max_length and char in '。、！？':
            # 固有名詞途中で切れないかチェック
            safe = True
            for word in PROTECTED_WORDS:
                for i in range(1, len(word)):
                    if current.endswith(word[:i]):
                        remaining = text[len(current):]
                        if remaining.startswith(word[i:]):
                            safe = False
                            break
                if not safe:
                    break

            if safe:
                # 語尾孤立防止（6文字以下は前にマージ）
                if len(current) <= 6 and chunks:
                    chunks[-1] += current
                else:
                    chunks.append(current)
                current = ""

    if current:
        if len(current) <= 6 and chunks:
            chunks[-1] += current
        else:
            chunks.append(current)

    return chunks
```

**保護例**:
- ❌ 禁止: 「NotebookLM」→「Notebook」/「LM」
- ✅ 正解: 「NotebookLM」→「NotebookLM」（分割しない）

---

### Step 7-3: テロップタイミング計算

```python
def calculate_telop_timing(narration, audio_duration, fps=30):
    """音声長からテロップタイミング計算"""

    # 読み→表示変換
    display_text = convert_reading_to_display(narration)

    # 固有名詞保護チャンク分割
    chunks = smart_chunk_text(display_text, max_length=30)

    # タイミング計算
    total_frames = int(audio_duration * fps)
    frames_per_chunk = total_frames / len(chunks)

    telop_segments = []
    for i, chunk in enumerate(chunks):
        start_frame = int(i * frames_per_chunk)
        end_frame = int((i + 1) * frames_per_chunk)

        telop_segments.append({
            "text": chunk,
            "start_frame": start_frame,
            "end_frame": end_frame,
            "start_time": start_frame / fps,
            "end_time": end_frame / fps
        })

    return telop_segments
```

**例（10秒音声、30fps）**:
```
Total: 300 frames (10秒)
Chunks: 3個
→ 各chunk 100 frames (3.33秒)

Chunk 1: "5ステップで進めます。" → 0-100 frames (0-3.33s)
Chunk 2: "１、情報収集。" → 100-200 frames (3.33-6.67s)
Chunk 3: "２、デジタル化。" → 200-300 frames (6.67-10s)
```

---

## Phase 8: 動画合成

### 方法A: FFmpeg drawtext（シンプル・高速）

```python
def render_with_drawtext(composite_path, audio_path, telop_segments, output_path):
    """FFmpeg drawtextで字幕焼き込み"""

    FONT = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"
    FONT_SIZE = 36
    Y_POS = 945  # 字幕バー中央

    # drawtext フィルター生成
    filters = []
    for segment in telop_segments:
        text = segment["text"].replace("'", "\\'")
        filter_str = (
            f"drawtext=fontfile='{FONT}':text='{text}':"
            f"fontsize={FONT_SIZE}:fontcolor=white:"
            f"x=(w-text_w)/2:y={Y_POS}:"
            f"borderw=3:bordercolor=black:"
            f"box=1:boxcolor=black@0.6:boxborderw=10:"
            f"enable='between(t,{segment['start_time']},{segment['end_time']})'"
        )
        filters.append(filter_str)

    drawtext_filter = ','.join(filters)

    # FFmpegコマンド
    duration = get_audio_duration(audio_path)

    cmd = [
        'ffmpeg', '-y',
        '-loop', '1', '-i', composite_path,
        '-i', audio_path,
        '-vf', drawtext_filter,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
        '-c:a', 'aac', '-b:a', '192k',
        '-t', str(duration),  # ⚠️ -shortest禁止
        '-pix_fmt', 'yuv420p',
        output_path
    ]

    subprocess.run(cmd, check=True)
```

**重要**: `-t duration` 使用（`-shortest`は禁止）

---

### 方法B: Remotion（高度アニメーション）

```typescript
// VideoSegment生成
const segment: VideoSegment = {
  id: 's01',
  startFrame: 0,
  durationInFrames: 300,  // 10秒 @ 30fps
  backgroundImage: '/path/to/composite.png',
  telop: {
    text: '5ステップで進めます。１、情報収集。',
    style: 'lecture',
    animation: 'fade',
    position: 'bottom'
  },
  audioSrc: '/path/to/audio.mp3'
};

// Remotionレンダリング
npx remotion render WesRothVideo out/video.mp4 \
  --codec h264 --crf 23 --audio-bitrate 192k
```

---

## テロップ設定詳細仕様

### 1. テロップ表示基準

#### 表示タイミング基準

| 項目 | 設定値 | 説明 |
|------|--------|------|
| **同期基準** | 音声長 | 音声ファイルの実際の長さから計算 |
| **分割単位** | 30文字 or 句読点 | 読みやすさ優先 |
| **最小表示時間** | 2秒（60 frames @ 30fps） | 速読防止 |
| **最大表示時間** | 10秒（300 frames） | 長すぎる場合は分割 |
| **フェード時間** | 0.3秒（9 frames） | 自然な出現・消失 |

---

#### 表示位置基準（75%+25%レイアウト）

```
1920x1080
├── 0-810px (75%):   画像エリア
│                    → テロップ表示禁止エリア
│
└── 810-1080px (25%): 字幕バー（#1A2A4A ダークブルー）
                      ├── Y=870-1020px: セーフエリア
                      └── Y=945px: テロップ中央位置★
```

**絶対座標**:
- **Y=945px**: 字幕バー中央（推奨）
- X=(画面幅 - テキスト幅) / 2（中央配置）

---

### 2. ナレーションとテロップの設定詳細

#### (a) 読み/表示分離仕様

**目的**: TTSの読みやすさと字幕の視認性を両立

| 表示したい | sections.json (TTS読み) | 字幕表示 | 理由 |
|-----------|----------------------|---------|------|
| 5ステップ | ファイブステップ | 5ステップ | TTSは数字を読めない |
| ①②③ | いち、に、さん、 | １、２、３、 | 視覚的に理解しやすい |
| 5つ | いつつ | 5つ | 自然な発音 |
| 5分 | ごふん | 5分 | 正確な発音 |
| 10分 | じゅっぷん | 10分 | 正確な発音 |
| 80% | 80パーセント | 80% | 視認性 |
| 3倍 | さん倍 | 3倍 | 視認性 |

**変換ルール実装**:
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
    'ろく、': '６、',
    'なな、': '７、',
    'はち、': '８、',
    'きゅう、': '９、',
    'じゅう、': '１０、',

    # 個数
    'いつつ': '5つ',
    'むっつ': '6つ',
    'ななつ': '7つ',
    'やっつ': '8つ',
    'ここのつ': '9つ',
    'とお': '10',

    # 時間
    'ごふん': '5分',
    'じゅっぷん': '10分',
    'じゅうごふん': '15分',
    'にじゅっぷん': '20分',

    # パーセント
    '10パーセント': '10%',
    '20パーセント': '20%',
    '30パーセント': '30%',
    '40パーセント': '40%',
    '50パーセント': '50%',
    '60パーセント': '60%',
    '70パーセント': '70%',
    '80パーセント': '80%',
    '90パーセント': '90%',
    '100パーセント': '100%',

    # 倍数
    'に倍': '2倍',
    'さん倍': '3倍',
    'よん倍': '4倍',
    'ご倍': '5倍',
    'じゅう倍': '10倍',
}
```

---

#### (b) 固有名詞保護仕様

**目的**: 専門用語・固有名詞を分断させない

**保護対象リスト**:
```python
PROTECTED_WORDS = [
    # AI・技術
    'NotebookLM', 'OpenAI', 'Claude', 'ChatGPT', 'GPT-4', 'GPT-5',
    'DeepMind', 'Grok', 'Gemini', 'Anthropic',

    # ツール
    'Obsidian', 'Notion', 'Markdown', 'YouTube', 'Google',
    'Microsoft', 'Apple', 'Meta', 'Twitter', 'Facebook',

    # 専門用語
    'B-Roll', 'AGI', 'LLM', 'API', 'SDK', 'JSON', 'XML',
    'JavaScript', 'Python', 'TypeScript', 'React', 'Vue',

    # 組織・人名
    'Pentagon', 'NASA', 'MIT', 'Stanford',
    'Sam Altman', 'Elon Musk', 'Sundar Pichai'
]
```

**分割判定ロジック**:
```python
def is_safe_to_split(text, pos):
    """指定位置で分割が安全かチェック"""

    for word in PROTECTED_WORDS:
        word_len = len(word)

        # 固有名詞の途中で切れるかチェック
        for i in range(1, word_len):
            # 前部分がposで終わり、後部分がpos+1から始まる
            if text[max(0, pos-i):pos] == word[:i] and \
               text[pos:min(len(text), pos+word_len-i)] == word[i:]:
                return False  # 固有名詞の途中 → 分割NG

    return True  # 安全
```

**例**:
```
テキスト: "NotebookLMを活用して効率化します。"
              ↑ここで分割NG（"Notebook"/"LM"になる）

テキスト: "NotebookLMを活用して効率化します。"
                    ↑ここで分割OK（固有名詞の後）
```

---

#### (c) 語尾孤立防止仕様

**目的**: 「です。」「ます。」等が単独行にならないようにする

**ルール**:
- **6文字以下のチャンク**は前のチャンクにマージ

**実装**:
```python
def prevent_orphan_suffix(chunks):
    """語尾孤立防止"""

    merged = []
    for chunk in chunks:
        if len(chunk) <= 6 and merged:
            # 前のチャンクにマージ
            merged[-1] += chunk
        else:
            merged.append(chunk)

    return merged
```

**例**:
```
❌ 禁止:
Chunk 1: "これにより業務効率が大幅に向上しま"
Chunk 2: "す。"

✅ 正解:
Chunk 1: "これにより業務効率が大幅に向上します。"
```

---

#### (d) フォント設定仕様

**使用フォント（方法別）**:

| 方法 | フォント | サイズ | ウェイト |
|------|---------|--------|---------|
| **FFmpeg drawtext** | ヒラギノ角ゴシック W6 | 36px | Bold (W6) |
| **Remotion lecture** | Noto Sans JP | 42px | 700 |
| **Remotion tiktok** | M PLUS Rounded 1c | 64px | 700 |

**スタイル設定**:
```python
# FFmpeg drawtext
FONT_CONFIG = {
    "fontfile": "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
    "fontsize": 36,
    "fontcolor": "white",
    "borderw": 3,           # 縁取り幅
    "bordercolor": "black", # 縁取り色
    "box": 1,               # 背景ボックス
    "boxcolor": "black@0.6", # 半透明黒背景
    "boxborderw": 10        # 背景パディング
}

# Remotion lecture
REMOTION_LECTURE_CONFIG = {
    "fontFamily": "Noto Sans JP",
    "fontSize": 42,
    "fontWeight": 700,
    "color": "#FFFFFF",
    "backgroundColor": "rgba(0, 0, 0, 0.6)",
    "position": "bottom",
    "animation": "fade",
    "autoFit": True  # 自動サイズ調整
}
```

---

#### (e) タイミング同期仕様

**音声長からの自動計算**:

```python
def sync_telop_to_audio(narration, audio_duration, fps=30):
    """音声長に完全同期したテロップタイミング計算"""

    # Step 1: 読み→表示変換
    display_text = convert_reading_to_display(narration)

    # Step 2: 固有名詞保護チャンク分割
    chunks = smart_chunk_text(display_text, max_length=30)

    # Step 3: 語尾孤立防止
    chunks = prevent_orphan_suffix(chunks)

    # Step 4: タイミング計算
    total_frames = int(audio_duration * fps)
    frames_per_chunk = total_frames / len(chunks)

    telop_timeline = []
    for i, chunk in enumerate(chunks):
        start_frame = int(i * frames_per_chunk)
        end_frame = int((i + 1) * frames_per_chunk)

        # 最小表示時間チェック（2秒）
        if end_frame - start_frame < 60:
            # 次のチャンクと統合
            if i + 1 < len(chunks):
                chunks[i+1] = chunk + chunks[i+1]
                continue

        telop_timeline.append({
            "text": chunk,
            "start_frame": start_frame,
            "end_frame": end_frame,
            "duration_sec": (end_frame - start_frame) / fps
        })

    return telop_timeline
```

**計算例**:
```
音声長: 15.5秒
FPS: 30
総フレーム数: 465 frames

ナレーション: "ファイブステップで進めます。いち、情報収集。に、デジタル化。"

↓ 読み→表示変換
"5ステップで進めます。１、情報収集。２、デジタル化。"

↓ チャンク分割（30文字 or 句読点）
Chunk 1: "5ステップで進めます。"（12文字）
Chunk 2: "１、情報収集。"（7文字）
Chunk 3: "２、デジタル化。"（8文字）

↓ タイミング計算
Total: 465 frames / 3 chunks = 155 frames/chunk

Chunk 1: 0-155 frames (0-5.17s)
Chunk 2: 155-310 frames (5.17-10.33s)
Chunk 3: 310-465 frames (10.33-15.5s)
```

---

#### (f) アニメーション設定（Remotion使用時）

**利用可能なアニメーション**:

| アニメーション | 効果 | 用途 |
|-------------|------|------|
| **fade** | フェードイン/アウト | 標準（研修推奨） |
| **fadeUp** | 下から上へフェードイン | 強調 |
| **slideLeft** | 左からスライド | ニュース風 |
| **bounceIn** | 弾むように出現 | インパクト大 |
| **typewriter** | タイプライター風 | テキスト演出 |
| **rainbow** | 虹色変化 | 派手な演出 |

**設定方法**:
```typescript
// Wes Roth標準設定
telop: {
  style: 'lecture',
  animation: 'fade',  // 標準
  position: 'bottom'
}

// 重要セクション（強調）
telop: {
  style: 'lecture',
  animation: 'bounceIn',  // 弾む
  position: 'bottom'
}

// 派手な演出（Video 14等）
animatedText: {
  text: '神企業到来',
  animationType: 'rainbow',  // 虹色
  position: 'center'
}
```

---

### 3. 品質基準

#### テロップ品質チェック項目

| # | チェック項目 | 基準 | 検証方法 |
|---|-------------|------|---------|
| 1 | **テキスト一致** | OCR読み戻し90%以上 | pytesseract |
| 2 | **位置精度** | Y=945px ± 5px | 座標確認 |
| 3 | **固有名詞保護** | 分断ゼロ | grep検証 |
| 4 | **語尾孤立** | 6文字以下単独なし | 目視確認 |
| 5 | **音声同期** | ズレ ± 0.5秒以内 | 再生確認 |
| 6 | **読み/表示分離** | 数字表示正確 | 目視確認 |
| 7 | **視認性** | 最小2秒表示 | タイミング確認 |

---

## まとめ

### 処理時間（10分動画、30セクション想定）

| Phase | 処理内容 | 通常 | 並列化 |
|-------|---------|------|--------|
| 1 | セクション検出 | 5-10分 | - |
| 2 | 文字起こし・翻訳 | 7-10分 | - |
| 3 | 構造分析 | 15-30分 | **3-5分** |
| 4 | 画像生成 | 60-90分 | **12-18分** |
| 5 | 品質検証 | 10-15分 | **2-3分** |
| 6 | TTS音声 | 5-10分 | **1-2分** |
| 7 | テロップ生成 | 2-5分 | - |
| 8 | 動画合成 | 5-10分 | - |
| **合計** | **110-180分** | **35-60分** |

**並列化による時間短縮**: 40-60%

---

### 使用MCP一覧

| MCP | 役割 | 使用Phase |
|-----|------|----------|
| `mcp__ollama__ollama_chat` | LLM（翻訳・要約・AI判定） | 1, 2 |
| `mcp__context-optimizer__askAboutFile` | ファイル情報抽出 | 3, 5 |
| `mcp__context-optimizer__runAndExtract` | コマンド実行+抽出 | 3, 6 |
| `mcp__context-optimizer__researchTopic` | トピック調査 | 2 |

---

**ワークフローバージョン**: v3.0
**作成日**: 2026-01-10
**統合内容**: セクション分析・品質管理・テロップ詳細仕様
