# NanaBananaメタプロンプト統合仕様

## ユーザー要求の解釈

### 要求内容

1. **NanaBananaメタプロンプト集の使用**
   - URL: https://furoku.github.io/bananaX/projects/infographic-evaluation/index.html
   - 301個のメタプロンプトテンプレートが利用可能
   - 各プロンプトにはスタイル、配色、タイポグラフィなどの詳細設定が含まれる

2. **セクションごとの画像生成**
   - Phase 1で検出された各セクション（画面切り替わりごと）に対して
   - 元動画の代表フレームを分析
   - 最適なメタプロンプトを選択
   - メタプロンプトを使って画像生成

3. **イメージ調整**
   - 生成された画像が元動画のイメージに合うように調整
   - 必要に応じてメタプロンプトをカスタマイズ

---

## 解釈の具体化

### 1. メタプロンプト集の構造

**取得したデータ構造**:
```json
{
  "id": "nano_73",
  "number": 73,
  "name": "Flat illustration / Corporate / Memphis",
  "scores": {
    "Legibility": 9,
    "Hierarchy": 9,
    "Consistency": 10,
    "Atmosphere": 9,
    "Theme Fit": 10
  },
  "total": 47,
  "yaml": "全体デザイン設定:\n  トーン: \"フレンドリー, プロフェッショナル...\"\n  ..."
}
```

**重要フィールド**:
- `name`: スタイル名（例: "Flat illustration / Corporate / Memphis"）
- `yaml`: 実際のメタプロンプト内容（トーン、配色、タイポグラフィなど）
- `total`: 品質スコア（0-50点、高いほど高品質）

### 2. スタイルカテゴリ分類

メタプロンプトは以下のカテゴリに分類されます：

| カテゴリ | 例 | 用途 |
|---------|---|------|
| **Corporate / Business** | Flat illustration / Corporate / Memphis | ビジネス動画、企業説明 |
| **Tech / Modern** | Material design / Modern, Blueprint / Technical | テック系動画、技術解説 |
| **Minimal / Clean** | Minimal / Monochrome / Line Art | シンプルな説明動画 |
| **Retro / Vintage** | Synthwave / Wireframe / Grid, 80s Arcade | レトロ風動画 |
| **Artistic / Creative** | Watercolor / Map / Fantasy, Collage / Surrealism | クリエイティブ動画 |
| **Geometric / Abstract** | Bauhaus / Primary Colors / Geometric | デザイン重視の動画 |
| **Japanese / Traditional** | Ukiyo-e / Flat illustration / Vector art | 和風動画 |

### 3. セクションごとの処理フロー

```
Phase 1: セクション検出
  ↓ 確定セクション（例: 12個）
  ↓
Phase 2: トランスクリプト取得・翻訳
  ↓
Phase 2.5: セクション選択（例: 3個選択）
  ↓
Phase 3: 構造分析（代表フレーム抽出+分析）★既存
  ↓
【NEW】Phase 3.5: メタプロンプト選択
  ├─ Step 3.5-1: 元動画フレームの視覚スタイル分析
  ├─ Step 3.5-2: メタプロンプト集から最適なものを選択
  └─ Step 3.5-3: メタプロンプトのカスタマイズ
  ↓
Phase 4: 画像生成（メタプロンプト使用）★更新
  ↓
Phase 5-8: 品質検証→TTS→テロップ→合成
```

---

## 実装仕様

### Phase 3.5: メタプロンプト選択（新規追加）

#### Step 3.5-1: 元動画フレームの視覚スタイル分析

**使用MCP**: `mcp__ollama__ollama_generate`
**使用モデル**: `llama3.1:70b`（ビジョン対応）

```python
def analyze_visual_style(frame_path):
    """元動画フレームの視覚スタイルを分析"""

    import base64

    with open(frame_path, 'rb') as f:
        image_base64 = base64.b64encode(f.read()).decode()

    prompt = """
    この画像の視覚スタイルを分析してください。

    以下の要素について詳しく説明してください：
    1. 全体的な雰囲気・トーン（例: モダン、レトロ、ミニマル、カラフル、シリアス）
    2. 配色（主要色、アクセントカラー、背景色）
    3. デザインスタイル（例: フラット、3D、イラスト、写真、グラフィック）
    4. タイポグラフィ（使用されているフォントスタイル）
    5. 構図・レイアウト（シンプル、複雑、グリッドベース、自由配置）
    6. テーマ（ビジネス、テクノロジー、教育、エンターテイメントなど）

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

    # JSON抽出
    content = response['response']
    json_start = content.find("{")
    json_end = content.rfind("}") + 1
    visual_style = json.loads(content[json_start:json_end])

    return visual_style
```

