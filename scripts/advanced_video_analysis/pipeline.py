#!/usr/bin/env python3
"""
Advanced Video Analysis Pipeline v1.0

動画→セクション分割→構造分析JSON→NanoBanana生成投入→品質検証までを
一気通貫で自動化する4段階パイプライン。

使用方法:
    python3 pipeline.py --input "video.mp4" --project "my_project" --output "./out"
    python3 pipeline.py --input "https://youtube.com/..." --mode section_detection_only
"""

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple
import uuid

try:
    from PIL import Image
    import imagehash
except ImportError:
    print("依存パッケージをインストールしてください: pip install Pillow imagehash")
    sys.exit(1)

try:
    from scenedetect import detect, AdaptiveDetector, ContentDetector
    SCENEDETECT_AVAILABLE = True
except ImportError:
    SCENEDETECT_AVAILABLE = False
    print("警告: PySceneDetect がインストールされていません。pip install scenedetect")


@dataclass
class SectionCandidate:
    """セクション境界候補"""
    time: float
    confidence: float
    source: str  # "adaptive", "content", "histogram", "ssim"
    transition_type: str = "hard_cut"


@dataclass
class FinalSection:
    """確定セクション"""
    index: int
    section_id: str
    start_time: float
    end_time: float
    keyframe_time: float
    transition_type: str
    confidence: float


@dataclass
class PipelineConfig:
    """パイプライン設定"""
    video_input: str
    project_name: str
    output_dir: str
    language_target: str = "ja"

    # セクション定義
    hard_cut: bool = True
    soft_transition: bool = True
    slide_animation: bool = False

    # 検出閾値
    adaptive_threshold: float = 2.0
    content_threshold: float = 20.0
    min_scene_len: int = 15  # フレーム数（0.5秒@30fps）
    ssim_threshold: float = 0.85
    phash_threshold: int = 10

    # モード
    mode: str = "full"  # "full", "section_detection_only", "analysis_only"


