#!/usr/bin/env python3
"""
Phase 2.5: 圧縮率計算 v2（実際のナレーション文字数を使用）
"""
import json

def calculate_compression(original_duration, compression_rate=0.40, tolerance=15):
    """圧縮ターゲット時間を計算"""
    target_seconds = int(original_duration * compression_rate)
    min_seconds = target_seconds - tolerance
    max_seconds = target_seconds + tolerance

    return {
        'original_seconds': original_duration,
        'compression_rate': compression_rate,
        'target_seconds': target_seconds,
        'min_seconds': min_seconds,
        'max_seconds': max_seconds,
        'tolerance': tolerance
    }

def estimate_narration_duration(text, char_per_second=0.15):
    """ナレーション時間を推定（日本語: 1文字 = 0.15秒）"""
    char_count = len(text)
    duration = char_count * char_per_second
    return duration

def score_section_importance(section, index, total_sections):
    """
    セクションの重要度をスコアリング（簡易版）
    - 長いセクション: 高スコア（情報量が多い）
    - 最初と最後: 高スコア（導入と結論）
    - 中央: 中スコア
    """
    score = 10  # ベーススコア

    # 長さスコア（0-5点）
    duration = section.get('narration_duration', 0)
    if duration > 20:
        score += 5
    elif duration > 10:
        score += 3
    elif duration > 5:
        score += 1

    # 位置スコア（0-5点）
    if index < 3:  # 最初の3セクション
        score += 5
    elif index >= total_sections - 3:  # 最後の3セクション
        score += 5
    elif index >= total_sections // 3 and index < 2 * total_sections // 3:  # 中央
        score += 2

    return score

def select_sections_by_importance(sections, target_config):
    """
    重要度順にセクションを選択し、±15秒以内に収める
    """
    # 重要度スコアを計算
    for i, section in enumerate(sections):
        section['importance_score'] = score_section_importance(section, i, len(sections))

    # 重要度でソート（降順）
    sorted_sections = sorted(sections, key=lambda s: s['importance_score'], reverse=True)

    min_seconds = target_config['min_seconds']
    max_seconds = target_config['max_seconds']

    selected = []
    total_duration = 0

    # min_secondsに到達するまで選択
    for section in sorted_sections:
        section_duration = section['narration_duration']

        if total_duration + section_duration <= max_seconds:
            selected.append(section)
            total_duration += section_duration

            # min_secondsに到達したらチェック
            if total_duration >= min_seconds:
                break

    # min_secondsに到達していない場合、さらに追加
    if total_duration < min_seconds:
        remaining = [s for s in sorted_sections if s not in selected]
        for section in remaining:
            if total_duration + section['narration_duration'] <= max_seconds:
                selected.append(section)
                total_duration += section['narration_duration']

                if total_duration >= min_seconds:
                    break

    # 時系列順にソート
    selected_sorted = sorted(selected, key=lambda s: s['start_time'])

    return {
        'selected_sections': selected_sorted,
        'total_duration': total_duration,
        'within_tolerance': min_seconds <= total_duration <= max_seconds,
        'count': len(selected_sorted)
    }

def main():
    print("=== Phase 2.5: 圧縮率計算 v2（実際のナレーション文字数）===\n")

    # 元動画の長さ
    original_duration = 1642  # 27分22秒

    # 圧縮率計算
    target_config = calculate_compression(original_duration, compression_rate=0.40)

    print(f"元動画: {int(original_duration // 60)}分{int(original_duration % 60)}秒")
    print(f"圧縮率: {target_config['compression_rate'] * 100}%")
    print(f"ターゲット: {int(target_config['target_seconds'] // 60)}分{int(target_config['target_seconds'] % 60)}秒")
    print(f"許容範囲: {int(target_config['min_seconds'] // 60)}分{int(target_config['min_seconds'] % 60)}秒 ～ {int(target_config['max_seconds'] // 60)}分{int(target_config['max_seconds'] % 60)}秒")
    print(f"(±{target_config['tolerance']}秒)\n")

    # sections_with_narration.jsonを読み込み
    with open("work/sections_with_narration.json", "r") as f:
        sections = json.load(f)

    # ナレーション時間を計算
    for section in sections:
        narration = section.get('japanese_narration', '')
        section['narration_duration'] = estimate_narration_duration(narration)
        section['narration_char_count'] = len(narration)

    print(f"総セクション数: {len(sections)}")
    total_chars = sum(s['narration_char_count'] for s in sections)
    total_duration = sum(s['narration_duration'] for s in sections)
    print(f"総文字数: {total_chars}文字")
    print(f"総時間: {int(total_duration // 60)}分{int(total_duration % 60)}秒\n")

    # セクション選択
    result = select_sections_by_importance(sections, target_config)

    print(f"選択されたセクション: {result['count']}個")
    selected_chars = sum(s['narration_char_count'] for s in result['selected_sections'])
    print(f"選択文字数: {selected_chars}文字")
    print(f"合計時間: {int(result['total_duration'] // 60)}分{int(result['total_duration'] % 60)}秒")
    print(f"許容範囲内: {'✓' if result['within_tolerance'] else '✗'}\n")

    # 保存
    output = {
        'target_config': target_config,
        'selected_sections': result['selected_sections'],
        'total_duration': result['total_duration'],
        'total_char_count': selected_chars,
        'within_tolerance': result['within_tolerance']
    }

    with open("work/compression_plan_v2.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"✓ 圧縮計画を保存しました: work/compression_plan_v2.json")

if __name__ == "__main__":
    main()
