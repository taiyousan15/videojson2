#!/usr/bin/env python3
"""
Quality Checker for Advanced Video Analysis

NanoBanana生成後の品質検証ループを実行。
OCR読み戻し、レイアウト一致度、キャラクター一貫性、鮮明度をチェック。

使用方法:
    python3 quality_checker.py --generated "./generated_slides/" --jobs "./nanobanana_jobs/"
    python3 quality_checker.py --image "s01.png" --job "s01.job.json" --single
"""

import argparse
import json
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any

try:
    from PIL import Image, ImageOps
    import numpy as np
except ImportError:
    print("依存パッケージをインストールしてください: pip install Pillow numpy")
    sys.exit(1)

# OCR用（オプション）
try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False

# 画像類似度用（オプション）
try:
    from skimage.metrics import structural_similarity as ssim
    SKIMAGE_AVAILABLE = True
except ImportError:
    SKIMAGE_AVAILABLE = False


@dataclass
class QualityIssue:
    """品質問題"""
    severity: str  # "critical", "warning", "info"
    category: str  # "text", "layout", "character", "sharpness"
    message: str
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class QualityResult:
    """品質検証結果"""
    section_id: str
    passed: bool
    score: float
    issues: List[QualityIssue]
    recommendations: List[str]


class QualityChecker:
    """品質検証クラス"""

    # 閾値設定
    SHARPNESS_THRESHOLD = 100.0
    LAYOUT_IOU_THRESHOLD = 0.8
    HEAD_RATIO_TOLERANCE = 1.0
    TEXT_MATCH_THRESHOLD = 0.9

    def __init__(self, generated_dir: str, jobs_dir: str, analysis_dir: str = None):
        self.generated_dir = Path(generated_dir)
        self.jobs_dir = Path(jobs_dir)
        self.analysis_dir = Path(analysis_dir) if analysis_dir else None
        self.results: List[QualityResult] = []

    def check_all(self) -> List[QualityResult]:
        """全セクションをチェック"""
        print(f"\n{'='*60}")
        print("品質検証開始")
        print(f"{'='*60}\n")

        # ジョブファイルを取得
        job_files = sorted(self.jobs_dir.glob("*.job.json"))

        for job_file in job_files:
            section_id = job_file.stem.replace(".job", "")
            generated_image = self.generated_dir / f"{section_id}.png"

            if not generated_image.exists():
                # JPGも試す
                generated_image = self.generated_dir / f"{section_id}.jpg"

            if not generated_image.exists():
                print(f"  {section_id}: 生成画像が見つかりません")
                continue

            result = self.check_single(str(generated_image), str(job_file))
            self.results.append(result)

            status = "PASS" if result.passed else "FAIL"
            print(f"  {section_id}: {status} (score={result.score:.2f})")

            if not result.passed:
                for issue in result.issues:
                    if issue.severity == "critical":
                        print(f"    - [CRITICAL] {issue.message}")

        return self.results

    def check_single(self, image_path: str, job_path: str) -> QualityResult:
        """単一セクションをチェック"""
        image_path = Path(image_path)
        job_path = Path(job_path)

        # ジョブ読み込み
        with open(job_path, "r", encoding="utf-8") as f:
            job = json.load(f)

        section_id = job.get("section_id", image_path.stem)
        issues = []
        recommendations = []
        scores = []

        # 画像読み込み
        try:
            image = Image.open(image_path)
            image_array = np.array(image)
        except Exception as e:
            issues.append(QualityIssue(
                severity="critical",
                category="file",
                message=f"画像読み込みエラー: {e}"
            ))
            return QualityResult(
                section_id=section_id,
                passed=False,
                score=0.0,
                issues=issues,
                recommendations=["画像ファイルを確認してください"]
            )

        # 1. 鮮明度チェック
        sharpness_result = self._check_sharpness(image_array)
        issues.extend(sharpness_result["issues"])
        scores.append(sharpness_result["score"])
        recommendations.extend(sharpness_result.get("recommendations", []))

        # 2. テキスト検証（OCR）
        if TESSERACT_AVAILABLE:
            text_result = self._check_text(image, job)
            issues.extend(text_result["issues"])
            scores.append(text_result["score"])
            recommendations.extend(text_result.get("recommendations", []))

        # 3. 解像度チェック
        resolution_result = self._check_resolution(image, job)
        issues.extend(resolution_result["issues"])
        scores.append(resolution_result["score"])
        recommendations.extend(resolution_result.get("recommendations", []))

        # 4. アスペクト比チェック
        aspect_result = self._check_aspect_ratio(image, job)
        issues.extend(aspect_result["issues"])
        scores.append(aspect_result["score"])
        recommendations.extend(aspect_result.get("recommendations", []))

        # 5. 人物比率チェック（分析JSONがある場合）
        if self.analysis_dir:
            analysis_path = self.analysis_dir / f"{section_id}.json"
            if analysis_path.exists():
                with open(analysis_path, "r", encoding="utf-8") as f:
                    analysis = json.load(f)
                if analysis.get("person_present"):
                    person_result = self._check_person_proportions(image_array, analysis)
                    issues.extend(person_result["issues"])
                    scores.append(person_result["score"])
                    recommendations.extend(person_result.get("recommendations", []))

        # 総合スコア
        overall_score = sum(scores) / len(scores) if scores else 0.0

        # クリティカルな問題があれば不合格
        has_critical = any(i.severity == "critical" for i in issues)
        passed = not has_critical and overall_score >= 0.7

        return QualityResult(
            section_id=section_id,
            passed=passed,
            score=overall_score,
            issues=issues,
            recommendations=list(set(recommendations))
        )

    def _check_sharpness(self, image_array: np.ndarray) -> Dict:
        """鮮明度チェック"""
        issues = []
        recommendations = []

        # ラプラシアン分散で鮮明度を計算
        gray = np.mean(image_array, axis=2) if len(image_array.shape) == 3 else image_array

        # ラプラシアンカーネル
        laplacian = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]])

        # 畳み込み（簡易版）
        from scipy import ndimage
        try:
            laplacian_response = ndimage.convolve(gray.astype(float), laplacian)
            sharpness = laplacian_response.var()
        except:
            # scipy がない場合のフォールバック
            sharpness = gray.var()

        score = min(1.0, sharpness / (self.SHARPNESS_THRESHOLD * 2))

        if sharpness < self.SHARPNESS_THRESHOLD:
            issues.append(QualityIssue(
                severity="critical",
                category="sharpness",
                message=f"ぼやけ検出: sharpness={sharpness:.1f} (閾値: {self.SHARPNESS_THRESHOLD})",
                details={"sharpness": sharpness, "threshold": self.SHARPNESS_THRESHOLD}
            ))
            recommendations.append("negative_constraints に 'blur', 'low-res' を追加")
            recommendations.append("target_resolution を上げる（2048x1152）")

        return {"score": score, "issues": issues, "recommendations": recommendations}

    def _check_text(self, image: Image.Image, job: Dict) -> Dict:
        """テキスト検証（OCR）"""
        issues = []
        recommendations = []

        if not TESSERACT_AVAILABLE:
            return {"score": 1.0, "issues": [], "recommendations": []}

        # OCR実行
        try:
            ocr_text = pytesseract.image_to_string(image, lang="jpn+eng")
        except Exception as e:
            issues.append(QualityIssue(
                severity="warning",
                category="text",
                message=f"OCR実行エラー: {e}"
            ))
            return {"score": 0.5, "issues": issues, "recommendations": []}

        # 期待テキストと比較
        text_constraint = job.get("prompt_layers", {}).get("layer3_text_constraint", {})
        expected_texts = []

        for key in ["title", "body"]:
            if key in text_constraint and text_constraint[key]:
                expected_texts.append(text_constraint[key])

        if not expected_texts:
            return {"score": 1.0, "issues": [], "recommendations": []}

        matches = 0
        for expected in expected_texts:
            # 部分一致で検証（OCRは完全一致が難しい）
            expected_clean = expected.replace(" ", "").replace("\n", "")
            ocr_clean = ocr_text.replace(" ", "").replace("\n", "")

            if expected_clean[:20] in ocr_clean or expected_clean[-20:] in ocr_clean:
                matches += 1

        score = matches / len(expected_texts) if expected_texts else 1.0

        if score < self.TEXT_MATCH_THRESHOLD:
            issues.append(QualityIssue(
                severity="critical",
                category="text",
                message=f"テキスト不一致: {matches}/{len(expected_texts)} 一致",
                details={"matches": matches, "total": len(expected_texts)}
            ))
            recommendations.append("layer3_text_constraint の constraint に '文字を大きく、コントラスト高く' を追加")
            recommendations.append("negative_constraints に 'melted text' を追加")

        return {"score": score, "issues": issues, "recommendations": recommendations}

    def _check_resolution(self, image: Image.Image, job: Dict) -> Dict:
        """解像度チェック"""
        issues = []
        recommendations = []

        render_spec = job.get("render_spec", {})
        target = render_spec.get("target_resolution", {"width": 1920, "height": 1080})

        actual_width, actual_height = image.size
        target_width = target.get("width", 1920)
        target_height = target.get("height", 1080)

        # 10%以内の誤差を許容
        width_ok = abs(actual_width - target_width) / target_width < 0.1
        height_ok = abs(actual_height - target_height) / target_height < 0.1

        if width_ok and height_ok:
            return {"score": 1.0, "issues": [], "recommendations": []}

        score = 0.5

        if not width_ok or not height_ok:
            issues.append(QualityIssue(
                severity="warning",
                category="resolution",
                message=f"解像度不一致: {actual_width}x{actual_height} (目標: {target_width}x{target_height})",
                details={
                    "actual": {"width": actual_width, "height": actual_height},
                    "target": {"width": target_width, "height": target_height}
                }
            ))
            recommendations.append(f"ImageOps.fit() で {target_width}x{target_height} にリサイズ")

        return {"score": score, "issues": issues, "recommendations": recommendations}

    def _check_aspect_ratio(self, image: Image.Image, job: Dict) -> Dict:
        """アスペクト比チェック"""
        issues = []
        recommendations = []

        render_spec = job.get("render_spec", {})
        target_aspect = render_spec.get("aspect_ratio", "16:9")

        actual_width, actual_height = image.size
        actual_ratio = actual_width / actual_height

        # 目標比率を計算
        if ":" in target_aspect:
            w, h = map(float, target_aspect.split(":"))
            target_ratio = w / h
        else:
            target_ratio = 16 / 9  # デフォルト

        # 5%以内の誤差を許容
        ratio_diff = abs(actual_ratio - target_ratio) / target_ratio

        if ratio_diff < 0.05:
            return {"score": 1.0, "issues": [], "recommendations": []}

        score = 1.0 - min(ratio_diff, 0.3) / 0.3

        issues.append(QualityIssue(
            severity="warning" if ratio_diff < 0.15 else "critical",
            category="aspect_ratio",
            message=f"アスペクト比不一致: {actual_ratio:.2f} (目標: {target_ratio:.2f})",
            details={
                "actual_ratio": actual_ratio,
                "target_ratio": target_ratio,
                "difference": ratio_diff
            }
        ))
        recommendations.append("ImageOps.fit() を使用してカバースタイルでリサイズ")
        recommendations.append("元画像を潰さずにクロップで調整")

        return {"score": score, "issues": issues, "recommendations": recommendations}

    def _check_person_proportions(self, image_array: np.ndarray, analysis: Dict) -> Dict:
        """人物比率チェック"""
        issues = []
        recommendations = []

        # 人物検出は高度な処理が必要なため、ここでは警告のみ
        person_info = analysis.get("person_info", {})
        expected_coverage = person_info.get("screen_coverage", 0)

        if expected_coverage > 0:
            issues.append(QualityIssue(
                severity="info",
                category="character",
                message=f"人物表示あり: 画面占有率 {expected_coverage*100:.0f}% を期待",
                details={"expected_coverage": expected_coverage}
            ))
            recommendations.append("character_bible と一致しているか目視確認")
            recommendations.append("頭身比率が 7-8 頭身になっているか確認")

        return {"score": 1.0, "issues": issues, "recommendations": recommendations}

    def generate_report(self, output_path: str = None) -> str:
        """レポート生成"""
        lines = []
        lines.append("# 品質検証レポート")
        lines.append(f"\n生成日時: {datetime.now().isoformat()}")
        lines.append(f"検証セクション数: {len(self.results)}")

        passed = sum(1 for r in self.results if r.passed)
        failed = len(self.results) - passed

        lines.append(f"合格: {passed}, 不合格: {failed}")

        lines.append("\n## 詳細結果\n")

        for result in self.results:
            status = "PASS" if result.passed else "FAIL"
            lines.append(f"### {result.section_id}: {status} (score={result.score:.2f})")

            if result.issues:
                lines.append("\n問題点:")
                for issue in result.issues:
                    lines.append(f"- [{issue.severity.upper()}] {issue.category}: {issue.message}")

            if result.recommendations:
                lines.append("\n推奨対応:")
                for rec in result.recommendations:
                    lines.append(f"- {rec}")

            lines.append("")

        # 全体の推奨事項
        if failed > 0:
            lines.append("\n## 全体の推奨事項\n")

            # 問題をカテゴリ別に集計
            category_counts = {}
            for result in self.results:
                for issue in result.issues:
                    if issue.severity == "critical":
                        category_counts[issue.category] = category_counts.get(issue.category, 0) + 1

            for category, count in sorted(category_counts.items(), key=lambda x: -x[1]):
                lines.append(f"- {category}: {count}件のクリティカル問題")

        report = "\n".join(lines)

        if output_path:
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(report)
            print(f"\nレポート保存: {output_path}")

        return report

    def suggest_fixes(self, result: QualityResult) -> Dict:
        """自動修正提案"""
        fixes = {
            "negative_constraints_add": [],
            "prompt_modifications": [],
            "render_spec_changes": {},
        }

        for issue in result.issues:
            if "テキスト不一致" in issue.message:
                fixes["negative_constraints_add"].append("melted text")
                fixes["prompt_modifications"].append(
                    "layer3_text_constraint.constraint += ' 文字を大きく、コントラスト高く。'"
                )

            if "ぼやけ" in issue.message:
                fixes["negative_constraints_add"].extend(["blur", "low-res"])
                fixes["render_spec_changes"]["target_resolution"] = {"width": 2048, "height": 1152}

            if "アスペクト比" in issue.message or "解像度" in issue.message:
                fixes["prompt_modifications"].append(
                    "layer2_reference += ' アスペクト比を厳密に維持。'"
                )

            if "頭身" in issue.message or "比率" in issue.message:
                fixes["negative_constraints_add"].extend(["stretched limbs", "wide-angle distortion"])

        # 重複除去
        fixes["negative_constraints_add"] = list(set(fixes["negative_constraints_add"]))
        fixes["prompt_modifications"] = list(set(fixes["prompt_modifications"]))

        return fixes


