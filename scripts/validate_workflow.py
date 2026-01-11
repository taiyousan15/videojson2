#!/usr/bin/env python3
"""
Workflow Validation Script

プロジェクトディレクトリに全8フェーズのスクリプトが存在するかを検証する。
Phase 5とPhase 7のスキップを防止するための強制チェック。

使用方法:
    python3 scripts/validate_workflow.py projects/youtube_XCUWrrmaNck

終了コード:
    0 = 全フェーズ実装済み（完全版）
    1 = 欠落フェーズあり（不完全）
"""

import sys
from pathlib import Path
from typing import List, Tuple

# 必須フェーズ定義
REQUIRED_PHASES = {
    "phase0": ["phase0_download.py", "download.py"],
    "phase1": ["phase1_detect.py", "phase1_filter.py", "detect_sections.py"],
    "phase2-1": ["phase2_1_transcribe.py", "phase2_transcribe.py", "transcribe.py"],
    "phase2-2": ["phase2_2_translate.py", "phase2_2_translate_batch.py", "translate.py"],
    "phase2-5": ["phase2_5_compression.py", "phase2_5_compression_v2.py"],
    "phase3": ["phase3_structure_analysis.py", "phase3_analyze.py", "structure_analysis.py"],
    "phase4": ["phase4_generate_images.py", "phase4_images.py", "generate_images.py"],
    "phase5": ["phase5_quality_check.py", "phase5_verify.py", "phase5_quality_verification.py", "quality_verification.py"],
    "phase6": ["phase6_generate_audio.py", "phase6_audio.py", "generate_audio.py"],
    "phase7": ["phase7_telop.py", "phase7_subtitles.py", "phase7_generate_telop.py", "generate_telop.py"],
    "phase8": ["phase8_compose_video.py", "phase8_compose.py", "compose_video.py"]
}

# 絶対にスキップ禁止のフェーズ
CRITICAL_PHASES = ["phase5", "phase7"]


def check_project_phases(project_dir: Path) -> Tuple[List[str], List[str]]:
    """プロジェクトディレクトリ内のフェーズスクリプトをチェック"""

    found_phases = []
    missing_phases = []

    print(f"\n{'='*70}")
    print(f"Workflow Validation: {project_dir.name}")
    print(f"{'='*70}\n")

    for phase_id, possible_filenames in REQUIRED_PHASES.items():
        phase_found = False

        for filename in possible_filenames:
            script_path = project_dir / filename
            if script_path.exists():
                found_phases.append(phase_id)
                status = "✓" if phase_id not in CRITICAL_PHASES else "✓✓"
                print(f"{status} {phase_id:12} : {filename}")
                phase_found = True
                break

        if not phase_found:
            missing_phases.append(phase_id)
            status = "❌" if phase_id in CRITICAL_PHASES else "⚠️"
            critical = " (CRITICAL - MUST NOT SKIP)" if phase_id in CRITICAL_PHASES else ""
            print(f"{status} {phase_id:12} : MISSING{critical}")

    return found_phases, missing_phases


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 validate_workflow.py <project_directory>")
        print("Example: python3 validate_workflow.py projects/youtube_XCUWrrmaNck")
        sys.exit(1)

    project_dir = Path(sys.argv[1])

    if not project_dir.exists() or not project_dir.is_dir():
        print(f"Error: {project_dir} does not exist or is not a directory")
        sys.exit(1)

    found, missing = check_project_phases(project_dir)

    print(f"\n{'='*70}")
    print(f"VALIDATION RESULT")
    print(f"{'='*70}")
    print(f"Found phases    : {len(found)}/{len(REQUIRED_PHASES)}")
    print(f"Missing phases  : {len(missing)}")

    if missing:
        print(f"\nMISSING PHASES:")
        for phase in missing:
            critical = " ⚠️ CRITICAL" if phase in CRITICAL_PHASES else ""
            print(f"  - {phase}{critical}")

    # Critical phases check
    critical_missing = [p for p in missing if p in CRITICAL_PHASES]

    if critical_missing:
        print(f"\n{'⛔'*35}")
        print(f"CRITICAL ERROR: The following phases MUST NOT be skipped:")
        for phase in critical_missing:
            print(f"  - {phase}")
        print(f"\nPhase 5 (Quality Verification): Prevents broken images from being used")
        print(f"Phase 7 (Telop/Subtitles): Ensures accessibility and readability")
        print(f"\nPlease implement these phases before proceeding.")
        print(f"{'⛔'*35}\n")
        sys.exit(1)

    if missing:
        print(f"\n⚠️  WARNING: Some phases are missing, but workflow may still proceed.")
        print(f"Consider implementing all phases for complete functionality.\n")
        sys.exit(0)

    print(f"\n✅ SUCCESS: All phases are implemented (Complete Workflow)\n")
    sys.exit(0)


if __name__ == "__main__":
    main()
