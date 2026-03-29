#!/usr/bin/env python3
"""
セクション検証スクリプト v1.0

元動画の画面切り替えとセクションデータの完全性を検証する。
企業研修動画において、セクションの欠落は重大なエラーとなるため、
このスクリプトで100%のカバー率を保証する。

使用方法:
  python3 validate_sections.py --sections sections_data.json --video input.mp4
  python3 validate_sections.py --sections sections_data.json --duration 756
"""

import argparse
import json
import subprocess
import re
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class ValidationResult:
    """検証結果を格納するデータクラス"""
    valid: bool
    section_count: int
    total_duration: float
    coverage_seconds: float
    coverage_percent: float
    errors: List[str]
    warnings: List[str]
    gaps: List[Dict]
    overlaps: List[Dict]


def parse_timestamp(timestamp_str: str) -> Tuple[float, float]:
    """
    タイムスタンプ文字列をパースして開始・終了秒数を返す

    対応フォーマット:
      - "00:00-00:20"
      - "01:30-02:45"
      - "00:00:00-00:00:20" (時間含む)
    """
    parts = timestamp_str.split("-")
    if len(parts) != 2:
        raise ValueError(f"Invalid timestamp format: {timestamp_str}")

    def to_seconds(time_str: str) -> float:
        time_str = time_str.strip()
        parts = time_str.split(":")
        if len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
        elif len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
        else:
            raise ValueError(f"Invalid time format: {time_str}")

    return to_seconds(parts[0]), to_seconds(parts[1])


def get_video_duration(video_path: str) -> float:
    """ffprobeで動画の長さを取得"""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return float(result.stdout.strip())


def validate_sections(
    sections_data: Dict,
    video_duration: float,
    tolerance: float = 1.0
) -> ValidationResult:
    """
    セクションの完全性を検証

    Args:
        sections_data: sections_data.jsonの内容
        video_duration: 動画の総時間（秒）
        tolerance: 許容誤差（秒）

    Returns:
        ValidationResult: 検証結果
    """
    errors = []
    warnings = []
    gaps = []
    overlaps = []

    sections = sections_data.get("sections", [])
    section_count = len(sections)

    # 1. セクション数チェック
    if section_count == 0:
        errors.append("CRITICAL: セクション数が0です")
        return ValidationResult(
            valid=False,
            section_count=0,
            total_duration=video_duration,
            coverage_seconds=0,
            coverage_percent=0,
            errors=errors,
            warnings=warnings,
            gaps=[],
            overlaps=[]
        )

    # 2. タイムスタンプ解析とソート
    parsed_sections = []
    for i, section in enumerate(sections):
        try:
            timestamp = section.get("timestamp", "")
            if not timestamp:
                errors.append(f"ERROR: セクション {section.get('id', i+1)} にタイムスタンプがありません")
                continue

            start, end = parse_timestamp(timestamp)
            parsed_sections.append({
                "id": section.get("id", f"s{i+1:02d}"),
                "title": section.get("title", ""),
                "start": start,
                "end": end,
                "duration": end - start,
                "index": i
            })
        except ValueError as e:
            errors.append(f"ERROR: セクション {section.get('id', i+1)} のタイムスタンプが不正: {e}")

    # 開始時間でソート
    parsed_sections.sort(key=lambda x: x["start"])

    # 3. 開始時間チェック（0:00から始まるか）
    if parsed_sections and parsed_sections[0]["start"] > tolerance:
        gap_duration = parsed_sections[0]["start"]
        errors.append(f"ERROR: 動画の開始 (0:00) からセクション1の開始 ({parsed_sections[0]['start']:.1f}秒) までに {gap_duration:.1f}秒のギャップがあります")
        gaps.append({
            "start": 0,
            "end": parsed_sections[0]["start"],
            "duration": gap_duration,
            "location": "動画開始部分"
        })

    # 4. 連続性チェック（ギャップと重複の検出）
    for i in range(len(parsed_sections) - 1):
        current = parsed_sections[i]
        next_sec = parsed_sections[i + 1]

        gap = next_sec["start"] - current["end"]

        if gap > tolerance:
            # ギャップ検出
            errors.append(
                f"ERROR: セクション {current['id']} ({current['end']:.1f}秒) と "
                f"セクション {next_sec['id']} ({next_sec['start']:.1f}秒) の間に "
                f"{gap:.1f}秒のギャップがあります"
            )
            gaps.append({
                "start": current["end"],
                "end": next_sec["start"],
                "duration": gap,
                "after_section": current["id"],
                "before_section": next_sec["id"]
            })
        elif gap < -tolerance:
            # 重複検出
            overlap_duration = abs(gap)
            warnings.append(
                f"WARNING: セクション {current['id']} と {next_sec['id']} が "
                f"{overlap_duration:.1f}秒重複しています"
            )
            overlaps.append({
                "sections": [current["id"], next_sec["id"]],
                "overlap_duration": overlap_duration
            })

    # 5. 終了時間チェック（動画の終わりまでカバーしているか）
    if parsed_sections:
        last_end = parsed_sections[-1]["end"]
        if last_end < video_duration - tolerance:
            gap_duration = video_duration - last_end
            errors.append(
                f"ERROR: 最後のセクション ({last_end:.1f}秒) から動画の終わり "
                f"({video_duration:.1f}秒) までに {gap_duration:.1f}秒のギャップがあります"
            )
            gaps.append({
                "start": last_end,
                "end": video_duration,
                "duration": gap_duration,
                "location": "動画終了部分"
            })

    # 6. カバー率計算
    total_covered = sum(s["duration"] for s in parsed_sections)
    coverage_percent = (total_covered / video_duration) * 100 if video_duration > 0 else 0

    if coverage_percent < 95:
        errors.append(f"CRITICAL: カバー率が {coverage_percent:.1f}% です（95%未満）。セクションが欠落している可能性があります")
    elif coverage_percent < 100 - (tolerance / video_duration * 100):
        warnings.append(f"WARNING: カバー率が {coverage_percent:.1f}% です")

    # 7. 異常に長いセクションのチェック
    avg_duration = total_covered / section_count if section_count > 0 else 0
    for s in parsed_sections:
        if s["duration"] > avg_duration * 3 and s["duration"] > 120:  # 平均の3倍以上かつ2分以上
            warnings.append(
                f"WARNING: セクション {s['id']} が異常に長い ({s['duration']:.1f}秒)。"
                f"分割が必要な可能性があります"
            )

    # 8. 結果判定
    is_valid = len(errors) == 0

    return ValidationResult(
        valid=is_valid,
        section_count=section_count,
        total_duration=video_duration,
        coverage_seconds=total_covered,
        coverage_percent=coverage_percent,
        errors=errors,
        warnings=warnings,
        gaps=gaps,
        overlaps=overlaps
    )


