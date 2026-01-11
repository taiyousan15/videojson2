#!/usr/bin/env python3
"""
Phase 2-2: Ollama llama3.1:70b で翻訳（バッチ処理版）
複数セクションをまとめて翻訳することで効率化
"""
import json
import subprocess
import time

def translate_batch_with_ollama(sections_batch):
    """
    Ollama llama3.1:70b で複数セクションを一度に翻訳
    """
    # バッチプロンプト作成
    batch_text = ""
    for i, section in enumerate(sections_batch):
        batch_text += f"\n\n--- Section {i+1} ---\n{section['english_text']}"

    prompt = f"""Translate the following English text sections to Japanese.
Make them suitable for Text-to-Speech (TTS) narration:
- Convert numbers to Japanese reading (5 → ファイブ, 100% → ひゃくパーセント)
- Add reading hints for technical terms (AI → エーアイ, Meta → メタ, Cloud Code → クラウドコード)
- Use natural Japanese narration style
- Keep it concise and clear

Format your response as JSON array with this structure:
[
  {{"section": 1, "japanese": "翻訳されたテキスト"}},
  {{"section": 2, "japanese": "翻訳されたテキスト"}}
]

English sections:
{batch_text}

JSON response:"""

    # Ollamaコマンド実行（タイムアウト: 10分）
    result = subprocess.run(
        ["ollama", "run", "llama3.1:70b", prompt],
        capture_output=True,
        text=True,
        timeout=600
    )

    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        return None

    # JSON抽出
    output = result.stdout.strip()

    # JSON部分を探す
    try:
        # 最初の '[' から最後の ']' までを抽出
        start_idx = output.find('[')
        end_idx = output.rfind(']') + 1

        if start_idx == -1 or end_idx == 0:
            print(f"JSON not found in output")
            return None

        json_str = output[start_idx:end_idx]
        translations = json.loads(json_str)

        return translations

    except Exception as e:
        print(f"JSON parse error: {e}")
        return None

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
    print("=== Phase 2-2: Ollama llama3.1:70b 翻訳（バッチ処理版） ===\n")

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

    # 空のセクションを除外
    non_empty_sections = [s for s in merged_sections if s['english_text'].strip()]

    print(f"Translating {len(non_empty_sections)} sections (batch size: 5)...\n")

    # バッチ処理（5セクションずつ）
    batch_size = 5
    all_sections = merged_sections.copy()

    for batch_start in range(0, len(non_empty_sections), batch_size):
        batch_end = min(batch_start + batch_size, len(non_empty_sections))
        batch = non_empty_sections[batch_start:batch_end]

        print(f"Batch [{batch_start+1}-{batch_end}/{len(non_empty_sections)}]: ", end="", flush=True)

        # バッチ翻訳
        translations = translate_batch_with_ollama(batch)

        if translations:
            # 翻訳結果を統合
            for i, trans in enumerate(translations):
                section_idx = batch_start + i
                if section_idx < len(non_empty_sections):
                    # 元のall_sectionsから該当セクションを探して更新
                    for section in all_sections:
                        if section['scene_number'] == non_empty_sections[section_idx]['scene_number']:
                            section['japanese_narration'] = trans.get('japanese', '')
                            char_count = len(section['japanese_narration'])
                            print(f"✓", end="", flush=True)
                            break

            print(f" ({len(translations)} translated)")
        else:
            print(" FAILED")

        # API負荷軽減
        time.sleep(2)

    # 空のセクションにも空文字を設定
    for section in all_sections:
        if section['japanese_narration'] is None:
            section['japanese_narration'] = ""

    # 保存
    with open("work/sections_with_narration.json", "w", encoding="utf-8") as f:
        json.dump(all_sections, f, indent=2, ensure_ascii=False)

    print(f"\n✓ 翻訳完了: work/sections_with_narration.json")

if __name__ == "__main__":
    main()
