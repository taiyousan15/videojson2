#!/usr/bin/env python3
"""
Complete Workflow Executor (Phase 0-8 強制実行)

全8フェーズを順番に実行し、フェーズのスキップを防止する。
Phase 5とPhase 7を含む完全版ワークフロー。

使用方法:
    python3 run_complete_workflow.py --start-from phase3

オプション:
    --start-from PHASE  : 指定したフェーズから開始
    --stop-at PHASE     : 指定したフェーズで停止
    --skip-validation   : 検証をスキップ（非推奨）
"""

import argparse
import subprocess
import sys
from pathlib import Path

# フェーズ定義（順序保証）
PHASES = [
    {"id": "phase0", "script": None, "name": "動画ダウンロード（既存）"},
    {"id": "phase1", "script": "phase1_filter.py", "name": "セクション検出"},
    {"id": "phase2-1", "script": None, "name": "Whisper文字起こし（既存）"},
    {"id": "phase2-2", "script": "phase2_2_translate_batch.py", "name": "日本語翻訳"},
    {"id": "phase2-5", "script": "phase2_5_compression_v2.py", "name": "圧縮率計算"},
    {"id": "phase3", "script": "phase3_structure_analysis.py", "name": "構造解析"},
    {"id": "phase3-5", "script": None, "name": "メタプロンプト選択（既存）"},
    {"id": "phase4", "script": "phase4_generate_images.py", "name": "画像生成"},
    {"id": "phase5", "script": "phase5_quality_verification.py", "name": "品質検証 ⚠️ 必須"},
    {"id": "phase6", "script": "phase6_generate_audio.py", "name": "音声生成"},
    {"id": "phase7", "script": "phase7_generate_telop.py", "name": "テロップ生成 ⚠️ 必須"},
    {"id": "phase8", "script": "phase8_compose_video.py", "name": "動画合成"}
]

# 絶対スキップ禁止フェーズ
CRITICAL_PHASES = ["phase5", "phase7"]


def run_phase(phase: dict, project_dir: Path) -> bool:
    """フェーズを実行"""

    if phase["script"] is None:
        print(f"⏭️  {phase['id']}: {phase['name']} (手動実行済み)")
        return True

    script_path = project_dir / phase["script"]

    if not script_path.exists():
        print(f"❌ Error: {phase['script']} が見つかりません")
        if phase["id"] in CRITICAL_PHASES:
            print(f"   ⚠️  CRITICAL: {phase['id']} はスキップ禁止です！")
            return False
        return False

    print(f"\n{'='*70}")
    print(f"実行中: {phase['id']} - {phase['name']}")
    print(f"スクリプト: {phase['script']}")
    print(f"{'='*70}\n")

    try:
        result = subprocess.run(
            [sys.executable, str(script_path)],
            cwd=project_dir,
            check=False
        )

        if result.returncode != 0:
            print(f"\n❌ {phase['id']} が失敗しました (exit code: {result.returncode})")
            if phase["id"] in CRITICAL_PHASES:
                print(f"   ⚠️  CRITICAL PHASE FAILED - ワークフローを中止します")
                return False
            return False

        print(f"\n✓ {phase['id']} 完了")
        return True

    except Exception as e:
        print(f"\n❌ エラー: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Complete Workflow Executor")
    parser.add_argument("--start-from", help="Start from this phase")
    parser.add_argument("--stop-at", help="Stop at this phase")
    parser.add_argument("--skip-validation", action="store_true", help="Skip validation (NOT RECOMMENDED)")

    args = parser.parse_args()

    project_dir = Path(__file__).parent

    print(f"\n{'🎬'*35}")
    print(f"Complete Workflow Executor")
    print(f"Project: {project_dir.name}")
    print(f"{'🎬'*35}\n")

    # バリデーション実行
    if not args.skip_validation:
        print("Step 1: ワークフロー検証...\n")
        validation_script = project_dir.parent.parent / "scripts" / "validate_workflow.py"

        if validation_script.exists():
            result = subprocess.run(
                [sys.executable, str(validation_script), str(project_dir)],
                check=False
            )

            if result.returncode != 0:
                print(f"\n⚠️  検証に失敗しました。")
                print(f"欠落しているフェーズスクリプトを作成してください。")
                print(f"\n--skip-validation オプションで検証をスキップできますが、非推奨です。")
                sys.exit(1)
        else:
            print(f"⚠️  検証スクリプトが見つかりません: {validation_script}")

    # フェーズ実行範囲を決定
    start_index = 0
    stop_index = len(PHASES)

    if args.start_from:
        for i, phase in enumerate(PHASES):
            if phase["id"] == args.start_from:
                start_index = i
                break

    if args.stop_at:
        for i, phase in enumerate(PHASES):
            if phase["id"] == args.stop_at:
                stop_index = i + 1
                break

    phases_to_run = PHASES[start_index:stop_index]

    # Critical phases チェック
    critical_in_range = [p for p in phases_to_run if p["id"] in CRITICAL_PHASES]
    if critical_in_range:
        print(f"\n⚠️  以下の必須フェーズが実行範囲に含まれています:")
        for phase in critical_in_range:
            print(f"   - {phase['id']}: {phase['name']}")
        print(f"これらのフェーズはスキップできません。\n")

    # 実行確認
    print(f"\n実行予定フェーズ: {len(phases_to_run)}個")
    for phase in phases_to_run:
        critical = " ⚠️ CRITICAL" if phase["id"] in CRITICAL_PHASES else ""
        print(f"  - {phase['id']}: {phase['name']}{critical}")

    print(f"\n開始しますか？ [y/N]: ", end="", flush=True)
    response = input().strip().lower()

    if response != 'y':
        print("キャンセルしました。")
        sys.exit(0)

    # フェーズ実行
    print(f"\n{'🚀'*35}")
    print(f"ワークフロー実行開始")
    print(f"{'🚀'*35}\n")

    failed_phases = []

    for phase in phases_to_run:
        success = run_phase(phase, project_dir)

        if not success:
            failed_phases.append(phase["id"])

            if phase["id"] in CRITICAL_PHASES:
                print(f"\n{'⛔'*35}")
                print(f"CRITICAL PHASE FAILED: {phase['id']}")
                print(f"ワークフローを中止します。")
                print(f"{'⛔'*35}\n")
                sys.exit(1)

    # 結果サマリー
    print(f"\n{'='*70}")
    print(f"ワークフロー完了")
    print(f"{'='*70}")
    print(f"実行: {len(phases_to_run)}個")
    print(f"成功: {len(phases_to_run) - len(failed_phases)}個")
    print(f"失敗: {len(failed_phases)}個")

    if failed_phases:
        print(f"\n失敗したフェーズ:")
        for phase_id in failed_phases:
            print(f"  - {phase_id}")

    if not failed_phases:
        print(f"\n✅ 全フェーズが正常に完了しました！")
        print(f"\n最終動画: final_video.mp4")


if __name__ == "__main__":
    main()
