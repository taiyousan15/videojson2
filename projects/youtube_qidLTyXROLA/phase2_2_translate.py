#!/usr/bin/env python3
"""
Phase 2-2: Ollama llama3.1:70b で翻訳
Whisperの文字起こしを日本語に翻訳し、TTS読み上げ形式に変換
"""
import json
import subprocess
import time

def translate_with_ollama(english_text):
    """
    Ollama llama3.1:70b で英語→日本語翻訳

    TTS読み上げ形式に変換:
    - 数字は読み仮名に変換（5 → ファイブ）
    - 専門用語は読み仮名追加（AI → エーアイ）
    """
    prompt = f"""Translate the following English text to Japanese.
Make it suitable for Text-to-Speech (TTS) narration:
- Convert numbers to Japanese reading (5 → ファイブ, 100% → ひゃくパーセント)
- Add reading hints for technical terms (AI → エーアイ, Meta → メタ)
- Use natural Japanese narration style
- Keep it concise and clear

English text:
{english_text}

Japanese translation (TTS format):"""

    # Ollamaコマンド実行（タイムアウト: 5分）
    result = subprocess.run(
        ["ollama", "run", "llama3.1:70b", prompt],
        capture_output=True,
        text=True,
        timeout=300
    )

    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        return None

    # 出力から翻訳結果を抽出
    translation = result.stdout.strip()

    # 余分なプロンプトやメタ情報を削除
    if "\n\n" in translation:
        translation = translation.split("\n\n")[-1]

    return translation

def merge_transcript_with_sections(whisper_data, sections_data):
    """
    Whisperの文字起こしとセクション情報を統合
    """
    segments = whisper_data['segments']
    sections = sections_data

    result_sections = []

    for section in sections:
        start_time = section['start_time']
        end_time = section['end_time']

        # この区間のWhisperセグメントを抽出
        section_segments = [
            seg for seg in segments
            if seg['start'] >= start_time and seg['end'] <= end_time
        ]

        # 英語テキストを結合
        english_text = " ".join([seg['text'].strip() for seg in section_segments])

        result_sections.append({
            'scene_number': section['scene_number'],
            'start_time': start_time,
            'end_time': end_time,
            'length': section['length'],
            'english_text': english_text,
            'japanese_narration': None  # 後で翻訳
        })

    return result_sections

def main():
    print("=== Phase 2-2: Ollama llama3.1:70b 翻訳 ===\n")

    # Whisper結果を読み込み
    with open("work/input.json", "r") as f:
        whisper_data = json.load(f)

    print(f"Whisper segments: {len(whisper_data['segments'])}")

    # セクション情報を読み込み
    with open("work/filtered_scenes.json", "r") as f:
        sections_data = json.load(f)

    print(f"Filtered sections: {len(sections_data)}\n")

    # 統合
    merged_sections = merge_transcript_with_sections(whisper_data, sections_data)

    print(f"Translating {len(merged_sections)} sections with Ollama llama3.1:70b...\n")

    # 翻訳実行
    for i, section in enumerate(merged_sections):
        print(f"[{i+1}/{len(merged_sections)}] Scene {section['scene_number']}: ", end="", flush=True)

        if not section['english_text'].strip():
            print("No text, skipping")
            section['japanese_narration'] = ""
            continue

        # 翻訳
        japanese = translate_with_ollama(section['english_text'])

        if japanese:
            section['japanese_narration'] = japanese
            # 文字数を表示
            char_count = len(japanese)
            print(f"{char_count} chars")
        else:
            print("FAILED")
            section['japanese_narration'] = ""

        # API負荷軽減のため少し待機
        time.sleep(1)

    # 保存
    with open("work/sections_with_narration.json", "w", encoding="utf-8") as f:
        json.dump(merged_sections, f, indent=2, ensure_ascii=False)

    print(f"\n✓ 翻訳完了: work/sections_with_narration.json")

if __name__ == "__main__":
    main()
