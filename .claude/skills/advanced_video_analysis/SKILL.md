---
name: advanced_video_analysis
description: 動画→セクション分割→構造分析JSON→NanoBanana生成投入→品質検証までを一気通貫で自動化する高精度ワークフロー
triggers:
  - "高精度動画解析"
  - "Advanced Mode"
  - "自動セクション検出"
  - "4段階パイプライン"
  - "キャラクター一貫性"
  - "品質検証ループ"
inputs:
  - 元動画（YouTubeリンク または 動画ファイル）
  - プロジェクト名（任意）
outputs:
  - section_count（確定セクション数）
  - final_sections.json
  - frames_key/ と frames_manifest.json
  - analysis_json/*.json
  - character_bible.json
  - nanobanana_jobs/*.job.json
  - quality_report.md
---

# Advanced Video Analysis スキル v1.0

動画→セクション分割→構造分析JSON→NanoBanana生成投入→品質検証までを一気通貫で自動化するエンジニアリングワークフロー。

**Quick Mode（スライド.md）との違い:**
- 自動セクション検出（4段階パイプライン）
- キャラクター一貫性保証（character_bible）
- 自動品質検証ループ（OCR読み戻し、レイアウト比較、歪み検出）
- ハルシネーション防止機構

**Parallel Advanced Mode（slide2.md）への移行:**
- このスキルに**並列処理**を追加したバージョン
- **40-60%の処理時間短縮**
- 5フェーズ並列化（OCR, NanoBanana, TTS, FFmpeg, 品質検証）
- 詳細: **`.claude/skills/slide2.md`**

---

## ■ 最重要要件（必ず守る）

### 1. セクション数の確定
画面（カット/スライド）が切り替わる境界を漏れなく抽出し、最終的に「確定したセクション数」を出す。

### 2. 各セクションの構造分析
画像ごとにレイアウト/要素/テキスト/図表/人物/背景/視線誘導/配色/タイポグラフィ等を解析し、JSONで厳密に構造化。

### 3. NanoBanana生成への受け渡し
各セクションを高再現するための生成指示（日本語）と参照画像をセットにして出力。

### 4. キャラクター一貫性
元動画の人物を切り抜いて流用しない。代わりに「NanoBanana生成キャラクター」を用い、全セクションで顔・体型・衣装の一貫性を保つ。

### 5. 画質課題の抑止
ぼやけ/伸び/太りを抑止するための制約と検証ループを必須化。

---

## ■ 絶対禁止事項

| 禁止事項 | 理由 |
|----------|------|
| **元動画からの画像・フレームの切り出し・コピー** | 著作権リスク |
| **元動画のフレームを背景として使用** | 暗くしても、ぼかしても禁止 |
| **元動画の映像を加工して再利用** | いかなる形式での再利用も禁止 |
| プレースホルダーの使用 | 不完全な教材になる |
| ハルシネーション（新情報の追加） | OCR + transcript + ユーザー追記のみ許可 |

---

## ■ 入力パラメータ

```python
video_input = "{URL または ローカルMP4パス}"
project_name = "任意（なければ video_basename）"
language_target = "ja"  # 日本語再現
section_definition = {
    "hard_cut": True,           # 明確な画面切替
    "soft_transition": True,    # フェード/ディゾルブ等の遷移
    "slide_animation": False    # 同一スライド内のアニメーション（既定は別セクション扱いしない）
}
output_dir = "./out/{project_name}/"
```

---

## ■ パイプライン（4段階 Coarse-to-Fine）

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: High-Recall候補抽出（漏れゼロ優先）                 │
├─────────────────────────────────────────────────────────────┤
│ • PySceneDetect（Adaptive/ContentDetector）で閾値低めに抽出 │
│ • ヒストグラム差分・SSIMでスパイク候補を補強                │
│ • 出力: candidate_cuts.json（候補時刻の集合、検出根拠付き） │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: High-Precision フィルタ（誤検知削減）              │
├─────────────────────────────────────────────────────────────┤
│ • TransNetV2等のSBDモデルで候補周辺を推論                   │
│ • 差分領域面積やSSIMで二次フィルタ                          │
│ • 出力: filtered_cuts.json（信頼度付き）                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: 重複排除・アニメ統合（De-dup）                     │
├─────────────────────────────────────────────────────────────┤
│ • pHash + SSIM で「ほぼ同一」を統合                         │
│ • slide_animation の扱いは設定に従う                        │
│ • 出力: deduped_cuts.json（最終候補）                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 4: 意味的検証（最終確定）                             │
├─────────────────────────────────────────────────────────────┤
│ • SSIMが境界域など判断が揺れる箇所をAIが最終判定           │
│ • 出力: final_sections.json                                 │
│   (start/end, keyframe_time, confidence, transition_type)   │
└─────────────────────────────────────────────────────────────┘
```

---

## ■ Step 0: プロジェクト初期化

```bash
# ディレクトリ構造
output_dir/
├── raw_video/           # 元動画
├── frames_raw/          # 全フレーム（デバッグ用）
├── frames_key/          # キーフレーム（セクション代表）
├── analysis_json/       # 各セクションの構造分析
├── nanobanana_jobs/     # NanoBanana投入データ
└── reports/             # 品質レポート
```

```python
# run_manifest.json を作成（再現性のため）
{
    "run_id": "uuid",
    "timestamp": "ISO8601",
    "video_input": "...",
    "project_name": "...",
    "settings": {...},
    "versions": {
        "ffmpeg": "...",
        "python": "...",
        "pyscenedetect": "..."
    }
}
```

---

## ■ Step 1: 動画の取得

### URLの場合
```bash
# yt-dlp で取得
yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]" \
  -o "raw_video/source.mp4" "{URL}"

# 字幕も取得（あれば）
yt-dlp --write-auto-sub --sub-lang ja --skip-download -o "raw_video/source" "{URL}"
```

### MP4の場合
```bash
cp "{input.mp4}" raw_video/source.mp4
```

---

## ■ Step 2: セクション境界検出

### 2.1 High-Recall候補抽出

```python
from scenedetect import detect, AdaptiveDetector, ContentDetector

# 低閾値で漏れなく抽出
scenes_adaptive = detect("raw_video/source.mp4", AdaptiveDetector(
    adaptive_threshold=2.0,  # 低めに設定
    min_scene_len=15  # 0.5秒以上
))

scenes_content = detect("raw_video/source.mp4", ContentDetector(
    threshold=20.0,  # 低めに設定
    min_scene_len=15
))

# 候補を統合
candidate_cuts = merge_candidates(scenes_adaptive, scenes_content)
save_json("candidate_cuts.json", candidate_cuts)
```

### 2.2 High-Precisionフィルタ

```python
# SSIM/差分領域で二次フィルタ
filtered_cuts = []
for cut in candidate_cuts:
    frame_before = extract_frame(cut["time"] - 0.1)
    frame_after = extract_frame(cut["time"] + 0.1)

    ssim_score = compute_ssim(frame_before, frame_after)
    diff_area = compute_diff_area(frame_before, frame_after)

    if ssim_score < 0.85 or diff_area > 0.3:  # 実際のカット
        cut["confidence"] = 1.0 - ssim_score
        filtered_cuts.append(cut)

save_json("filtered_cuts.json", filtered_cuts)
```

### 2.3 重複排除

```python
import imagehash
from PIL import Image

def compute_phash(frame_path):
    return imagehash.phash(Image.open(frame_path))

# pHash + SSIMで「ほぼ同一」を統合
deduped_cuts = []
prev_hash = None
for cut in filtered_cuts:
    frame = extract_keyframe(cut["time"])
    curr_hash = compute_phash(frame)

    if prev_hash is None or curr_hash - prev_hash > 10:  # 十分に異なる
        deduped_cuts.append(cut)
        prev_hash = curr_hash

save_json("deduped_cuts.json", deduped_cuts)
```

### 2.4 意味的検証（最終確定）

```python
# 境界が曖昧な箇所をAIが最終判定
final_sections = []
for i, cut in enumerate(deduped_cuts):
    section = {
        "index": i + 1,
        "id": f"s{i+1:02d}",
        "start_time": cut["time"],
        "end_time": deduped_cuts[i+1]["time"] if i+1 < len(deduped_cuts) else video_duration,
        "keyframe_time": cut["time"] + 0.5,  # 遷移直後を避ける
        "transition_type": cut.get("type", "hard_cut"),
        "confidence": cut["confidence"]
    }
    final_sections.append(section)

save_json("final_sections.json", {"section_count": len(final_sections), "sections": final_sections})
```

### 2.5 セクション数の報告（必須・最優先）

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
セクション検出完了
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

確定セクション数: 57

セクション一覧:
  s01: 00:00-00:15 (hard_cut, conf=0.95)
  s02: 00:15-00:42 (hard_cut, conf=0.92)
  s03: 00:42-01:10 (soft_transition, conf=0.88)
  ...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## ■ Step 3: キーフレーム抽出

```python
for section in final_sections:
    # 遷移直後のノイズを避けて最もシャープなフレームを選択
    candidates = []
    for offset in [0.3, 0.5, 0.7, 1.0]:
        t = section["start_time"] + offset
        if t < section["end_time"]:
            frame = extract_frame(t)
            sharpness = compute_laplacian_variance(frame)
            candidates.append((t, frame, sharpness))

    # 最もシャープなフレームを採用
    best = max(candidates, key=lambda x: x[2])
    save_frame(best[1], f"frames_key/{section['id']}.png")
```

---

## ■ Step 4: 構造分析（各セクションJSON化）

各キーフレームについて `analysis_json/{section_id}.json` を作成:

```json
{
  "section_id": "s01",
  "keyframe": "frames_key/s01.png",

  "image_type": "slide",

  "layout": {
    "canvas": {"width": 1920, "height": 1080, "aspect_ratio": "16:9"},
    "regions": [
      {
        "id": "title",
        "role": "title",
        "bbox_norm": {"x": 0.05, "y": 0.05, "w": 0.9, "h": 0.15},
        "z_index": 1
      },
      {
        "id": "main_image",
        "role": "photo",
        "bbox_norm": {"x": 0.1, "y": 0.25, "w": 0.4, "h": 0.6},
        "z_index": 0
      },
      {
        "id": "body_text",
        "role": "body",
        "bbox_norm": {"x": 0.55, "y": 0.25, "w": 0.4, "h": 0.6},
        "z_index": 1
      }
    ],
    "grid": {"columns": 2, "gutter": 0.05}
  },

  "text_blocks": [
    {
      "id": "title_text",
      "region_id": "title",
      "text_raw": "THE \"B-ROLL\" CONCEPT",
      "text_ja": "「Bロール」コンセプト",
      "lang": "en",
      "font_guess": {"size": 48, "weight": "bold"},
      "align": "left",
      "hierarchy": "H1"
    },
    {
      "id": "body_text_1",
      "region_id": "body_text",
      "text_raw": "Next we can turn these 10 images into more powerful images...",
      "text_ja": "次に、これらの10枚の画像をより強力な画像に変換できます...",
      "lang": "en",
      "font_guess": {"size": 24, "weight": "normal"},
      "align": "left",
      "hierarchy": "body"
    }
  ],

  "images": [
    {
      "id": "main_photo",
      "region_id": "main_image",
      "type": "ai_generated_photo",
      "description": "男性がソファに座り、風船の横でポーズを取っている誕生日写真",
      "style": "photorealistic",
      "requires_generation": true
    }
  ],

  "person_present": true,
  "person_info": {
    "role": "presenter",
    "pose": "seated",
    "gesture": "peace_sign",
    "gaze_direction": "camera",
    "screen_coverage": 0.35
  },

  "background": {
    "type": "solid",
    "color": "#f5f0e8"
  },

  "translate_plan": {
    "strategy": "direct_translation",
    "technical_terms": ["B-Roll"],
    "line_break_candidates": [50, 100]
  },

  "hallucination_guard": {
    "allowed_sources": ["ocr", "transcript", "user_input"],
    "verified_texts": ["THE \"B-ROLL\" CONCEPT", "Next we can turn..."]
  }
}
```

---

## ■ Step 5: キャラクター一貫性（character_bible.json）

```json
{
  "character_id": "presenter_01",
  "description": "メインプレゼンター",

  "appearance": {
    "age_range": "35-45",
    "gender_expression": "male",
    "ethnicity": "asian",
    "hair": {
      "style": "short",
      "color": "black"
    },
    "face": {
      "shape": "oval",
      "features": "clean-shaven"
    }
  },

  "body_proportions": {
    "head_ratio": 7.5,
    "shoulder_width_ratio": 0.25,
    "arm_length_ratio": 0.45,
    "leg_length_ratio": 0.5
  },

  "outfit": {
    "default": {
      "top": "brocade jacket with floral pattern, blue and gold",
      "bottom": "dark trousers",
      "accessories": "patterned silk scarf"
    }
  },

  "expression_range": ["neutral", "slight_smile", "thoughtful"],

  "style": {
    "rendering": "photorealistic",
    "lighting": "soft studio lighting",
    "camera": "portrait lens, no wide-angle distortion"
  },

  "ng_constraints": [
    "stretched limbs",
    "wide-angle distortion",
    "warped anatomy",
    "inconsistent face",
    "different outfit",
    "blurry features"
  ]
}
```

---

## ■ Step 6: NanoBanana投入データ生成

各セクション `nanobanana_jobs/{section_id}.job.json`:

```json
{
  "job_id": "s01_job",
  "section_id": "s01",

  "references": {
    "layout_reference": {
      "image": "frames_key/s01.png",
      "usage": "layout_structure_only"
    },
    "character_reference": {
      "bible": "character_bible.json",
      "usage": "face_body_outfit_consistency"
    }
  },

  "prompt_layers": {
    "layer1_role": "高忠実度なスライド再現。元のレイアウト構造を厳密に維持しつつ、日本語テキストに置換。",

    "layer2_reference": "参照画像Aはレイアウト構造のみ参照（人物・テキストは再生成）。キャラクターはcharacter_bibleに従う。",

    "layer3_text_constraint": {
      "title": "「Bロール」コンセプト",
      "body": "次に、これらの10枚の画像をより強力な画像に変換できます...",
      "constraint": "OCR読み戻しで一致を検証。数字・固有名詞は厳密一致必須。"
    },

    "layer4_blueprint": {
      "subject": "プロフェッショナルなスライドプレゼンテーション",
      "composition": "2カラムレイアウト、左に人物写真、右にテキスト",
      "action": "プレゼンターが説明している静止画",
      "location": "クリーンなスライド背景",
      "style": "企業研修教材、高解像度、鮮明"
    }
  },

  "negative_constraints": [
    "blur", "low-res", "jpeg artifacts",
    "warped anatomy", "stretched limbs", "wide-angle distortion",
    "melted text", "incorrect numbers", "extra elements",
    "inconsistent character", "different outfit"
  ],

  "render_spec": {
    "target_resolution": {"width": 1920, "height": 1080},
    "aspect_ratio": "16:9",
    "typography": {
      "contrast": "high",
      "readability": "priority",
      "kerning": "normal",
      "line_height": 1.5
    },
    "seed": 12345
  },

  "output_expectation": {
    "quality": "写真のようにくっきり鮮明",
    "character": "character_bibleと同一の顔・体型・衣装",
    "text": "OCR読み戻しで100%一致"
  }
}
```

---

## ■ Step 7: 品質検証ループ（QC）

```python
def quality_check(generated_image, job_json, analysis_json):
    results = {"passed": True, "issues": []}

    # 1. OCR読み戻し検証
    ocr_text = extract_text_ocr(generated_image)
    expected_texts = job_json["prompt_layers"]["layer3_text_constraint"]
    for key, expected in expected_texts.items():
        if key == "constraint":
            continue
        if expected not in ocr_text:
            results["passed"] = False
            results["issues"].append(f"テキスト不一致: {key}")

    # 2. レイアウト一致度
    detected_regions = detect_regions(generated_image)
    expected_regions = analysis_json["layout"]["regions"]
    layout_match = compute_layout_iou(detected_regions, expected_regions)
    if layout_match < 0.8:
        results["passed"] = False
        results["issues"].append(f"レイアウト一致度低: {layout_match:.2f}")

    # 3. 人物比率チェック（キャラクター一貫性）
    if analysis_json.get("person_present"):
        person_bbox = detect_person(generated_image)
        head_body_ratio = compute_head_body_ratio(person_bbox)
        expected_ratio = 7.5  # character_bibleから
        if abs(head_body_ratio - expected_ratio) > 1.0:
            results["passed"] = False
            results["issues"].append(f"頭身比率異常: {head_body_ratio:.1f}")

    # 4. 鮮明度チェック
    sharpness = compute_laplacian_variance(generated_image)
    if sharpness < 100:  # 閾値
        results["passed"] = False
        results["issues"].append(f"ぼやけ検出: sharpness={sharpness:.1f}")

    return results

# NGなら自動修正して再生成
def regenerate_with_fixes(job_json, issues):
    for issue in issues:
        if "テキスト不一致" in issue:
            job_json["negative_constraints"].append("melted text")
            job_json["prompt_layers"]["layer3_text_constraint"]["constraint"] += " 文字を大きく、コントラスト高く。"
        if "レイアウト一致度低" in issue:
            job_json["prompt_layers"]["layer2_reference"] += " レイアウト構造を厳密に維持。"
        if "頭身比率異常" in issue:
            job_json["negative_constraints"].extend(["stretched limbs", "wide-angle distortion"])
        if "ぼやけ検出" in issue:
            job_json["negative_constraints"].extend(["blur", "low-res"])
            job_json["render_spec"]["target_resolution"] = {"width": 2048, "height": 1152}

    return job_json
```

---

## ■ Step 8: 最終成果物

```
output_dir/
├── raw_video/source.mp4
├── frames_key/
│   ├── s01.png
│   ├── s02.png
│   └── ...
├── analysis_json/
│   ├── s01.json
│   ├── s02.json
│   └── ...
├── character_bible.json
├── nanobanana_jobs/
│   ├── s01.job.json
│   ├── s02.job.json
│   └── ...
├── final_sections.json
├── run_manifest.json
└── reports/
    ├── quality_report.md
    ├── story_outline.json
    └── japanese_narration_script.md
```

---

## ■ 実行コマンド

```bash
# 完全実行
python3 scripts/advanced_video_analysis/pipeline.py \
  --input "https://youtube.com/..." \
  --project "training_video_27" \
  --output "./out/training_video_27"

# セクション検出のみ
python3 scripts/advanced_video_analysis/pipeline.py \
  --input "video.mp4" \
  --mode section_detection_only

# 品質検証のみ（生成後）
python3 scripts/advanced_video_analysis/quality_checker.py \
  --generated "./generated_slides/" \
  --jobs "./nanobanana_jobs/"
```

---

## ■ Quick Mode / Advanced Mode / Parallel Advanced Mode の使い分け

| シナリオ | 推奨モード | スキル |
|----------|-----------|--------|
| 短い動画（5分以下）、急ぎの案件 | Quick Mode | スライド.md |
| 長い動画（15分以上）、高品質要求 | **Advanced Mode** | このファイル |
| キャラクター一貫性が重要 | **Advanced Mode** | このファイル |
| 繰り返し生成・微調整が必要 | **Advanced Mode** | このファイル |
| 初回テスト・プロトタイプ | Quick Mode | スライド.md |
| 企業納品・本番用 | **Advanced Mode** | このファイル |
| **高品質+高速（40-60%短縮）** | **Parallel Advanced** | **slide2.md** |
| **大量動画処理** | **Parallel Advanced** | **slide2.md** |

---

## ■ 関連スキル

| スキル | ファイル | 関係 |
|--------|----------|------|
| Quick Mode | `スライド.md` | 簡易版（5分以下向け） |
| **Parallel Advanced** | **`slide2.md`** | **このスキル+並列処理（40-60%短縮）** |
| Orchestrator | `videojson_orchestrator/SKILL.md` | フロー誘導 |
| TTS Generator | `tts_video_generator/SKILL.md` | 音声生成詳細 |
| Narration | `narration_generator/SKILL.md` | 台本生成 |
| Render | `render_generator/SKILL.md` | レンダリング設定 |

---

**スキルバージョン: v1.0**
**作成日: 2026-01-05**
**依存: PySceneDetect, imagehash, ffmpeg, yt-dlp**
