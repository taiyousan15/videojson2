#!/usr/bin/env python3
"""
Phase 7: Remotion テロップ生成

Remotionを使って高品質なテロップ付きセグメント動画を生成。
- 方法1: Remotion (lecture スタイル)
- フェードアニメーション
- 半透明黒背景
- 日本語フォント対応

MASTER_VIDEO_GENERATION_WORKFLOW.md Phase 7 方法1準拠
"""

import json
import subprocess
from pathlib import Path


# 読み→表示変換マップ
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


def convert_reading_to_display(narration_text: str) -> str:
    """TTS読み形式 → 字幕表示形式"""
    display_text = narration_text
    for reading, display in READING_TO_DISPLAY_MAP.items():
        display_text = display_text.replace(reading, display)
    return display_text


def get_audio_duration(audio_path: Path) -> float:
    """音声ファイルの長さを取得（秒）"""
    cmd = [
        'ffprobe', '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        str(audio_path)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return float(result.stdout.strip())


def generate_remotion_segment(section, image_path: Path, audio_path: Path,
                              output_path: Path, remotion_dir: Path):
    """Remotionでテロップ付きセグメント動画を生成"""

    # 音声の長さを取得
    duration_sec = get_audio_duration(audio_path)
    duration_frames = int(duration_sec * 30)  # 30fps

    # ナレーションを字幕表示形式に変換
    narration = section.get('narration', '')
    display_text = convert_reading_to_display(narration)

    # Remotion用のVideoSegmentデータを作成
    segment_data = {
        "segments": [
            {
                "id": f"scene_{section['scene_number']}",
                "startFrame": 0,
                "durationInFrames": duration_frames,
                "backgroundImage": str(image_path.absolute()),
                "audioSrc": str(audio_path.absolute()),
                "telop": {
                    "text": display_text,
                    "style": "lecture",
                    "position": "bottom",
                    "animation": "fade"
                }
            }
        ]
    }

    # JSON文字列にエスケープ（シングルクォート対策）
    props_json = json.dumps(segment_data).replace("'", "\\'")

    # Remotionでレンダリング
    cmd = [
        'npx', 'remotion', 'render',
        'TelopVideo',
        str(output_path),
        '--props', props_json,
        '--overwrite'
    ]

    print(f"  Scene {section['scene_number']}: {duration_sec:.1f}秒... ", end="", flush=True)

    result = subprocess.run(
        cmd,
        cwd=remotion_dir,
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        print(f"❌ Error")
        print(f"stderr: {result.stderr[:500]}")
        return None

    print(f"✓")
    return output_path


def main():
    print("=== Phase 7: Remotion テロップ生成 ===\n")

    # 構造解析結果を読み込み
    with open("work/structure_analysis.json", "r") as f:
        sections = json.load(f)

    # ディレクトリ設定
    project_dir = Path(__file__).parent
    remotion_dir = project_dir.parent.parent / "remotion-telop"
    images_dir = project_dir / "work" / "final_images"
    audio_dir = project_dir / "work" / "final_audio"
    output_dir = project_dir / "work" / "remotion_segments"
    output_dir.mkdir(exist_ok=True, parents=True)

    # Remotionプロジェクトの存在確認
    if not remotion_dir.exists():
        print(f"❌ Error: Remotionプロジェクトが見つかりません: {remotion_dir}")
        print(f"以下のディレクトリに remotion-telop プロジェクトが必要です")
        return

    # 各セグメントのテロップ動画を生成
    print(f"=== Remotionセグメント動画生成 ({len(sections)}個) ===\n")

    generated_count = 0

    for section in sections:
        scene_number = section['scene_number']
        image_path = images_dir / f"scene_{scene_number}.png"
        audio_path = audio_dir / f"scene_{scene_number}.mp3"
        output_path = output_dir / f"scene_{scene_number}.mp4"

        if not image_path.exists():
            print(f"  Scene {scene_number}: 画像なし, スキップ")
            continue

        if not audio_path.exists():
            print(f"  Scene {scene_number}: 音声なし, スキップ")
            continue

        result = generate_remotion_segment(
            section, image_path, audio_path, output_path, remotion_dir
        )

        if result:
            generated_count += 1

    print(f"\n✓ 完了: {generated_count}個のテロップ付きセグメント動画を生成しました")
    print(f"✓ 保存先: work/remotion_segments/")
    print(f"\n次のステップ: Phase 8でセグメント動画を結合します")


if __name__ == "__main__":
    main()