def generate_report(result: ValidationResult, sections_data: Dict) -> str:
    """検証結果のレポートを生成"""
    sections = sections_data.get("sections", [])

    lines = [
        "=" * 60,
        "セクション検証レポート",
        "=" * 60,
        "",
        f"動画総時間:     {result.total_duration:.1f}秒 ({result.total_duration/60:.1f}分)",
        f"セクション数:   {result.section_count}",
        f"カバー時間:     {result.coverage_seconds:.1f}秒 ({result.coverage_seconds/60:.1f}分)",
        f"カバー率:       {result.coverage_percent:.1f}%",
        "",
    ]

    # ステータス
    if result.valid:
        lines.append("検証結果: PASS ✓")
    else:
        lines.append("検証結果: FAIL ✗")

    lines.append("")

    # エラー
    if result.errors:
        lines.append("-" * 60)
        lines.append("【エラー】")
        for error in result.errors:
            lines.append(f"  {error}")
        lines.append("")

    # 警告
    if result.warnings:
        lines.append("-" * 60)
        lines.append("【警告】")
        for warning in result.warnings:
            lines.append(f"  {warning}")
        lines.append("")

    # ギャップ詳細
    if result.gaps:
        lines.append("-" * 60)
        lines.append("【検出されたギャップ】")
        for gap in result.gaps:
            lines.append(f"  {gap['start']:.1f}秒 - {gap['end']:.1f}秒 ({gap['duration']:.1f}秒)")
            if "after_section" in gap:
                lines.append(f"    → セクション {gap['after_section']} と {gap['before_section']} の間")
            elif "location" in gap:
                lines.append(f"    → {gap['location']}")
        lines.append("")

    # セクション一覧
    lines.append("-" * 60)
    lines.append("【セクション一覧】")
    for section in sections:
        sid = section.get("id", "?")
        title = section.get("title", "")[:30]
        timestamp = section.get("timestamp", "?")
        try:
            start, end = parse_timestamp(timestamp)
            duration = end - start
            lines.append(f"  {sid}: {timestamp} ({duration:.1f}s) {title}")
        except:
            lines.append(f"  {sid}: {timestamp} {title}")

    lines.append("")
    lines.append("=" * 60)

    return "\n".join(lines)


