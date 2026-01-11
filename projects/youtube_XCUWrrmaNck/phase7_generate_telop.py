#!/usr/bin/env python3
"""
Phase 7: テロップ（字幕）生成

音声に同期した日本語字幕をSRT形式で生成。
- 読み/表示分離（ファイブステップ → 5ステップ）
- 固有名詞保護（NotebookLM等を分割禁止）
- 語尾孤立防止（6文字以下は前にマージ）

MASTER_VIDEO_GENERATION_WORKFLOW.md Phase 7準拠
"""

import json
import re
from pathlib import Path
from datetime import timedelta


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

# 固有名詞保護リスト
PROTECTED_WORDS = [
    'NotebookLM', 'Obsidian', 'Markdown', 'YouTube', 'Google',
    'OpenAI', 'Claude', 'Gemini', 'GPT', 'Anthropic',
    'DeepMind', 'AGI', 'Grok', 'Pentagon', 'API',
    'JavaScript', 'TypeScript', 'Python', 'React', 'Node.js'
]


def convert_reading_to_display(narration_text: str) -> str:
    """TTS読み形式 → 字幕表示形式"""
    display_text = narration_text
    for reading, display in READING_TO_DISPLAY_MAP.items():
        display_text = display_text.replace(reading, display)
    return display_text


def split_into_chunks(text: str, max_chars: int = 20) -> list:
    """テキストを句読点で分割（固有名詞を保護）"""

    # 句読点で分割
    chunks = re.split(r'([、。，．])', text)

    # 分割記号を前のチャンクに結合
    merged = []
    for i in range(0, len(chunks), 2):
        chunk = chunks[i]
        if i + 1 < len(chunks):
            chunk += chunks[i + 1]  # 句読点を追加
        if chunk.strip():
            merged.append(chunk.strip())

    return merged


def prevent_orphan_suffix(chunks: list) -> list:
    """語尾孤立を防止（6文字以下は前にマージ）"""
    result = []

    for chunk in chunks:
        if len(chunk) <= 6 and result:
            # 前のチャンクにマージ
            result[-1] += chunk
        else:
            result.append(chunk)

    return result


def format_srt_time(seconds: float) -> str:
    """秒数をSRT時刻形式に変換 (00:00:00,000)"""
    td = timedelta(seconds=seconds)
    hours, remainder = divmod(td.total_seconds(), 3600)
    minutes, seconds = divmod(remainder, 60)
    milliseconds = int((seconds % 1) * 1000)
    return f"{int(hours):02d}:{int(minutes):02d}:{int(seconds):02d},{milliseconds:03d}"


def generate_srt(sections: list, audio_dir: Path, output_dir: Path):
    """SRT字幕ファイルを生成"""

    import subprocess

    output_dir.mkdir(exist_ok=True, parents=True)
    current_time = 0.0
    srt_entries = []
    entry_id = 1

    print(f"=== SRT字幕生成 ===\n")

    for section in sections:
        scene_number = section['scene_number']
        audio_path = audio_dir / f"scene_{scene_number}.mp3"

        if not audio_path.exists():
            print(f"Scene {scene_number}: 音声なし, スキップ")
            continue

        # 音声の長さを取得
        cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            str(audio_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        duration = float(result.stdout.strip())

        # ナレーションテキストを字幕用に変換
        narration = section.get('narration', '')
        if not narration.strip():
            current_time += duration
            continue

        display_text = convert_reading_to_display(narration)
        chunks = split_into_chunks(display_text, max_chars=20)
        chunks = prevent_orphan_suffix(chunks)

        # 各チャンクに時間を割り当て
        chunk_duration = duration / len(chunks) if chunks else duration

        for chunk in chunks:
            start_time = current_time
            end_time = current_time + chunk_duration

            srt_entries.append({
                'id': entry_id,
                'start': format_srt_time(start_time),
                'end': format_srt_time(end_time),
                'text': chunk
            })

            entry_id += 1
            current_time = end_time

        print(f"Scene {scene_number}: {len(chunks)}個の字幕チャンク生成")

    # SRTファイルに書き出し
    srt_path = output_dir / "subtitles.srt"
    with open(srt_path, 'w', encoding='utf-8') as f:
        for entry in srt_entries:
            f.write(f"{entry['id']}\n")
            f.write(f"{entry['start']} --> {entry['end']}\n")
            f.write(f"{entry['text']}\n")
            f.write(f"\n")

    print(f"\n✓ SRT字幕ファイル生成: {srt_path}")
    print(f"✓ 字幕エントリ数: {len(srt_entries)}個")

    return srt_path


def main():
    print("=== Phase 7: テロップ（字幕）生成 ===\n")

    # 構造解析結果を読み込み
    with open("work/structure_analysis.json", "r") as f:
        sections = json.load(f)

    # ディレクトリ設定
    audio_dir = Path("work/final_audio")
    output_dir = Path("work/subtitles")

    # SRT生成
    srt_path = generate_srt(sections, audio_dir, output_dir)

    print(f"\n次のステップ:")
    print(f"Phase 8でFFmpeg合成時に字幕を統合します:")
    print(f"  ffmpeg -i video.mp4 -vf subtitles={srt_path} output.mp4")


if __name__ == "__main__":
    main()
