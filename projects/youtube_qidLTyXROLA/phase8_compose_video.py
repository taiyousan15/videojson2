#!/usr/bin/env python3
"""
Phase 8: FFmpegで動画を合成
18セクションの画像+音声を結合して最終動画を生成
"""
import json
import subprocess
from pathlib import Path

def get_audio_duration(audio_path):
    """音声ファイルの長さを取得"""
    cmd = [
        'ffprobe', '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        str(audio_path)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return float(result.stdout.strip())

def create_segment(scene_number, image_path, audio_path, output_path):
    """セグメント動画を作成"""
    # 音声の長さを取得
    duration = get_audio_duration(audio_path)

    cmd = [
        'ffmpeg', '-y',
        '-loop', '1', '-i', str(image_path),  # ループ画像
        '-i', str(audio_path),                 # 音声
        '-c:v', 'libx264',
        '-tune', 'stillimage',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-pix_fmt', 'yuv420p',
        '-t', str(duration),                   # 音声の長さに合わせる
        '-shortest',
        str(output_path)
    ]

    print(f"  Scene {scene_number}: {duration:.1f}秒... ", end="", flush=True)
    subprocess.run(cmd, capture_output=True)
    print(f"✓")

    return output_path

def concat_segments(segment_paths, output_path):
    """セグメントを結合"""
    # concat listファイル作成
    concat_file = Path("work/concat_list.txt")
    with open(concat_file, 'w') as f:
        for path in segment_paths:
            f.write(f"file '{path.absolute()}'\\n")

    cmd = [
        'ffmpeg', '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', str(concat_file),
        '-c', 'copy',
        str(output_path)
    ]

    print(f"\\n=== セグメント結合 ===")
    subprocess.run(cmd, capture_output=True)
    print(f"✓ {output_path}")

    return output_path

def add_subtitles(video_path, srt_path, output_path):
    """動画に字幕を焼き込む"""
    # 絶対パスに変換
    srt_abs = srt_path.absolute()

    # macOS/Unix用のパスエスケープ
    # : と ' をエスケープ
    srt_str = str(srt_abs).replace('\\', '\\\\').replace(':', '\\:').replace("'", "\\'")

    cmd = [
        'ffmpeg', '-y',
        '-i', str(video_path),
        '-vf', f"subtitles={srt_str}",
        '-c:a', 'copy',
        str(output_path)
    ]

    print(f"\n=== 字幕統合 ===")
    print(f"SRTファイル: {srt_path}")
    print(f"実行コマンド: {' '.join(cmd)}")

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"❌ エラー: 字幕統合に失敗しました")
        print(f"stderr: {result.stderr[:500]}")
        return None

    print(f"✓ 字幕付き動画: {output_path}")
    return output_path

def main():
    print("=== Phase 8: FFmpeg動画合成（字幕統合版） ===\n")

    # 構造解析結果を読み込み
    with open("work/structure_analysis.json", "r") as f:
        sections = json.load(f)

    # ディレクトリ
    images_dir = Path("work/final_images")
    audio_dir = Path("work/final_audio")
    segments_dir = Path("work/final_segments")
    segments_dir.mkdir(exist_ok=True, parents=True)

    # 各セグメント動画を作成
    print(f"=== セグメント動画作成 ({len(sections)}個) ===")
    segment_paths = []

    for section in sections:
        scene_number = section['scene_number']
        image_path = images_dir / f"scene_{scene_number}.png"
        audio_path = audio_dir / f"scene_{scene_number}.mp3"
        segment_path = segments_dir / f"scene_{scene_number}.mp4"

        if not image_path.exists():
            print(f"  Scene {scene_number}: 画像が見つかりません, スキップ")
            continue

        if not audio_path.exists():
            print(f"  Scene {scene_number}: 音声が見つかりません, スキップ")
            continue

        segment = create_segment(scene_number, image_path, audio_path, segment_path)
        segment_paths.append(segment)

    # 全セグメントを結合（字幕なし）
    temp_output = Path("final_video_no_subs.mp4")
    concat_segments(segment_paths, temp_output)

    # 字幕を統合
    srt_path = Path("work/subtitles/subtitles.srt")
    final_output = Path("final_video.mp4")

    subtitle_integrated = False

    if srt_path.exists():
        result = add_subtitles(temp_output, srt_path, final_output)
        if result is not None:
            subtitle_integrated = True
            # 一時ファイルを削除（存在する場合のみ）
            if temp_output.exists():
                temp_output.unlink()
        else:
            print(f"\n⚠️  字幕統合に失敗しました")
            print(f"字幕なし動画として出力します")
            if temp_output.exists():
                temp_output.rename(final_output)
    else:
        print(f"\n⚠️  字幕ファイルが見つかりません: {srt_path}")
        print(f"字幕なし動画として出力します")
        if temp_output.exists():
            temp_output.rename(final_output)

    # 動画情報表示
    if final_output.exists():
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
        print(f"字幕: {'✓ 統合済み' if subtitle_integrated else '❌ なし'}")
    else:
        print(f"\n❌ エラー: 最終動画の生成に失敗しました")

if __name__ == "__main__":
    main()