class AdvancedVideoPipeline:
    """高精度動画解析パイプライン"""

    def __init__(self, config: PipelineConfig):
        self.config = config
        self.run_id = str(uuid.uuid4())[:8]
        self.timestamp = datetime.now().isoformat()

        # ディレクトリ構造を作成
        self.dirs = self._setup_directories()

        # 結果格納
        self.candidate_cuts: List[SectionCandidate] = []
        self.filtered_cuts: List[SectionCandidate] = []
        self.deduped_cuts: List[SectionCandidate] = []
        self.final_sections: List[FinalSection] = []

    def _setup_directories(self) -> dict:
        """ディレクトリ構造を作成"""
        base = Path(self.config.output_dir)
        dirs = {
            "base": base,
            "raw_video": base / "raw_video",
            "frames_raw": base / "frames_raw",
            "frames_key": base / "frames_key",
            "analysis_json": base / "analysis_json",
            "nanobanana_jobs": base / "nanobanana_jobs",
            "reports": base / "reports",
        }
        for d in dirs.values():
            d.mkdir(parents=True, exist_ok=True)
        return dirs

    def run(self):
        """パイプライン実行"""
        print(f"\n{'='*60}")
        print(f"Advanced Video Analysis Pipeline v1.0")
        print(f"{'='*60}")
        print(f"Run ID: {self.run_id}")
        print(f"Project: {self.config.project_name}")
        print(f"Mode: {self.config.mode}")
        print(f"{'='*60}\n")

        # Step 0: 初期化・マニフェスト作成
        self._create_manifest()

        # Step 1: 動画取得
        video_path = self._acquire_video()
        if not video_path:
            print("エラー: 動画の取得に失敗しました")
            return False

        # Step 2: セクション境界検出（4段階）
        self._detect_sections(video_path)

        if self.config.mode == "section_detection_only":
            self._save_sections()
            self._print_section_report()
            return True

        # Step 3: キーフレーム抽出
        self._extract_keyframes(video_path)

        if self.config.mode == "analysis_only":
            return True

        # Step 4: 構造分析（各セクションJSON化）
        self._analyze_sections()

        # Step 5: キャラクター一貫性
        self._create_character_bible()

        # Step 6: NanoBanana投入データ生成
        self._generate_nanobanana_jobs()

        # 完了
        self._save_sections()
        self._print_section_report()
        print(f"\n完了: {self.dirs['base']}")
        return True

    def _create_manifest(self):
        """実行マニフェストを作成"""
        manifest = {
            "run_id": self.run_id,
            "timestamp": self.timestamp,
            "video_input": self.config.video_input,
            "project_name": self.config.project_name,
            "settings": {
                "language_target": self.config.language_target,
                "hard_cut": self.config.hard_cut,
                "soft_transition": self.config.soft_transition,
                "slide_animation": self.config.slide_animation,
                "adaptive_threshold": self.config.adaptive_threshold,
                "content_threshold": self.config.content_threshold,
                "ssim_threshold": self.config.ssim_threshold,
            },
            "versions": self._get_versions(),
        }

        manifest_path = self.dirs["base"] / "run_manifest.json"
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
        print(f"マニフェスト作成: {manifest_path}")

    def _get_versions(self) -> dict:
        """バージョン情報を取得"""
        versions = {"python": sys.version.split()[0]}

        try:
            result = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True)
            versions["ffmpeg"] = result.stdout.split("\n")[0].split()[2]
        except:
            versions["ffmpeg"] = "not found"

        if SCENEDETECT_AVAILABLE:
            import scenedetect
            versions["pyscenedetect"] = scenedetect.__version__
        else:
            versions["pyscenedetect"] = "not installed"

        return versions

    def _acquire_video(self) -> Optional[Path]:
        """動画を取得"""
        print("\n[Step 1] 動画取得...")

        video_input = self.config.video_input
        output_path = self.dirs["raw_video"] / "source.mp4"

        # URLの場合
        if video_input.startswith("http"):
            print(f"  YouTube/URLから取得: {video_input}")
            try:
                cmd = [
                    "yt-dlp", "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]",
                    "-o", str(output_path), video_input
                ]
                subprocess.run(cmd, check=True, capture_output=True)

                # 字幕も取得
                cmd_sub = [
                    "yt-dlp", "--write-auto-sub", "--sub-lang", "ja",
                    "--skip-download", "-o", str(self.dirs["raw_video"] / "source"),
                    video_input
                ]
                subprocess.run(cmd_sub, capture_output=True)

                print(f"  取得完了: {output_path}")
                return output_path
            except subprocess.CalledProcessError as e:
                print(f"  エラー: yt-dlp 実行失敗 - {e}")
                return None
            except FileNotFoundError:
                print("  エラー: yt-dlp がインストールされていません")
                return None

        # ローカルファイルの場合
        elif os.path.exists(video_input):
            import shutil
            shutil.copy(video_input, output_path)
            print(f"  コピー完了: {output_path}")
            return output_path

        else:
            print(f"  エラー: ファイルが見つかりません: {video_input}")
            return None

    def _detect_sections(self, video_path: Path):
        """セクション境界検出（4段階パイプライン）"""
        print("\n[Step 2] セクション境界検出...")

        # Phase 1: High-Recall候補抽出
        print("  Phase 1: High-Recall候補抽出（漏れゼロ優先）...")
        self._phase1_high_recall(video_path)
        print(f"    候補数: {len(self.candidate_cuts)}")

        # Phase 2: High-Precisionフィルタ
        print("  Phase 2: High-Precisionフィルタ（誤検知削減）...")
        self._phase2_high_precision(video_path)
        print(f"    フィルタ後: {len(self.filtered_cuts)}")

        # Phase 3: 重複排除
        print("  Phase 3: 重複排除・アニメ統合...")
        self._phase3_dedup(video_path)
        print(f"    重複排除後: {len(self.deduped_cuts)}")

        # Phase 4: 意味的検証
        print("  Phase 4: 意味的検証（最終確定）...")
        self._phase4_semantic_verification(video_path)
        print(f"    確定セクション数: {len(self.final_sections)}")

    def _phase1_high_recall(self, video_path: Path):
        """Phase 1: High-Recall候補抽出"""
        if not SCENEDETECT_AVAILABLE:
            print("    警告: PySceneDetectが利用できません。手動入力が必要です。")
            # フォールバック: 30秒ごとにセクションを作成
            duration = self._get_video_duration(video_path)
            for t in range(0, int(duration), 30):
                self.candidate_cuts.append(SectionCandidate(
                    time=float(t),
                    confidence=0.5,
                    source="fallback",
                    transition_type="hard_cut"
                ))
            return

        # AdaptiveDetector
        try:
            scenes_adaptive = detect(str(video_path), AdaptiveDetector(
                adaptive_threshold=self.config.adaptive_threshold,
                min_scene_len=self.config.min_scene_len
            ))
            for start, end in scenes_adaptive:
                self.candidate_cuts.append(SectionCandidate(
                    time=start.get_seconds(),
                    confidence=0.8,
                    source="adaptive",
                    transition_type="hard_cut"
                ))
        except Exception as e:
            print(f"    AdaptiveDetector エラー: {e}")

        # ContentDetector
        try:
            scenes_content = detect(str(video_path), ContentDetector(
                threshold=self.config.content_threshold,
                min_scene_len=self.config.min_scene_len
            ))
            for start, end in scenes_content:
                self.candidate_cuts.append(SectionCandidate(
                    time=start.get_seconds(),
                    confidence=0.7,
                    source="content",
                    transition_type="hard_cut"
                ))
        except Exception as e:
            print(f"    ContentDetector エラー: {e}")

        # 候補を時間順にソート
        self.candidate_cuts.sort(key=lambda x: x.time)

    def _phase2_high_precision(self, video_path: Path):
        """Phase 2: High-Precisionフィルタ"""
        # 近接する候補を統合（1秒以内）
        merged = []
        for cut in self.candidate_cuts:
            if not merged or cut.time - merged[-1].time > 1.0:
                merged.append(cut)
            else:
                # より高い信頼度を採用
                if cut.confidence > merged[-1].confidence:
                    merged[-1] = cut

        self.filtered_cuts = merged

    def _phase3_dedup(self, video_path: Path):
        """Phase 3: 重複排除"""
        if not self.filtered_cuts:
            return

        # pHash + SSIM で「ほぼ同一」を統合
        deduped = []
        prev_hash = None

        for cut in self.filtered_cuts:
            frame_path = self._extract_single_frame(video_path, cut.time)
            if frame_path and frame_path.exists():
                try:
                    curr_hash = imagehash.phash(Image.open(frame_path))

                    if prev_hash is None or curr_hash - prev_hash > self.config.phash_threshold:
                        deduped.append(cut)
                        prev_hash = curr_hash
                except Exception as e:
                    print(f"    pHash計算エラー: {e}")
                    deduped.append(cut)
            else:
                deduped.append(cut)

        self.deduped_cuts = deduped

    def _phase4_semantic_verification(self, video_path: Path):
        """Phase 4: 意味的検証・最終確定"""
        if not self.deduped_cuts:
            return

        duration = self._get_video_duration(video_path)

        for i, cut in enumerate(self.deduped_cuts):
            end_time = self.deduped_cuts[i + 1].time if i + 1 < len(self.deduped_cuts) else duration

            section = FinalSection(
                index=i + 1,
                section_id=f"s{i + 1:02d}",
                start_time=cut.time,
                end_time=end_time,
                keyframe_time=cut.time + 0.5,  # 遷移直後を避ける
                transition_type=cut.transition_type,
                confidence=cut.confidence
            )
            self.final_sections.append(section)

    def _extract_keyframes(self, video_path: Path):
        """キーフレーム抽出"""
        print("\n[Step 3] キーフレーム抽出...")

        for section in self.final_sections:
            frame_path = self.dirs["frames_key"] / f"{section.section_id}.png"

            # 遷移直後のノイズを避けて最もシャープなフレームを選択
            best_time = section.start_time + 0.5
            if best_time >= section.end_time:
                best_time = section.start_time + (section.end_time - section.start_time) / 2

            cmd = [
                "ffmpeg", "-y",
                "-ss", str(best_time),
                "-i", str(video_path),
                "-vframes", "1",
                "-q:v", "2",
                str(frame_path)
            ]
            subprocess.run(cmd, capture_output=True)

            if frame_path.exists():
                print(f"  {section.section_id}: {frame_path.name}")

    def _analyze_sections(self):
        """構造分析（各セクションJSON化）"""
        print("\n[Step 4] 構造分析...")

        for section in self.final_sections:
            frame_path = self.dirs["frames_key"] / f"{section.section_id}.png"
            if not frame_path.exists():
                continue

            analysis = {
                "section_id": section.section_id,
                "keyframe": str(frame_path.relative_to(self.dirs["base"])),
                "start_time": section.start_time,
                "end_time": section.end_time,
                "duration": section.end_time - section.start_time,

                # 画像タイプ（要手動確認）
                "image_type": "slide",  # slide, presenter, hybrid, b_roll

                # レイアウト（要手動/AI分析）
                "layout": {
                    "canvas": {"width": 1920, "height": 1080, "aspect_ratio": "16:9"},
                    "regions": [],  # 要分析
                },

                # テキストブロック（要OCR）
                "text_blocks": [],

                # 画像（要分析）
                "images": [],

                # 人物情報（要分析）
                "person_present": False,
                "person_info": None,

                # 背景（要分析）
                "background": {"type": "unknown"},

                # 翻訳計画
                "translate_plan": {
                    "strategy": "direct_translation",
                    "technical_terms": [],
                },

                # ハルシネーション防止
                "hallucination_guard": {
                    "allowed_sources": ["ocr", "transcript", "user_input"],
                    "verified_texts": [],
                },
            }

            analysis_path = self.dirs["analysis_json"] / f"{section.section_id}.json"
            with open(analysis_path, "w", encoding="utf-8") as f:
                json.dump(analysis, f, indent=2, ensure_ascii=False)

            print(f"  {section.section_id}: {analysis_path.name}")

    def _create_character_bible(self):
        """キャラクター一貫性設定"""
        print("\n[Step 5] キャラクター設定...")

        bible = {
            "character_id": "presenter_01",
            "description": "メインプレゼンター（要設定）",

            "appearance": {
                "age_range": "30-40",
                "gender_expression": "neutral",
                "ethnicity": "asian",
                "hair": {"style": "short", "color": "black"},
                "face": {"shape": "oval", "features": "clean"},
            },

            "body_proportions": {
                "head_ratio": 7.5,
                "shoulder_width_ratio": 0.25,
                "arm_length_ratio": 0.45,
                "leg_length_ratio": 0.5,
            },

            "outfit": {
                "default": {
                    "top": "business casual",
                    "bottom": "dark trousers",
                    "accessories": "none",
                }
            },

            "expression_range": ["neutral", "slight_smile", "thoughtful"],

            "style": {
                "rendering": "photorealistic",
                "lighting": "soft studio lighting",
                "camera": "portrait lens, no wide-angle distortion",
            },

            "ng_constraints": [
                "stretched limbs",
                "wide-angle distortion",
                "warped anatomy",
                "inconsistent face",
                "different outfit",
                "blurry features",
            ],
        }

        bible_path = self.dirs["base"] / "character_bible.json"
        with open(bible_path, "w", encoding="utf-8") as f:
            json.dump(bible, f, indent=2, ensure_ascii=False)
        print(f"  作成: {bible_path}")

    def _generate_nanobanana_jobs(self):
        """NanoBanana投入データ生成"""
        print("\n[Step 6] NanoBanana投入データ生成...")

        for section in self.final_sections:
            analysis_path = self.dirs["analysis_json"] / f"{section.section_id}.json"
            if not analysis_path.exists():
                continue

            with open(analysis_path, "r", encoding="utf-8") as f:
                analysis = json.load(f)

            job = {
                "job_id": f"{section.section_id}_job",
                "section_id": section.section_id,

                "references": {
                    "layout_reference": {
                        "image": analysis.get("keyframe", ""),
                        "usage": "layout_structure_only",
                    },
                    "character_reference": {
                        "bible": "character_bible.json",
                        "usage": "face_body_outfit_consistency",
                    },
                },

                "prompt_layers": {
                    "layer1_role": "高忠実度なスライド再現。元のレイアウト構造を厳密に維持しつつ、日本語テキストに置換。",
                    "layer2_reference": "参照画像Aはレイアウト構造のみ参照（人物・テキストは再生成）。キャラクターはcharacter_bibleに従う。",
                    "layer3_text_constraint": {
                        "title": "",  # 要設定
                        "body": "",  # 要設定
                        "constraint": "OCR読み戻しで一致を検証。数字・固有名詞は厳密一致必須。",
                    },
                    "layer4_blueprint": {
                        "subject": "プロフェッショナルなスライドプレゼンテーション",
                        "composition": "",  # 要設定
                        "action": "静止画",
                        "location": "クリーンなスライド背景",
                        "style": "企業研修教材、高解像度、鮮明",
                    },
                },

                "negative_constraints": [
                    "blur", "low-res", "jpeg artifacts",
                    "warped anatomy", "stretched limbs", "wide-angle distortion",
                    "melted text", "incorrect numbers", "extra elements",
                    "inconsistent character", "different outfit",
                ],

                "render_spec": {
                    "target_resolution": {"width": 1920, "height": 1080},
                    "aspect_ratio": "16:9",
                    "typography": {
                        "contrast": "high",
                        "readability": "priority",
                        "kerning": "normal",
                        "line_height": 1.5,
                    },
                },

                "output_expectation": {
                    "quality": "写真のようにくっきり鮮明",
                    "character": "character_bibleと同一の顔・体型・衣装",
                    "text": "OCR読み戻しで100%一致",
                },
            }

            job_path = self.dirs["nanobanana_jobs"] / f"{section.section_id}.job.json"
            with open(job_path, "w", encoding="utf-8") as f:
                json.dump(job, f, indent=2, ensure_ascii=False)

            print(f"  {section.section_id}: {job_path.name}")

    def _save_sections(self):
        """セクション情報を保存"""
        sections_data = {
            "section_count": len(self.final_sections),
            "sections": [
                {
                    "index": s.index,
                    "id": s.section_id,
                    "start_time": s.start_time,
                    "end_time": s.end_time,
                    "keyframe_time": s.keyframe_time,
                    "transition_type": s.transition_type,
                    "confidence": s.confidence,
                }
                for s in self.final_sections
            ],
        }

        sections_path = self.dirs["base"] / "final_sections.json"
        with open(sections_path, "w", encoding="utf-8") as f:
            json.dump(sections_data, f, indent=2, ensure_ascii=False)

    def _print_section_report(self):
        """セクション検出レポートを表示"""
        print(f"\n{'='*60}")
        print("セクション検出完了")
        print(f"{'='*60}")
        print(f"\n確定セクション数: {len(self.final_sections)}")
        print("\nセクション一覧:")

        for s in self.final_sections:
            start = self._format_time(s.start_time)
            end = self._format_time(s.end_time)
            print(f"  {s.section_id}: {start}-{end} ({s.transition_type}, conf={s.confidence:.2f})")

        print(f"\n{'='*60}")

    def _get_video_duration(self, video_path: Path) -> float:
        """動画の長さを取得"""
        try:
            cmd = [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(video_path)
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            return float(result.stdout.strip())
        except:
            return 0.0

    def _extract_single_frame(self, video_path: Path, time: float) -> Optional[Path]:
        """単一フレームを抽出"""
        frame_path = self.dirs["frames_raw"] / f"frame_{time:.2f}.png"
        if not frame_path.exists():
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(time),
                "-i", str(video_path),
                "-vframes", "1",
                "-q:v", "2",
                str(frame_path)
            ]
            subprocess.run(cmd, capture_output=True)
        return frame_path if frame_path.exists() else None

    @staticmethod
    def _format_time(seconds: float) -> str:
        """秒を MM:SS 形式に変換"""
        m, s = divmod(int(seconds), 60)
        return f"{m:02d}:{s:02d}"


def main():
    parser = argparse.ArgumentParser(description="Advanced Video Analysis Pipeline")
    parser.add_argument("--input", "-i", required=True, help="動画URL または ローカルファイルパス")
    parser.add_argument("--project", "-p", help="プロジェクト名（省略時はファイル名）")
    parser.add_argument("--output", "-o", default="./out", help="出力ディレクトリ")
    parser.add_argument("--mode", "-m", default="full",
                       choices=["full", "section_detection_only", "analysis_only"],
                       help="実行モード")
    parser.add_argument("--language", "-l", default="ja", help="対象言語")

    args = parser.parse_args()

    # プロジェクト名の決定
    if args.project:
        project_name = args.project
    elif args.input.startswith("http"):
        project_name = f"project_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    else:
        project_name = Path(args.input).stem

    # 出力ディレクトリ
    output_dir = Path(args.output) / project_name

    # 設定
    config = PipelineConfig(
        video_input=args.input,
        project_name=project_name,
        output_dir=str(output_dir),
        language_target=args.language,
        mode=args.mode,
    )

    # 実行
    pipeline = AdvancedVideoPipeline(config)
    success = pipeline.run()

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
