#!/usr/bin/env python3
"""
共有スライド生成ユーティリティ
全プロジェクトで使用する画像処理・検証関数

使用方法:
    import sys
    sys.path.insert(0, '/Users/matsumototoshihiko/Desktop/テスト開発/videoJSON2/shared')
    from slide_utils import load_image_fit, load_image_contain, verify_all_images
"""

import json
from pathlib import Path
from PIL import Image, ImageOps


def load_image_fit(path, size):
    """
    アスペクト比を維持しながら指定サイズにフィット（中央クロップ）

    Args:
        path: 画像ファイルのパス
        size: (width, height) のタプル

    Returns:
        PIL.Image: リサイズされた画像

    使用例:
        img = load_image_fit("portrait.png", (400, 500))
    """
    if path and Path(path).exists():
        img = Image.open(path).convert("RGB")
        return ImageOps.fit(img, size, Image.LANCZOS, centering=(0.5, 0.5))
    return Image.new("RGB", size, (51, 51, 51))


def load_image_contain(path, size, bg_color=(26, 26, 46)):
    """
    アスペクト比を維持しながらサイズ内に収める（クロップなし、余白あり）

    Args:
        path: 画像ファイルのパス
        size: (width, height) のタプル
        bg_color: 余白の背景色 (R, G, B)

    Returns:
        PIL.Image: リサイズされた画像（背景付き）

    使用例:
        img = load_image_contain("landscape.png", (800, 600), bg_color=(0, 0, 0))
    """
    if path and Path(path).exists():
        img = Image.open(path).convert("RGB")
        img.thumbnail(size, Image.LANCZOS)
        bg = Image.new("RGB", size, bg_color)
        x = (size[0] - img.width) // 2
        y = (size[1] - img.height) // 2
        bg.paste(img, (x, y))
        return bg
    return Image.new("RGB", size, (51, 51, 51))


def load_image_safe(path, size=None, method='fit'):
    """
    安全な画像読み込み（アスペクト比維持）

    Args:
        path: 画像ファイルのパス
        size: (width, height) のタプル（Noneの場合はオリジナルサイズ）
        method: 'fit'（中央クロップ）または 'contain'（余白あり）

    Returns:
        PIL.Image: 読み込まれた画像

    注意:
        この関数は resize() を使用しません。
        常にアスペクト比を維持します。
    """
    if path and Path(path).exists():
        img = Image.open(path).convert("RGB")
        if size:
            if method == 'fit':
                return ImageOps.fit(img, size, Image.LANCZOS, centering=(0.5, 0.5))
            else:
                img.thumbnail(size, Image.LANCZOS)
                bg = Image.new("RGB", size, (51, 51, 51))
                x = (size[0] - img.width) // 2
                y = (size[1] - img.height) // 2
                bg.paste(img, (x, y))
                return bg
        return img
    else:
        if size:
            return Image.new("RGB", size, (51, 51, 51))
        return Image.new("RGB", (400, 300), (51, 51, 51))


def verify_all_images(sections_file, images_dir, raise_on_error=True):
    """
    全画像パスの存在確認（スライド生成前に必須実行）

    Args:
        sections_file: sections_data.jsonのパス
        images_dir: 画像ディレクトリのパス
        raise_on_error: Trueの場合、欠落があれば例外を発生

    Returns:
        tuple: (found_count, missing_list)

    使用例:
        found, missing = verify_all_images(
            "work/sections_data.json",
            "images/",
            raise_on_error=True
        )
    """
    with open(sections_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    images_dir = Path(images_dir)
    missing = []
    found = []

    for section in data.get('sections', []):
        section_id = section.get('id', 'unknown')

        # 単一画像
        for key in ['existing_image', 'image', 'background_image']:
            img = section.get(key)
            if img:
                img_path = images_dir / img
                if img_path.exists():
                    found.append(f"{section_id}: {img}")
                else:
                    missing.append(f"{section_id}: {img}")

        # 複数画像
        for key in ['existing_images', 'images', 'gallery_images']:
            images = section.get(key, [])
            if isinstance(images, str):
                images = [images]
            for img in images:
                img_path = images_dir / img
                if img_path.exists():
                    found.append(f"{section_id}: {img}")
                else:
                    missing.append(f"{section_id}: {img}")

    print(f"\n{'='*60}")
    print(f"画像パス検証結果")
    print(f"{'='*60}")
    print(f"  ✓ 発見: {len(found)} 件")
    print(f"  ✗ 欠落: {len(missing)} 件")

    if missing:
        print(f"\n【エラー】以下の画像が見つかりません:")
        for m in missing:
            print(f"  ✗ {m}")
        print(f"\n{'='*60}")
        print("【対処】欠落画像を生成してから再度実行してください")
        if raise_on_error:
            raise Exception("画像パス検証に失敗しました")
    else:
        print(f"\n【OK】全画像パスの検証に成功しました")

    return len(found), missing


def hex_to_rgb(hex_color):
    """16進数カラーコードをRGBタプルに変換"""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


# =============================================================================
# 使用例
# =============================================================================
if __name__ == "__main__":
    print("slide_utils.py - 共有スライド生成ユーティリティ")
    print("")
    print("使用方法:")
    print("  import sys")
    print("  sys.path.insert(0, '/Users/matsumototoshihiko/Desktop/テスト開発/videoJSON2/shared')")
    print("  from slide_utils import load_image_fit, verify_all_images")
    print("")
    print("利用可能な関数:")
    print("  - load_image_fit(path, size): アスペクト比維持で中央クロップ")
    print("  - load_image_contain(path, size): アスペクト比維持で余白あり")
    print("  - load_image_safe(path, size, method): 汎用画像読み込み")
    print("  - verify_all_images(sections_file, images_dir): 画像パス検証")
    print("  - hex_to_rgb(hex_color): カラーコード変換")