def main():
    parser = argparse.ArgumentParser(description="Quality Checker for Generated Slides")
    parser.add_argument("--generated", "-g", required=True, help="生成画像ディレクトリ")
    parser.add_argument("--jobs", "-j", required=True, help="NanoBanana ジョブディレクトリ")
    parser.add_argument("--analysis", "-a", help="分析JSONディレクトリ（オプション）")
    parser.add_argument("--output", "-o", help="レポート出力パス")
    parser.add_argument("--image", help="単一画像パス（--single 使用時）")
    parser.add_argument("--job", help="単一ジョブパス（--single 使用時）")
    parser.add_argument("--single", action="store_true", help="単一ファイルモード")

    args = parser.parse_args()

    if args.single:
        if not args.image or not args.job:
            print("エラー: --single モードでは --image と --job が必要です")
            sys.exit(1)

        checker = QualityChecker(
            generated_dir=str(Path(args.image).parent),
            jobs_dir=str(Path(args.job).parent),
            analysis_dir=args.analysis
        )

        result = checker.check_single(args.image, args.job)

        print(f"\n{'='*60}")
        print(f"品質検証結果: {result.section_id}")
        print(f"{'='*60}")
        print(f"結果: {'PASS' if result.passed else 'FAIL'}")
        print(f"スコア: {result.score:.2f}")

        if result.issues:
            print("\n問題点:")
            for issue in result.issues:
                print(f"  [{issue.severity.upper()}] {issue.message}")

        if not result.passed:
            fixes = checker.suggest_fixes(result)
            print("\n推奨修正:")
            print(json.dumps(fixes, indent=2, ensure_ascii=False))

    else:
        checker = QualityChecker(
            generated_dir=args.generated,
            jobs_dir=args.jobs,
            analysis_dir=args.analysis
        )

        checker.check_all()

        output_path = args.output or str(Path(args.generated).parent / "quality_report.md")
        checker.generate_report(output_path)

        # 全体サマリー
        passed = sum(1 for r in checker.results if r.passed)
        total = len(checker.results)

        print(f"\n{'='*60}")
        print(f"品質検証完了: {passed}/{total} 合格")
        print(f"{'='*60}")

        sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
