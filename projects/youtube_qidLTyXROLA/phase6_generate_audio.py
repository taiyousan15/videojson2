#!/usr/bin/env python3
"""
Phase 6: Google Cloud TTS Neural2-D音声生成
18セクションの日本語ナレーションを音声に変換
"""
import json
from google.cloud import texttospeech
from pathlib import Path

def generate_audio(section_id, scene_number, narration_text, output_dir):
    """Google Cloud TTS Neural2-Dで音声生成"""
    client = texttospeech.TextToSpeechClient()

    synthesis_input = texttospeech.SynthesisInput(text=narration_text)

    voice = texttospeech.VoiceSelectionParams(
        language_code="ja-JP",
        name="ja-JP-Neural2-D"  # 男性・明るい（研修向け推奨）
    )

    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=1.0,  # 標準速度
        pitch=0.0
    )

    response = client.synthesize_speech(
        input=synthesis_input,
        voice=voice,
        audio_config=audio_config
    )

    output_path = output_dir / f"scene_{scene_number}.mp3"
    with open(output_path, "wb") as out:
        out.write(response.audio_content)

    return output_path, len(response.audio_content)

def main():
    print("=== Phase 6: Google Cloud TTS Neural2-D 音声生成 ===\n")

    # 構造解析結果を読み込み
    with open("work/structure_analysis.json", "r") as f:
        sections = json.load(f)

    # 出力ディレクトリ作成
    audio_dir = Path("work/final_audio")
    audio_dir.mkdir(exist_ok=True, parents=True)

    # 各セクションの音声を生成
    print(f"Generating {len(sections)} audio files...\n")

    for i, section in enumerate(sections):
        narration = section.get('narration', '')

        if not narration.strip():
            print(f"[{i+1}/{len(sections)}] Scene {section['scene_number']}: No narration, skipping")
            continue

        print(f"[{i+1}/{len(sections)}] Scene {section['scene_number']}: ", end="", flush=True)

        try:
            output_path, size = generate_audio(
                f"s{i+1:02d}",
                section['scene_number'],
                narration,
                audio_dir
            )
            print(f"✓ {output_path.name} ({size} bytes)")
        except Exception as e:
            print(f"✗ Error: {e}")

    print(f"\n✓ 完了: 音声ファイルを生成しました")
    print(f"✓ 保存先: work/final_audio/")

if __name__ == "__main__":
    main()