**出力例**:
```json
{
  "atmosphere": "モダンでプロフェッショナル、テクノロジー感",
  "color_scheme": {
    "primary": "#00F0FF",
    "accent": "#FF0080",
    "background": "#0A0A2E"
  },
  "design_style": "3D gradient, Holographic",
  "typography": "サンセリフ体、太め、モダン",
  "layout": "中央配置、ダイナミック",
  "theme": "AI / Technology / Futuristic",
  "keywords": ["futuristic", "holographic", "gradient", "neon", "tech"]
}
```

#### Step 3.5-2: メタプロンプト選択

**使用モデル**: なし（ルールベース + スコアマッチング）

```python
import json

# メタプロンプトデータ読み込み
with open('/tmp/nanabana_prompts.json', 'r') as f:
    metaprompts = json.load(f)

def select_best_metaprompt(visual_style, metaprompts):
    """
    元動画の視覚スタイルに基づいて最適なメタプロンプトを選択

    Args:
        visual_style: Phase 3.5-1で分析した視覚スタイル
        metaprompts: メタプロンプト集（301個）

    Returns:
        dict: 最適なメタプロンプト
    """

    # 1. キーワードマッチング
    keywords = visual_style['keywords']

    scored_prompts = []
    for mp in metaprompts:
        score = 0

        # 品質スコア（0-50点）を基準点として使用
        score += mp['total']

        # キーワードマッチング（各キーワード +5点）
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

    # 2. スコア順にソート
    scored_prompts = sorted(scored_prompts, key=lambda x: x['match_score'], reverse=True)

    # 3. トップ5を返す（ユーザーが選択可能）
    top_5 = scored_prompts[:5]

    print(f"\n【メタプロンプト選択結果】")
    print(f"元動画スタイル: {visual_style['atmosphere']}")
    print(f"キーワード: {', '.join(keywords)}")
    print(f"\nトップ5候補:")
    for i, item in enumerate(top_5, 1):
        mp = item['metaprompt']
        print(f"{i}. {mp['name']} (スコア: {item['match_score']})")

    # 自動選択: トップ1を返す
    best_match = top_5[0]['metaprompt']

    return {
        'selected': best_match,
        'alternatives': [item['metaprompt'] for item in top_5[1:]]
    }
```

**実行例**:
```
【メタプロンプト選択結果】
元動画スタイル: モダンでプロフェッショナル、テクノロジー感
キーワード: futuristic, holographic, gradient, neon, tech

トップ5候補:
1. Holographic / Gradient / Future (スコア: 75)
2. Neon / Tech / Dark (スコア: 70)
3. Synthwave / Wireframe / Grid (スコア: 65)
4. Cyberpunk / Neon / City (スコア: 62)
5. Gradient / Abstract / Modern (スコア: 58)

✅ 選択: Holographic / Gradient / Future
```

#### Step 3.5-3: メタプロンプトのカスタマイズ

**使用MCP**: `mcp__ollama__ollama_chat`
**使用モデル**: `llama3.1:70b`

```python
def customize_metaprompt(base_metaprompt, visual_style, section_title):
    """
    メタプロンプトを元動画のスタイルに合わせてカスタマイズ

    Args:
        base_metaprompt: 選択されたメタプロンプト
        visual_style: 元動画の視覚スタイル
        section_title: セクションタイトル

    Returns:
        str: カスタマイズされたプロンプト
    """

    prompt = f"""
    以下のメタプロンプトを、元動画のスタイルに合わせてカスタマイズしてください。

    【ベースメタプロンプト】
    {base_metaprompt['yaml']}

    【元動画のスタイル】
    - 雰囲気: {visual_style['atmosphere']}
    - 配色: 主要色 {visual_style['color_scheme']['primary']}, アクセント {visual_style['color_scheme']['accent']}, 背景 {visual_style['color_scheme']['background']}
    - デザインスタイル: {visual_style['design_style']}
    - テーマ: {visual_style['theme']}

    【このセクションのタイトル】
    {section_title}

    【カスタマイズ要件】
    1. ベースメタプロンプトのトーンとビジュアルアイデンティティを維持
    2. 元動画の配色を反映（primary, accent, backgroundを元動画の色に変更）
    3. セクションタイトルを自然に画像に含める指示を追加
    4. "NO text, NO words, NO numbers on the image" を必ず含める（固有名詞・数字は除く）

    【出力】
    カスタマイズされたメタプロンプト（YAML形式）
    """

    response = client.chat(
        model="llama3.1:70b",
        messages=[{"role": "user", "content": prompt}]
    )

    customized_prompt = response['message']['content'].strip()

    return customized_prompt
```