def extract_frames_for_review(
    video_path: str,
    gaps: List[Dict],
    output_dir: Path,
    margin: float = 5.0
) -> List[str]:
    """
    ギャップがある時間帯のフレームを抽出（手動確認用）

    Args:
        video_path: 動画ファイルパス
        gaps: 検出されたギャップのリスト
        output_dir: 出力ディレクトリ
        margin: 前後のマージン（秒）

    Returns:
        抽出されたフレームのパスリスト
    """
    output_dir.mkdir(exist_ok=True)
    extracted = []

    for i, gap in enumerate(gaps):
        start = max(0, gap["start"] - margin)
        end = gap["end"] + margin

        # 該当時間帯のフレームを抽出
        output_pattern = output_dir / f"gap_{i+1:02d}_frame_%03d.png"
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start),
            "-i", video_path,
            "-t", str(end - start),
            "-vf", "fps=1",
            str(output_pattern)
        ]
        subprocess.run(cmd, capture_output=True)

        # 抽出されたファイルをリストに追加
        extracted.extend(sorted(output_dir.glob(f"gap_{i+1:02d}_frame_*.png")))

    return [str(f) for f in extracted]


def main():
    parser = argparse.ArgumentParser(
        description="セクションデータの完全性を検証",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用例:
  # 動画ファイルから長さを自動取得
  python3 validate_sections.py --sections sections_data.json --video input.mp4

  # 動画の長さを直接指定
  python3 validate_sections.py --sections sections_data.json --duration 756

  # ギャップがある場合、該当フレームを抽出
  python3 validate_sections.py --sections sections_data.json --video input.mp4 --extract-gaps
        """
    )
    parser.add_argument("--sections", required=True, help="sections_data.jsonのパス")
    parser.add_argument("--video", help="元動画のパス（長さ自動取得用）")
    parser.add_argument("--duration", type=float, help="動画の長さ（秒）を直接指定")
    parser.add_argument("--tolerance", type=float, default=1.0, help="許容誤差（秒）デフォルト: 1.0")
    parser.add_argument("--extract-gaps", action="store_true", help="ギャップのある時間帯のフレームを抽出")
    parser.add_argument("--output-dir", default="./gap_frames", help="フレーム出力ディレクトリ")
    parser.add_argument("--json", action="store_true", help="結果をJSON形式で出力")

    args = parser.parse_args()

    # セクションデータ読み込み
    with open(args.sections, "r", encoding="utf-8") as f:
        sections_data = json.load(f)

    # 動画の長さを取得
    if args.duration:
        video_duration = args.duration
    elif args.video:
        video_duration = get_video_duration(args.video)
    else:
        print("ERROR: --video または --duration のいずれかを指定してください")
        return 1

    # 検証実行
    result = validate_sections(sections_data, video_duration, args.tolerance)

    # 結果出力
    if args.json:
        output = {
            "valid": result.valid,
            "section_count": result.section_count,
            "total_duration": result.total_duration,
            "coverage_seconds": result.coverage_seconds,
            "coverage_percent": result.coverage_percent,
            "errors": result.errors,
            "warnings": result.warnings,
            "gaps": result.gaps,
            "overlaps": result.overlaps
        }
        print(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        report = generate_report(result, sections_data)
        print(report)

    # ギャップフレーム抽出
    if args.extract_gaps and result.gaps and args.video:
        print("\nギャップ部分のフレームを抽出中...")
        output_dir = Path(args.output_dir)
        extracted = extract_frames_for_review(args.video, result.gaps, output_dir)
        print(f"抽出完了: {len(extracted)} フレーム → {output_dir}")

    # 終了コード
    return 0 if result.valid else 1


if __name__ == "__main__":
    exit(main())
