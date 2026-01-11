#!/usr/bin/env python3
"""
Phase 8: Remotionセグメント動画の結合

Phase 7で生成されたテロップ付きセグメント動画を結合して最終動画を生成。

MASTER_VIDEO_GENERATION_WORKFLOW.md Phase 8準拠（Remotion版）
"""

import json
import subprocess
from pathlib import Path


def concat_segments(segment_paths: list, output_path: Path):
    """セグメント動画を結合"""
    # concat listファイル作成
    concat_file = Path("work/remotion_concat_list.txt")
    with open(concat_file, 'w') as f:
        for path in segment_paths:
            f.write(f"file '{path.absolute()}'\n")

    cmd = [
        'ffmpeg', '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', str(concat_file),
        '-c', 'copy',
        str(output_path)
    ]

    print(f"\n=== セグメント結合 ===")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"❌ エラー: 動画結合に失敗しました")
        print(f"stderr: {result.stderr[:500]}")
        return None

    print(f"✓ {output_path}")
    return output_path


def main():
    print("=== Phase 8: Remotionセグメント動画の結合 ===\n")

    # 構造解析結果を読み込み
    with open("work/structure_analysis.json", "r") as f:
        sections = json.load(f)

    # ディレクトリ設定
    segments_dir = Path("work/remotion_segments")

    if not segments_dir.exists():
        print(f"❌ Error: Remotionセグメントディレクトリが見つかりません: {segments_dir}")
        print(f"Phase 7を先に実行してください")
        return

    # セグメントパスを収集
    segment_paths = []
    for section in sections:
        scene_number = section['scene_number']
        segment_path = segments_dir / f"scene_{scene_number}.mp4"

        if segment_path.exists():
            segment_paths.append(segment_path)
        else:
            print(f"⚠️  Scene {scene_number}: セグメント動画が見つかりません")

    if not segment_paths:
        print(f"❌ Error: 結合するセグメント動画がありません")
        return

    print(f"結合対象: {len(segment_paths)}個のセグメント動画")

    # セグメント結合
    final_output = Path("final_video_remotion.mp4")
    result = concat_segments(segment_paths, final_output)

    if not result:
        return

    # 動画情報表示
    duration_cmd = [
        'ffprobe', '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        str(final_output)
    ]
    result = subprocess.run(duration_cmd, capture_output=True, text=True)
    total_duration = float(result.stdout.strip()) if result.stdout.strip() else 0

    print(f"\n=== 完成 ===")
    print(f"動画: {final_output}")
    print(f"長さ: {int(total_duration // 60)}分{int(total_duration % 60)}秒")
    print(f"セクション数: {len(segment_paths)}個")
    print(f"テロップ: ✓ Remotion lecture スタイル統合済み")


if __name__ == "__main__":
    main()