**出力例**:
```yaml
全体デザイン設定:
  トーン: "未来的, テクノロジー, ダイナミック, 革新的, プロフェッショナル。"
  ビジュアル・アイデンティティ:
    背景色: "#0A0A2E (Dark Blue)"
    文字色: "#FFFFFF (White)"
    アクセントカラー: "#00F0FF (Cyan)"、"#FF0080 (Magenta)"
    画像スタイル:
      特徴: "ホログラフィック、グラデーション、未来的な3D要素。"
      形状: "流動的なグラデーション, 光の反射。"
      質感: "メタリック、ガラス、透明感。"
      イメージャリ: "AI、テクノロジー、データフロー。"
      構成: "中央配置、ダイナミックな動き。"
  タイポグラフィ:
    見出し: "モダンなサンセリフ体 (太め)。"
    スタイル: "大きく目立つ配置。"

セクション固有設定:
  タイトル: "Gemini 2.0の革新的機能"
  テキスト配置: "中央上部に大きく配置、グラデーション効果。"

重要制約:
  - NO generic text, NO placeholder words on the image.
  - Only the section title is allowed as text.
  - Focus on visual background that supports the theme.
```

---

## Phase 4: 画像生成（更新）

### 更新内容

**変更前**:
```python
# 固定のプロンプト
prompt = f"{section['visual_style']}. Theme: {section['title']}. NO text."
```

**変更後**:
```python
# Phase 3.5で選択・カスタマイズされたメタプロンプトを使用
prompt = section['customized_metaprompt']
```

### 完全な実装

```python
def generate_section_images_with_metaprompt(selected_sections):
    """
    各セクションについて、メタプロンプトを使って画像を生成

    Args:
        selected_sections: Phase 2.5で選択されたセクション

    Returns:
        list: 生成された画像パスのリスト
    """

    generated_images = []

    for section in selected_sections:
        print(f"\n{'='*60}")
        print(f"セクション: {section['id']} - {section['title']}")
        print(f"{'='*60}")

        # Step 3.5-1: 元動画フレームの視覚スタイル分析
        frame_path = f"frames/{section['id']}_frame.png"
        visual_style = analyze_visual_style(frame_path)

        print(f"\n【視覚スタイル分析】")
        print(f"雰囲気: {visual_style['atmosphere']}")
        print(f"配色: {visual_style['color_scheme']}")
        print(f"デザインスタイル: {visual_style['design_style']}")

        # Step 3.5-2: メタプロンプト選択
        metaprompt_result = select_best_metaprompt(visual_style, metaprompts)
        selected_mp = metaprompt_result['selected']

        print(f"\n【選択されたメタプロンプト】")
        print(f"名前: {selected_mp['name']}")
        print(f"品質スコア: {selected_mp['total']}/50")

        # Step 3.5-3: メタプロンプトのカスタマイズ
        customized_prompt = customize_metaprompt(
            selected_mp,
            visual_style,
            section['title']
        )

        print(f"\n【カスタマイズされたメタプロンプト】")
        print(customized_prompt[:200] + "...")

        # セクションにメタプロンプトを保存
        section['metaprompt'] = {
            'base': selected_mp,
            'customized': customized_prompt,
            'visual_style': visual_style
        }

        # Step 4-1: NanoBanana背景画像生成（テキストなし）
        print(f"\n【画像生成開始】")
        bg_image_path = generate_background_with_metaprompt(
            section,
            customized_prompt
        )

        # ⚠️ PIL使用禁止
        # テキスト配置はPhase 7のRemotionで行う
        # NanoBananaは背景のみ生成

        composite_image_path = bg_image_path  # 背景画像をそのまま使用

        generated_images.append({
            'section_id': section['id'],
            'image_path': composite_image_path,
            'metaprompt_used': selected_mp['name']
        })

        print(f"✅ 完成: {composite_image_path}")

    return generated_images


def generate_background_with_metaprompt(section, customized_prompt):
    """メタプロンプトを使ってNanaBananaで背景生成"""

    # プロンプト整形（YAMLから自然言語へ）
    final_prompt = convert_yaml_to_natural_language(customized_prompt)

    # gemini-image-generatorスキル実行
    result = subprocess.run([
        'python3',
        '/Users/matsumototoshihiko/.claude/skills/gemini-image-generator/scripts/run.py',
        'image_generator.py',
        '--prompt', final_prompt,
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
                "prompt": final_prompt,
                "image_size": {"width": 1920, "height": 810}
            }
        )

        image_url = fal_result['images'][0]['url']
        download_image(image_url, f'images/{section["id"]}_bg.png')

    return f'images/{section["id"]}_bg.png'


def convert_yaml_to_natural_language(yaml_prompt):
    """YAMLメタプロンプトを自然言語プロンプトに変換"""

    # YAMLをパース
    import yaml

    try:
        config = yaml.safe_load(yaml_prompt)
    except:
        # YAMLパース失敗時はそのまま返す
        return yaml_prompt

    # 自然言語に変換
    prompt_parts = []

    # トーン
    if 'トーン' in config.get('全体デザイン設定', {}):
        tone = config['全体デザイン設定']['トーン']
        prompt_parts.append(f"Tone: {tone}.")

    # ビジュアルアイデンティティ
    vi = config.get('全体デザイン設定', {}).get('ビジュアル・アイデンティティ', {})

    if '背景色' in vi:
        bg = vi['背景色']
        prompt_parts.append(f"Background color: {bg}.")

    if 'アクセントカラー' in vi:
        accent = vi['アクセントカラー']
        prompt_parts.append(f"Accent colors: {accent}.")

    if '画像スタイル' in vi:
        style = vi['画像スタイル']
        if '特徴' in style:
            prompt_parts.append(f"Visual style: {style['特徴']}.")
        if '形状' in style:
            prompt_parts.append(f"Shapes: {style['形状']}.")
        if 'イメージャリ' in style:
            prompt_parts.append(f"Imagery: {style['イメージャリ']}.")

    # タイポグラフィ
    typo = config.get('全体デザイン設定', {}).get('タイポグラフィ', {})
    if '見出し' in typo:
        prompt_parts.append(f"Typography: {typo['見出し']}.")

    # セクション固有設定
    if 'セクション固有設定' in config:
        section_config = config['セクション固有設定']
        if 'タイトル' in section_config:
            prompt_parts.append(f"Title: \"{section_config['タイトル']}\".")

    # 重要制約
    prompt_parts.append("IMPORTANT: NO generic text, NO placeholder words on the image.")
    prompt_parts.append("Only the specified title is allowed as text.")
    prompt_parts.append("Focus on creating a visual background that supports the theme.")

    # 解像度
    prompt_parts.append("Resolution: 1920x810 pixels (landscape).")

    final_prompt = " ".join(prompt_parts)

    return final_prompt
```

