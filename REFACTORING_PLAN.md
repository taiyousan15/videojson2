# 動画・画像系リファクタリング計画

## 📊 現状分析

### 問題点

1. **コード重複が深刻**
   - 32個の字幕生成スクリプト（generate_subtitles*.py）
   - 10個以上の音声生成スクリプト（generate_audio.py）
   - 各プロジェクトに同じコードがコピー

2. **プロジェクト構造が不統一**
   - 23個のプロジェクトディレクトリ
   - obsidian_training_ep2, ep3, ep4, ep5
   - wes_roth_videos, wes_roth_videos_hq, wes_roth_summary
   - 各々異なる構造

3. **スキルドキュメントと実装の乖離**
   - スキルは整理されたが、実装は古いまま
   - 共通ライブラリが存在しない

4. **保守性の問題**
   - バグ修正が23箇所必要
   - 新機能追加が困難
   - テストが不可能

---

## 🎯 リファクタリング目標

### 達成目標

1. **DRY原則の徹底**
   - コード重複を95%削減
   - 共通機能を1箇所に集約

2. **プロジェクト構造の標準化**
   - テンプレートベースの構造
   - 設定ファイルで差異を吸収

3. **スキルと実装の一致**
   - 各スキルに対応する実装を提供
   - ドキュメント通りに動作

4. **保守性・テスタビリティの向上**
   - ユニットテスト可能な設計
   - モジュール化された構造

---

## 📋 リファクタリング計画（3フェーズ）

### Phase 1: 共通ライブラリの作成 ⏱️ 2-3時間

**目標**: 重複コードを共通ライブラリに集約

#### 1.1 ディレクトリ構造

```
shared/
├── __init__.py
├── video_utils/
│   ├── __init__.py
│   ├── tts.py                # TTS音声生成
│   ├── subtitles.py          # 字幕生成（固有名詞保護、読み/表示分離）
│   ├── ffmpeg_utils.py       # FFmpeg操作
│   ├── image_gen.py          # 画像生成（NanoBanana）
│   ├── composites.py         # 合成画像作成（75%+25%レイアウト）
│   ├── validation.py         # セクション検証
│   └── config.py             # 設定管理
├── models/
│   ├── __init__.py
│   ├── section.py            # Section データクラス
│   ├── project.py            # Project 設定
│   └── audio_config.py       # AudioConfig
└── constants.py              # 定数（フォントパス、レイアウト等）
```

#### 1.2 実装する共通機能

**tts.py** - TTS音声生成
```python
class TTSGenerator:
    """Google Cloud TTS Neural2 音声生成"""

    def generate(self, text: str, output_path: str,
                 voice: str = "ja-JP-Neural2-D"):
        """単一音声生成"""

    def generate_batch(self, sections: List[Section],
                       output_dir: str):
        """バッチ音声生成"""
```

**subtitles.py** - 字幕生成
```python
class SubtitleGenerator:
    """固有名詞保護、読み/表示分離対応字幕生成"""

    PROTECTED_WORDS = ['NotebookLM', 'Obsidian', ...]

    def __init__(self, protected_words: List[str] = None):
        """保護語リスト設定"""

    def convert_reading_to_display(self, text: str) -> str:
        """読み→表示変換（いち→１、に→２）"""

    def split_text(self, text: str, max_chars: int = 20) -> List[str]:
        """固有名詞保護付きテキスト分割"""

    def generate_srt(self, section: Section, audio_path: str,
                     output_path: str):
        """SRTファイル生成"""
```

**ffmpeg_utils.py** - FFmpeg操作
```python
class FFmpegComposer:
    """FFmpeg動画合成"""

    def create_segment(self, image: str, audio: str,
                       subtitle: str, output: str,
                       use_drawtext: bool = True):
        """セグメント動画作成（-shortest禁止、-t duration使用）"""

    def concat_segments(self, segments: List[str], output: str):
        """セグメント結合"""

    def get_audio_duration(self, audio_path: str) -> float:
        """音声長取得（ffprobe）"""
```

**image_gen.py** - 画像生成
```python
class ImageGenerator:
    """NanoBanana画像生成"""

    def generate(self, prompt: str, output_path: str):
        """単一画像生成"""

    def generate_batch(self, prompts: Dict[str, str],
                       output_dir: str):
        """バッチ画像生成"""
```

