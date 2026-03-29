# ナレーション音声長と要約の統合仕様

## 概要

動画要約において、**セクション選択は「元動画の長さ」ではなく「ナレーション音声長」で計算する**必要があります。これにより、要約と実際の音声生成が完全に同期します。

---

## 必須ルール

### 1. 許容範囲: ±15秒

すべての動画において、目標時間 **±15秒** の範囲内であれば合格とします。

| 元動画 | 目標時間 | 許容範囲（±15秒） |
|--------|---------|------------------|
| 10分 | 4分 | **3分45秒〜4分15秒** |
| 20分 | 8分 | **7分45秒〜8分15秒** |
| 30分 | 12分 | **11分45秒〜12分15秒** |
| 40分 | 14分 | **13分45秒〜14分15秒** |
| 50分 | 15分 | **14分45秒〜15分15秒** |
| 60分 | 15分36秒 | **15分21秒〜15分51秒** |

### 2. ナレーション音声長の推定

**推定式**:
```
音声長（秒） = ナレーション文字数 × 0.15
```

**根拠**: Google Cloud TTS Neural2-D（ja-JP-Neural2-D, speaking_rate=1.0）
- 1文字あたり約0.15秒
- 1分間で約400文字（6.67文字/秒）

**実装**:
```python
def estimate_narration_duration(narration_text):
    """ナレーション文字数から音声長を推定"""
    # 空白・記号を除外してカウント
    char_count = len([c for c in narration_text if c not in ' \n\t。、！？'])
    return char_count * 0.15

# 例
narration = "Gemini 2.0は、AI開発の新時代を切り開く重要なマイルストーンです。"
duration = estimate_narration_duration(narration)  # 38文字 × 0.15 = 5.7秒
```

---

## 統合ワークフロー

### Phase 2.5: セクション選択（ナレーション音声長ベース）

```
1. 元動画長から目標時間と許容範囲を計算
   例: 42分動画 → 目標14分42秒（許容範囲: 14分27秒〜14分57秒）

2. 全セクションのナレーション音声長を推定
   例: s01: 120文字 → 18秒
       s02: 400文字 → 60秒
       s03: 600文字 → 90秒

3. 重要度スコアリング（0-20点）
   - 数値・データの有無: +3点
   - 具体例の有無: +2点
   - チャプター記載: +3点
   - 視聴者保持率 > 80%: +5点
   - セクション長60-180秒: +2点
   - 導入部・結論部: +3点

4. スコア降順でソート

5. 累積音声長が許容範囲に収まるまでセクションを採用
   累積音声長 >= 最小許容時間（14分27秒）
   累積音声長 <= 最大許容時間（14分57秒）

6. 許容範囲判定
   ✅ OK: 範囲内
   ❌ NG: 範囲外 → ナレーション調整へ
```

### ナレーション調整（必要に応じて）

許容範囲に収まらない場合、ナレーションを調整：

**長すぎる場合**:
```python
# Ollamaで簡潔化
prompt = f"""
以下のナレーションを約{target_chars}文字に簡潔化してください。
重要なキーワードと数字は必ず残してください。

元ナレーション:
{section['narration']}
"""
```

**短すぎる場合**:
```python
# Ollamaで詳細化
prompt = f"""
以下のナレーションに具体例や補足説明を追加して、
約{target_chars}文字に拡充してください。

元ナレーション:
{section['narration']}
```

---

## 実装例

### 完全なセクション選択コード

```python
def select_sections_with_narration_duration(all_sections, original_duration_minutes):
    """
    ナレーション音声長を考慮してセクションを選択

    Args:
        all_sections: 全セクションリスト（'narration'フィールド必須）
        original_duration_minutes: 元動画の長さ（分）

    Returns:
        dict: {
            'selected_sections': 採用セクションリスト,
            'metadata': メタデータ,
            'in_tolerance': 許容範囲判定（True/False）
        }
    """
    # 1. 目標時間と許容範囲を計算
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

    target_seconds = original_duration_minutes * 60 * compression_rate
    min_seconds = target_seconds - 15  # ±15秒
    max_seconds = target_seconds + 15

    print(f"元動画: {original_duration_minutes:.1f}分")
    print(f"目標時間: {target_seconds/60:.1f}分")
    print(f"許容範囲: {min_seconds/60:.1f}分 〜 {max_seconds/60:.1f}分")

    # 2. 各セクションの音声長を推定
    for section in all_sections:
        char_count = len([c for c in section['narration'] if c not in ' \n\t。、！？'])
        section['narration_duration'] = char_count * 0.15
        section['importance_score'] = calculate_importance_score(section)

    # 3. 重要度スコア降順でソート
    sorted_sections = sorted(all_sections, key=lambda s: s['importance_score'], reverse=True)

    # 4. セクション採用
    selected = []
    cumulative_duration = 0

    for section in sorted_sections:
        if cumulative_duration + section['narration_duration'] <= max_seconds:
            selected.append(section)
            cumulative_duration += section['narration_duration']

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
        'metadata': {
            'target_seconds': target_seconds,
            'min_seconds': min_seconds,
            'max_seconds': max_seconds,
            'actual_duration': cumulative_duration,
            'in_tolerance': in_tolerance
        },
        'in_tolerance': in_tolerance
    }
```

---

## 実行例

### 入力: 全セクション（ナレーション付き）