---

## 実行フロー（完全版）

```
Phase 1: セクション検出
  ↓ 12セクション確定

Phase 2: トランスクリプト取得・翻訳
  ↓

Phase 2.5: セクション選択（3セクション選択）
  → s02, s03, s05
  ↓

Phase 3: 構造分析
  → frames/s02_frame.png, frames/s03_frame.png, frames/s05_frame.png を抽出
  ↓

【NEW】Phase 3.5: メタプロンプト選択

  For s02:
    → Step 3.5-1: s02_frame.png を分析
       結果: "Holographic / Futuristic / Tech"

    → Step 3.5-2: メタプロンプト集から選択
       選択: "Holographic / Gradient / Future" (スコア: 75)

    → Step 3.5-3: カスタマイズ
       配色を元動画に合わせて調整
       セクションタイトル "Gemini 2.0の革新的機能" を組み込み

  For s03: (同様の処理)
  For s05: (同様の処理)
  ↓

Phase 4: 画像生成（メタプロンプト使用）

  For s02:
    → NanoBanana生成（カスタマイズされたメタプロンプト使用）
    → PIL日本語テキスト配置
    → 75%+25%合成
    → 完成: composites/s02_composite.png

  For s03, s05: (同様の処理)
  ↓

Phase 5-8: 品質検証 → TTS → テロップ → 合成
```

---

## 利点

### 1. 高品質な画像生成

301個の専門家が評価したメタプロンプトを使用することで、一貫性のある高品質な画像を生成できます。

### 2. 元動画のスタイル維持

元動画のフレームを分析し、最も近いスタイルのメタプロンプトを選択することで、元動画の雰囲気を保持します。

### 3. 柔軟なカスタマイズ

ベースメタプロンプトを元動画の配色やテーマに合わせてカスタマイズできます。

### 4. スコアベースの選択

品質スコア（0-50点）とキーワードマッチングを組み合わせることで、最適なメタプロンプトを自動選択します。

---

## 処理時間への影響

| 処理 | 追加時間 |
|------|---------|
| Phase 3.5-1: 視覚スタイル分析 | +1分/セクション |
| Phase 3.5-2: メタプロンプト選択 | +30秒/セクション |
| Phase 3.5-3: カスタマイズ | +1分/セクション |
| **合計** | **+2.5分/セクション** |

**3セクションの場合**: +7.5分

**全体処理時間**:
- 変更前: 60-93分
- 変更後: **67-100分** (+7.5分)

---

## まとめ

### 変更点

1. **Phase 3.5を新規追加**: メタプロンプト選択プロセス
2. **Phase 4を更新**: メタプロンプトを使用した画像生成
3. **301個のメタプロンプト集を統合**: 高品質なテンプレート利用

### 効果

- 元動画のスタイルを維持した画像生成
- 一貫性のある高品質な画像
- 柔軟なカスタマイズ性

### 処理時間

- 3セクションで約7.5分の追加時間
- 全体で67-100分（1.1-1.7時間）