**composites.py** - 合成画像
```python
class CompositeCreator:
    """75%+25%レイアウト合成画像"""

    WIDTH = 1920
    HEIGHT = 1080
    IMG_HEIGHT = 810  # 75%
    BAR_HEIGHT = 270  # 25%
    BAR_COLOR = (26, 42, 74)  # ダークブルー

    def create(self, image_path: str, output_path: str):
        """合成画像作成（ImageOps.fit()でアスペクト比維持）"""
```

**validation.py** - セクション検証
```python
class SectionValidator:
    """セクション検証（カバー率100%必須）"""

    def validate(self, sections: List[Section],
                 video_duration: float) -> ValidationResult:
        """検証実行"""

    def extract_gaps(self, sections: List[Section],
                     video_path: str, output_dir: str):
        """ギャップフレーム抽出"""
```

---

### Phase 2: スクリプトの統合 ⏱️ 3-4時間

**目標**: scripts/ を統一されたスクリプトに整理

#### 2.1 統合スクリプト

```
scripts/
├── video/
│   ├── generate_tts_video.py        # TTS動画生成（統合版）
│   ├── generate_subtitle_video.py   # 字幕付き動画生成（統合版）
│   ├── generate_segments.py         # セグメント動画生成
│   └── concat_videos.py             # 動画結合
│
├── audio/
│   ├── generate_audio_batch.py      # バッチ音声生成
│   └── regenerate_audio.py          # 音声再生成
│
├── image/
│   ├── generate_images_batch.py     # バッチ画像生成
│   └── create_composites_batch.py   # バッチ合成画像
│
├── subtitle/
│   ├── generate_subtitles.py        # 字幕生成（統合版）
│   └── validate_subtitles.py        # 字幕検証
│
└── utils/
    ├── validate_sections.py         # セクション検証（既存）
    ├── analyze_video.py             # 動画分析
    └── project_init.py              # プロジェクト初期化
```

#### 2.2 統合スクリプトの特徴

- **設定ファイルベース**: `sections.json` で全設定を管理
- **CLI引数**: `--config`, `--output-dir`, `--voice` 等
- **共通ライブラリ使用**: shared/video_utils/ を利用
- **エラーハンドリング**: 詳細なログ、リトライ機能
- **並列処理**: マルチプロセス対応（optional）

#### 2.3 実装例: generate_tts_video.py

```python
#!/usr/bin/env python3
"""
統合TTS動画生成スクリプト

Usage:
    python scripts/video/generate_tts_video.py \
        --config projects/my_project/sections.json \
        --output projects/my_project/output.mp4
"""

import argparse
from pathlib import Path
from shared.video_utils import (
    TTSGenerator, ImageGenerator, SubtitleGenerator,
    FFmpegComposer, SectionValidator
)
from shared.models import Section, ProjectConfig

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--voice', default='ja-JP-Neural2-D')
    parser.add_argument('--skip-audio', action='store_true')
    parser.add_argument('--skip-images', action='store_true')
    args = parser.parse_args()

    # Load config
    config = ProjectConfig.load(args.config)

    # Validate sections
    validator = SectionValidator()
    result = validator.validate(config.sections, config.video_duration)
    if not result.passed:
        print(f"❌ Validation failed: {result.errors}")
        return 1

    # Generate audio
    if not args.skip_audio:
        tts = TTSGenerator(voice=args.voice)
        tts.generate_batch(config.sections, config.audio_dir)

    # Generate images
    if not args.skip_images:
        img_gen = ImageGenerator()
        img_gen.generate_batch(config.image_prompts, config.image_dir)

    # Generate subtitles
    sub_gen = SubtitleGenerator(protected_words=config.protected_words)
    for section in config.sections:
        audio_path = config.audio_dir / f"{section.id}.mp3"
        srt_path = config.subtitle_dir / f"{section.id}.srt"
        sub_gen.generate_srt(section, audio_path, srt_path)

    # Compose segments
    composer = FFmpegComposer()
    segments = []
    for section in config.sections:
        segment_path = config.segment_dir / f"{section.id}.mp4"
        composer.create_segment(
            image=config.composite_dir / f"{section.id}.png",
            audio=config.audio_dir / f"{section.id}.mp3",
            subtitle=config.subtitle_dir / f"{section.id}.srt",
            output=segment_path
        )
        segments.append(segment_path)

    # Concat segments
    composer.concat_segments(segments, args.output)

    print(f"✅ Video generated: {args.output}")
    return 0

if __name__ == '__main__':
    exit(main())
```

---

