#!/usr/bin/env python3
"""
Phase 4: PIL画像生成（NanoBanana代替）
18セクションの高品質スライド画像を生成
"""
import json
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

# 画像サイズ
WIDTH, HEIGHT = 1920, 1080
IMG_HEIGHT = 810  # 75% - 画像エリア
SUB_HEIGHT = 270  # 25% - 字幕バー

# カラーパレット（Phase 3.5のメタプロンプトから）
COLORS = {
    0: ('#0066FF', '#FFFFFF'),   # Meta Blue
    1: ('#00D9FF', '#FFFFFF'),   # Cyan
    2: ('#FF3366', '#FFFFFF'),   # Pink
    3: ('#7B61FF', '#FFFFFF'),   # Purple
}

def create_slide_image(section_id, scene_number, narration_text, output_dir, color_index):
    """スライド画像を生成"""
    # 背景色取得（ローテーション）
    bg_color, text_color = COLORS[color_index % len(COLORS)]

    # キャンバス作成
    img = Image.new('RGB', (WIDTH, HEIGHT), bg_color)
    draw = ImageDraw.Draw(img)

    # 字幕バー（下部25%）
    draw.rectangle([(0, IMG_HEIGHT), (WIDTH, HEIGHT)], fill='#1A2A4A')

    # フォント設定
    try:
        font_title = ImageFont.truetype("/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc", 56)
    except:
        try:
            font_title = ImageFont.truetype("/System/Library/Fonts/Hiragino Sans GB W6.otf", 56)
        except:
            font_title = ImageFont.load_default()

    # タイトルテキスト（ナレーションの最初の50文字）
    title_text = narration_text[:50] + "..." if len(narration_text) > 50 else narration_text

    # タイトル描画（中央配置、複数行対応）
    max_width = WIDTH - 200  # 左右マージン100px
    lines = []
    current_line = ""

    for char in title_text:
        test_line = current_line + char
        bbox = draw.textbbox((0, 0), test_line, font=font_title)
        if bbox[2] - bbox[0] > max_width and current_line:
            lines.append(current_line)
            current_line = char
        else:
            current_line = test_line

    if current_line:
        lines.append(current_line)

    # 複数行の総高さを計算
    total_height = 0
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font_title)
        total_height += (bbox[3] - bbox[1]) + 20  # 行間20px

    # 開始Y座標（中央配置）
    y = (IMG_HEIGHT - total_height) / 2

    # 各行を描画
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font_title)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]

        x = (WIDTH - text_width) / 2

        # 影付きテキスト
        for offset_x, offset_y in [(-3, -3), (-3, 3), (3, -3), (3, 3)]:
            draw.text((x + offset_x, y + offset_y), line, fill='#000000', font=font_title)

        draw.text((x, y), line, fill=text_color, font=font_title)

        y += text_height + 20

    # 保存
    output_path = output_dir / f"scene_{scene_number}.png"
    img.save(output_path)

    return output_path

def main():
    print("=== Phase 4: PIL画像生成 ===\n")

    # 構造解析結果を読み込み
    with open("work/structure_analysis.json", "r") as f:
        sections = json.load(f)

    # 出力ディレクトリ作成
    images_dir = Path("work/final_images")
    images_dir.mkdir(exist_ok=True, parents=True)

    # 各セクションの画像を生成
    print(f"Generating {len(sections)} slide images...\n")

    for i, section in enumerate(sections):
        print(f"[{i+1}/{len(sections)}] Scene {section['scene_number']}: ", end="", flush=True)

        output_path = create_slide_image(
            f"s{i+1:02d}",
            section['scene_number'],
            section.get('narration', ''),
            images_dir,
            i
        )

        print(f"✓ {output_path.name}")

    print(f"\n✓ 完了: {len(sections)}個の画像ファイルを生成しました")
    print(f"✓ 保存先: work/final_images/")

if __name__ == "__main__":
    main()
