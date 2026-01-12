#!/usr/bin/env python3
"""
Phase 4: NanoBanana画像生成

NanaBanana (Google Gemini) で高品質な背景画像を生成。
- テキストなしの背景画像のみ生成
- サイズ: 1920x1080
- テキスト配置はPhase 7のRemotionで行う

🚫 PIL使用禁止 - NanoBanana + Remotion必須
"""

import json
import subprocess
import time
from pathlib import Path


def generate_nanobanana_image(section, output_path: Path, gemini_skill_dir: Path):
    """
    NanaBanana (Gemini Image Generator) で背景画像を生成

    Args:
        section: セクション情報（narrationを含む）
        output_path: 出力パス
        gemini_skill_dir: gemini-image-generator スキルのディレクトリ

    Returns:
        Path: 生成された画像のパス
    """

    # ナレーションから画像プロンプトを生成
    narration = section.get('narration', '')

    # プロンプト構築（背景のみ、テキストなし）
    prompt = f"""
A modern, professional background image for a presentation slide in 1920x1080 resolution.
Theme: {narration[:100]}
Style: Clean, minimal, tech-focused, professional presentation background
Colors: Blue tones (#0066FF, #00D9FF), modern gradients
Layout: Landscape 1920x1080 (16:9 aspect ratio), suitable as background
Important: NO text, NO words, NO numbers on the image
Focus on visual background only, abstract modern design
"""

    print(f"  Prompt: {prompt[:80]}...")

    # gemini-image-generator スキルを実行
    cmd = [
        'python3',
        str(gemini_skill_dir / 'scripts' / 'image_generator.py'),
        '--prompt', prompt,
        '--output', str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"    ⚠️  NanaBanana error: {result.stderr[:200]}")

        # レート制限の場合は待機
        if 'quota' in result.stderr.lower() or 'rate' in result.stderr.lower():
            print(f"    ⏳ レート制限検出、60秒待機...")
            time.sleep(60)

            # リトライ
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"    ❌ リトライ失敗")
                return None
        else:
            return None

    if not output_path.exists():
        print(f"    ❌ 画像ファイルが生成されませんでした")
        return None

    return output_path


def main():
    print("=== Phase 4: NanoBanana画像生成 ===\n")

    # 構造解析結果を読み込み
    with open("work/structure_analysis.json", "r") as f:
        sections = json.load(f)

    # gemini-image-generator スキルディレクトリ
    gemini_skill_dir = Path.home() / ".claude" / "skills" / "gemini-image-generator"

    if not gemini_skill_dir.exists():
        print(f"❌ Error: gemini-image-generator スキルが見つかりません")
        print(f"   予想パス: {gemini_skill_dir}")
        print(f"\ngemini-image-generator スキルをインストールしてください")
        return

    # 出力ディレクトリ作成
    images_dir = Path("work/final_images")
    images_dir.mkdir(exist_ok=True, parents=True)

    # 各セクションの画像を生成
    print(f"NanaBanana画像生成: {len(sections)}個\n")
    print("🚫 PIL使用禁止 - NanaBanana + Remotion必須")
    print("背景画像のみ生成（テキストはPhase 7 Remotionで配置）\n")

    generated_count = 0
    failed_count = 0

    for i, section in enumerate(sections):
        scene_number = section['scene_number']
        output_path = images_dir / f"scene_{scene_number}.png"

        print(f"[{i+1}/{len(sections)}] Scene {scene_number}: ", end="", flush=True)

        result = generate_nanobanana_image(section, output_path, gemini_skill_dir)

        if result:
            file_size = output_path.stat().st_size
            print(f"✓ {output_path.name} ({file_size} bytes)")
            generated_count += 1
        else:
            print(f"❌ Failed")
            failed_count += 1

        # レート制限対策: 各画像生成後に5秒待機
        if i < len(sections) - 1:
            time.sleep(5)

    print(f"\n{'='*60}")
    print(f"生成結果")
    print(f"{'='*60}")
    print(f"成功: {generated_count}/{len(sections)}")
    print(f"失敗: {failed_count}/{len(sections)}")
    print(f"\n✓ 保存先: work/final_images/")

    if failed_count > 0:
        print(f"\n⚠️  {failed_count}個の画像生成に失敗しました")
        print(f"レート制限の可能性があります。時間をおいて再実行してください。")
    else:
        print(f"\n次のステップ: Phase 5で品質検証を実行します")


if __name__ == "__main__":
    main()
