#!/usr/bin/env python3
"""
Google Cloud TTS Script - Neural2 Japanese Voice
"""

import json
import os
import sys
from pathlib import Path
from google.cloud import texttospeech

def synthesize_speech(text: str, output_path: str, voice_name: str = "ja-JP-Neural2-D"):
    """
    Synthesize speech from text using Google Cloud TTS Neural2 voice.

    Args:
        text: Text to synthesize
        output_path: Output file path
        voice_name: Voice name (default: ja-JP-Neural2-D - male)
            Other options:
            - ja-JP-Neural2-B (female)
            - ja-JP-Neural2-C (male)
            - ja-JP-Neural2-D (male, recommended)
    """
    client = texttospeech.TextToSpeechClient()

    synthesis_input = texttospeech.SynthesisInput(text=text)

    voice = texttospeech.VoiceSelectionParams(
        language_code="ja-JP",
        name=voice_name,
    )

    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=1.0,
        pitch=0.0,
    )

    response = client.synthesize_speech(
        input=synthesis_input,
        voice=voice,
        audio_config=audio_config
    )

    with open(output_path, "wb") as out:
        out.write(response.audio_content)

    print(f"  Audio saved to: {output_path}")
    return output_path


def generate_from_structure(structure_path: str, output_dir: str):
    """
    Generate TTS audio for all sections in structure.json.
    """
    with open(structure_path, "r", encoding="utf-8") as f:
        structure = json.load(f)

    os.makedirs(output_dir, exist_ok=True)

    sections = structure.get("sections", [])
    print(f"Generating audio for {len(sections)} sections...")

    for i, section in enumerate(sections, 1):
        section_id = section.get("id", f"section_{i}")
        narration = section.get("narration", "")

        if not narration:
            print(f"  [{i}] Skipping {section_id} - no narration")
            continue

        output_path = os.path.join(output_dir, f"{i:02d}_{section_id}.mp3")
        print(f"  [{i}] Generating: {section_id}")

        synthesize_speech(narration, output_path)

    print(f"\nDone! Generated {len(sections)} audio files.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python gcloud_tts.py <structure.json> [output_dir]")
        sys.exit(1)

    structure_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "audio"

    generate_from_structure(structure_path, output_dir)
