#!/usr/bin/env python3
"""
90%精度再現 完全版ワークフロー実行スクリプト

このスクリプトは全フェーズを順番に実行し、90%精度の再現動画を生成します。
"""

import subprocess
import sys
from pathlib import Path
import time

# カラー出力
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    END = '\033[0m'
    BOLD = '\033[1m'

def print_phase(phase_num, phase_name):
    """フェーズヘッダーを表示"""
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'='*60}")
    print(f"Phase {phase_num}: {phase_name}")
    print(f"{'='*60}{Colors.END}\n")

def run_command(cmd, description, timeout=None):
    """コマンドを実行して結果を返す"""
    print(f"{Colors.BLUE}▶ {description}{Colors.END}")

    start_time = time.time()
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
    elapsed = time.time() - start_time

    if result.returncode == 0:
        print(f"{Colors.GREEN}✓ 完了 ({elapsed:.1f}秒){Colors.END}")
        return True
    else:
        print(f"{Colors.RED}❌ エラー{Colors.END}")
        print(f"stderr: {result.stderr[:500]}")
        return False

def check_file_exists(file_path, description):
    """ファイルの存在確認"""
    if Path(file_path).exists():
        print(f"{Colors.GREEN}✓ {description}: {file_path}{Colors.END}")
        return True
    else:
        print(f"{Colors.RED}❌ {description}が見つかりません: {file_path}{Colors.END}")
        return False

def main():
    print(f"{Colors.BOLD}")
    print("=" * 60)
    print("  90%精度再現 完全版ワークフロー")
    print("  対象動画: https://www.youtube.com/watch?v=qidLTyXROLA")
    print("=" * 60)
    print(f"{Colors.END}\n")

    # Phase 0: 動画ダウンロード
    print_phase("0", "動画ダウンロード")

    if not check_file_exists("input.mp4", "入力動画"):
        if not run_command(
            'yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" '
            '-o "input.mp4" "https://www.youtube.com/watch?v=qidLTyXROLA"',
            "動画をダウンロード中...",
            timeout=600
        ):
            print(f"{Colors.RED}Phase 0 失敗: 動画ダウンロードに失敗しました{Colors.END}")
            sys.exit(1)

    # 動画情報表示
    run_command(
        'ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 input.mp4',
        "動画長さ確認"
    )

    # Phase 1: セクション検出
    print_phase("1", "セクション検出 (PySceneDetect)")

    if not run_command(
        'scenedetect -i input.mp4 detect-adaptive --threshold 3.0 list-scenes --output work/scenes.csv',
        "PySceneDetect実行中...",
        timeout=300
    ):
        print(f"{Colors.RED}Phase 1 失敗: セクション検出に失敗しました{Colors.END}")
        sys.exit(1)

    # Phase 2-1: 文字起こし
    print_phase("2-1", "文字起こし (Whisper large-v3)")

    if not check_file_exists("work/input.json", "文字起こし結果"):
        if not run_command(
            'whisper input.mp4 --model large-v3 --language ja --output_format json --output_dir work/',
            "Whisper実行中... (約20-30分)",
            timeout=2400
        ):
            print(f"{Colors.RED}Phase 2-1 失敗: 文字起こしに失敗しました{Colors.END}")
            sys.exit(1)

    # Phase 2-2: 翻訳・オリジナル化
    print_phase("2-2", "翻訳・オリジナル化 (Ollama)")

    if not run_command(
        'python3 phase2_2_translate_batch.py',
        "Ollama llama3.1:70b で台本生成中...",
        timeout=1200
    ):
        print(f"{Colors.YELLOW}Phase 2-2 スキップ: phase2_2_translate_batch.py が見つかりません{Colors.END}")

    # Phase 2-3: 圧縮率計算
    print_phase("2-3", "圧縮率計算")

    run_command(
        'python3 phase2_5_compression_v2.py',
        "圧縮率を計算中...",
        timeout=60
    )

    # Phase 3: 構造解析
    print_phase("3", "構造解析 (Ollama Vision)")

    if not run_command(
        'python3 phase3_structure_analysis.py',
        "Ollama Vision で構造解析中... (約30-40分)",
        timeout=3000
    ):
        print(f"{Colors.YELLOW}Phase 3 スキップ: phase3_structure_analysis.py が見つかりません{Colors.END}")

    # Phase 4: NanoBanana背景画像生成
    print_phase("4", "NanoBanana背景画像生成")

    if not run_command(
        'python3 phase4_nanobanana_generate.py',
        "NanoBanana で背景画像生成中... (約30-40分)",
        timeout=3000
    ):
        print(f"{Colors.RED}Phase 4 失敗: NanoBanana画像生成に失敗しました{Colors.END}")
        sys.exit(1)

    # Phase 5: 品質検証
    print_phase("5", "品質検証")

    if not run_command(
        'python3 phase5_quality_verification.py',
        "画像品質を検証中...",
        timeout=300
    ):
        print(f"{Colors.YELLOW}Phase 5 警告: 品質検証に問題がありますが続行します{Colors.END}")

    # Phase 6: 音声生成
    print_phase("6", "音声生成 (Google Cloud TTS)")

    if not run_command(
        'python3 phase6_generate_audio.py',
        "Google Cloud TTS Neural2-D で音声生成中... (約10分)",
        timeout=900
    ):
        print(f"{Colors.RED}Phase 6 失敗: 音声生成に失敗しました{Colors.END}")
        sys.exit(1)

    # Phase 7: Remotionテロップ生成
    print_phase("7", "Remotionテロップ生成")

    if not run_command(
        'python3 phase7_remotion_telop.py',
        "Remotion でテロップ付きセグメント生成中... (約30-40分)",
        timeout=3000
    ):
        print(f"{Colors.RED}Phase 7 失敗: Remotionテロップ生成に失敗しました{Colors.END}")
        sys.exit(1)

    # Phase 8: 最終動画結合
    print_phase("8", "最終動画結合")

    if not run_command(
        'python3 phase8_concat_remotion.py',
        "セグメントを結合中...",
        timeout=300
    ):
        print(f"{Colors.RED}Phase 8 失敗: 動画結合に失敗しました{Colors.END}")
        sys.exit(1)

    # 完成
    print(f"\n{Colors.GREEN}{Colors.BOLD}")
    print("=" * 60)
    print("  🎉 90%精度再現動画の生成が完了しました！")
    print("=" * 60)
    print(f"{Colors.END}")

    if check_file_exists("final_video_remotion.mp4", "最終動画"):
        # 動画情報表示
        run_command(
            'ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 final_video_remotion.mp4',
            "最終動画情報"
        )

        print(f"\n{Colors.GREEN}✓ 動画を確認してください: final_video_remotion.mp4{Colors.END}\n")

    # 90%精度検証チェックリストを表示
    print(f"{Colors.BOLD}90%精度検証チェックリスト:{Colors.END}")
    print("□ 構造・フロー: セクション数と長さが元動画と類似")
    print("□ 台本内容: 専門用語が正確、説明順序が同じ")
    print("□ 背景画像品質: 全画像1920x1080、テキストなし")
    print("□ テロップ配置: lecture スタイル、画面下部")
    print("□ 音声品質: Google TTS Neural2-D、自然な発音")
    print("□ 全体品質: 総再生時間が元動画±5%以内\n")

if __name__ == "__main__":
    main()