### Phase 3: プロジェクト構造の標準化 ⏱️ 2-3時間

**目標**: 全プロジェクトを統一された構造に移行

#### 3.1 標準プロジェクト構造

```
projects/{project_name}/
├── config.json              # プロジェクト設定（NEW）
├── sections.json            # セクション定義
├── raw/                     # 元素材（任意）
│   └── source_video.mp4
├── work/                    # 作業ディレクトリ（自動生成）
│   ├── audio/
│   ├── images/
│   ├── composites/
│   ├── subtitles/
│   └── segments/
└── outputs/                 # 最終成果物
    └── final_video.mp4
```

#### 3.2 config.json フォーマット

```json
{
  "project_name": "obsidian_training_ep1",
  "version": "1.0",
  "video": {
    "duration": 535,
    "fps": 30,
    "resolution": [1920, 1080]
  },
  "audio": {
    "voice": "ja-JP-Neural2-D",
    "speaking_rate": 0.95
  },
  "subtitle": {
    "font": "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
    "font_size": 36,
    "protected_words": ["NotebookLM", "Obsidian", "Markdown"]
  },
  "layout": {
    "type": "75_25",
    "image_height": 810,
    "bar_height": 270,
    "bar_color": "#1A2A4A"
  },
  "paths": {
    "sections": "sections.json",
    "audio_dir": "work/audio",
    "image_dir": "work/images",
    "composite_dir": "work/composites",
    "subtitle_dir": "work/subtitles",
    "segment_dir": "work/segments",
    "output": "outputs/final_video.mp4"
  }
}
```

#### 3.3 移行スクリプト

```bash
# 既存プロジェクトを新構造に移行
python scripts/utils/migrate_project.py \
    --source projects/obsidian_training_ep2 \
    --template templates/standard_project
```

---

## 🔧 実装順序

### Step 1: 共通ライブラリ作成（優先度: 最高）
1. shared/video_utils/ ディレクトリ作成
2. tts.py 実装
3. subtitles.py 実装（固有名詞保護、読み/表示分離）
4. ffmpeg_utils.py 実装（-shortest禁止、-t duration使用）
5. composites.py 実装（ImageOps.fit()）
6. validation.py 実装

### Step 2: 統合スクリプト作成（優先度: 高）
1. scripts/video/generate_tts_video.py
2. scripts/video/generate_subtitle_video.py
3. scripts/audio/generate_audio_batch.py
4. scripts/image/create_composites_batch.py
5. scripts/subtitle/generate_subtitles.py

### Step 3: 既存プロジェクトの移行（優先度: 中）
1. テンプレートプロジェクト作成
2. obsidian_training_ep2 を移行（パイロット）
3. 残りのプロジェクトを順次移行

### Step 4: テストとドキュメント（優先度: 中）
1. ユニットテスト作成
2. インテグレーションテスト
3. README更新
4. スキルドキュメント更新

---

## 📦 削除対象（Phase 3以降）

### プロジェクト内の重複スクリプト（32個削除予定）
- projects/*/generate_audio.py → 統合スクリプトで代替
- projects/*/generate_subtitles*.py → 統合スクリプトで代替
- projects/*/create_composites.py → 統合スクリプトで代替
- projects/*/generate_video.py → 統合スクリプトで代替

### 旧スクリプト（統合後削除）
- scripts/gcloud_tts.py → shared/video_utils/tts.py に統合
- scripts/fishaudio_tts.py → 使用していないため削除

---

## ✅ 成功の指標

1. **コード行数**: 23プロジェクト × 平均300行 = 6,900行 → 共通ライブラリ1,500行 + スクリプト1,000行 = 2,500行（64%削減）
2. **重複スクリプト**: 32個 → 0個
3. **バグ修正**: 23箇所 → 1箇所
4. **新機能追加**: 23ファイル修正 → 1ファイル修正
5. **テストカバレッジ**: 0% → 80%以上

---

## 🚀 開始承認

このリファクタリング計画を実行しますか？

### 推定時間
- **Phase 1**: 2-3時間（共通ライブラリ）
- **Phase 2**: 3-4時間（統合スクリプト）
- **Phase 3**: 2-3時間（プロジェクト移行）
- **合計**: 7-10時間

### リスク
- **低**: 既存プロジェクトはそのまま残す（破壊的変更なし）
- **低**: 段階的移行（Phase 1完了後、Phase 2に進むか判断可能）

**承認してPhase 1から開始しますか？**