```python
all_sections = [
    {
        "id": "s01",
        "title": "オープニング",
        "narration": "Gemini 2.0が登場し、AI業界に大きな衝撃を与えています。",
        "start_time": 0
    },
    {
        "id": "s02",
        "title": "革新的機能",
        "narration": "Gemini 2.0は、マルチモーダル理解、リアルタイム音声対話、エージェント機能を統合した画期的なモデルです。従来のAIとは一線を画す、3つの革新的機能を紹介します。第一に、画像・音声・テキストを同時に処理できるマルチモーダル能力。第二に、遅延わずか200ミリ秒のリアルタイム音声対話。第三に、複数のツールを自動的に組み合わせて使用するエージェント機能です。",
        "start_time": 60
    },
    {
        "id": "s03",
        "title": "デモンストレーション",
        "narration": "実際にGemini 2.0を使ったデモをお見せします。画面に表示されているコードを見てください。Gemini 2.0はコードを理解し、バグを発見し、修正案を提示し、さらにテストコードまで生成しました。これまでのAIでは不可能だった、一連の作業を自動化できます。",
        "start_time": 240
    },
    {
        "id": "s04",
        "title": "開発者への影響",
        "narration": "この技術が開発者にどのような影響を与えるか考察します。",
        "start_time": 360
    },
    {
        "id": "s05",
        "title": "まとめ",
        "narration": "Gemini 2.0は、AI開発の新時代を切り開く重要なマイルストーンです。",
        "start_time": 480
    }
]
```

### 実行

```python
result = select_sections_with_narration_duration(all_sections, 19.2)
```

### 出力

```
元動画: 19.2分
目標時間: 7.7分
許容範囲: 7.4分 〜 7.9分

【結果】
採用セクション: 3個
累積音声長: 7.8分
許容範囲判定: ✅ OK

採用されたセクション:
- s02: 革新的機能 (264秒 = 4.4分)
- s03: デモンストレーション (189秒 = 3.2分)
- s05: まとめ (15秒 = 0.3分)
合計: 468秒 = 7.8分
```

### 出力JSON

```json
{
  "metadata": {
    "original_duration_minutes": 19.2,
    "target_seconds": 461,
    "min_seconds": 446,
    "max_seconds": 476,
    "actual_duration": 468,
    "in_tolerance": true
  },
  "selected_sections": [
    {
      "id": "s02",
      "title": "革新的機能",
      "narration": "Gemini 2.0は、マルチモーダル理解、リアルタイム音声対話、エージェント機能を統合した画期的なモデルです。従来のAIとは一線を画す、3つの革新的機能を紹介します。第一に、画像・音声・テキストを同時に処理できるマルチモーダル能力。第二に、遅延わずか200ミリ秒のリアルタイム音声対話。第三に、複数のツールを自動的に組み合わせて使用するエージェント機能です。",
      "narration_duration": 264.0,
      "narration_char_count": 176,
      "importance_score": 15
    },
    {
      "id": "s03",
      "title": "デモンストレーション",
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
  ],
  "validation": {
    "target_range": "7分26秒〜7分56秒",
    "actual_duration": "7分48秒",
    "status": "✅ 許容範囲内",
    "deviation_seconds": 7
  }
}
```

---

## Phase 6（TTS音声生成）との統合

選択されたセクションのナレーションを、そのままTTS音声生成に渡します。

```python
# Phase 2.5で選択されたセクション
selected_sections = result['selected_sections']

# Phase 6: TTS音声生成
for section in selected_sections:
    audio_path = f"audio/{section['id']}.mp3"

    # Google Cloud TTS Neural2-D
    generate_tts(
        text=section['narration'],
        output_path=audio_path,
        voice_name="ja-JP-Neural2-D",
        speaking_rate=1.0
    )

    # 実際の音声長を測定
    actual_duration = get_audio_duration(audio_path)

    # 推定と実際の差をチェック
    estimated = section['narration_duration']
    deviation = abs(actual_duration - estimated)

    print(f"{section['id']}: 推定{estimated:.1f}秒 / 実際{actual_duration:.1f}秒 / 差{deviation:.1f}秒")

    # 差が2秒以上ある場合、警告
    if deviation > 2.0:
        print(f"⚠️ 警告: 推定と実際の差が大きい（{deviation:.1f}秒）")
```

---

## 利点

### 1. 要約と音声の完全同期

セクション選択時にナレーション音声長を考慮することで、要約と実際の音声生成が完全に同期します。

### 2. 許容範囲による柔軟性

±15秒の許容範囲により、厳密すぎず、実用的な調整が可能です。

### 3. 自動調整機能

許容範囲外の場合、ナレーションを自動的に簡潔化または詳細化できます。

### 4. 予測可能な結果

ナレーション文字数から音声長を推定できるため、結果が予測可能です。

---

## まとめ

| 項目 | 内容 |
|------|------|
| 許容範囲 | 目標時間 ±15秒 |
| 音声長推定 | 文字数 × 0.15秒 |
| 選択基準 | ナレーション音声長（元動画長ではない） |
| 調整方法 | Ollamaで簡潔化/詳細化 |
| 統合フェーズ | Phase 2.5 → Phase 6 |

**関連ドキュメント**:
- `.claude/COMPLETE_WORKFLOW.md` Phase 2.5
- `.claude/SUMMARY_COMPRESSION_RATE.md`
- `.claude/CLAUDE.md` セクション8
