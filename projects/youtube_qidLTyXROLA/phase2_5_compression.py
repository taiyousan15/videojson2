#!/usr/bin/env python3
"""
Phase 2.5: 圧縮率計算（±15秒許容範囲）
"""
import json

def calculate_compression(original_duration, compression_rate=0.40, tolerance=15):
    """
    圧縮ターゲット時間を計算

    Args:
        original_duration: 元動画の長さ（秒）
        compression_rate: 圧縮率（デフォルト: 0.40 = 40%）
        tolerance: 許容範囲（秒）

    Returns:
        dict: target, min, max 秒数
    """
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
    """
    ナレーション時間を推定
    日本語: 1文字 = 0.15秒
    """
    char_count = len(text)
    duration = char_count * char_per_second
    return {
        'char_count': char_count,
        'estimated_duration': duration
    }

def score_section_importance(section, transcript_data):
    """
    セクションの重要度をスコアリング（0-20点）

    スコア内訳:
    - data_richness: 5点 (データ・数値の量)
    - examples: 3点 (具体例の有無)
    - keywords: 3点 (キーワード密度)
    - chapter_boundary: 2点 (チャプター境界)
    - audience_retention: 3点 (視聴維持率 - 仮想)
    - length: 2点 (セグメント長)
    - position: 2点 (位置: 導入/結論は高)
    """
    score = 0

    # この関数は後でWhisperの結果に基づいて実装
    # 仮のスコア
    score = 10  # デフォルト中間スコア

    return score

def select_sections_by_importance(sections, target_config):
    """
    重要度順にセクションを選択

    アルゴリズム:
    1. セクションを重要度でソート
    2. 重要度が高い順に選択
    3. min_secondsに到達するまで累積
    4. max_secondsを超えないようにチェック
    """
    # 重要度でソート（降順）
    sorted_sections = sorted(sections, key=lambda s: s.get('importance_score', 0), reverse=True)

    selected = []
    total_duration = 0
    min_seconds = target_config['min_seconds']
    max_seconds = target_config['max_seconds']

    for section in sorted_sections:
        # ナレーション時間推定（仮）
        section_duration = section.get('estimated_duration', section.get('length', 10))

        # min_secondsに到達していない場合は追加
        if total_duration < min_seconds:
            selected.append(section)
            total_duration += section_duration
        # min_secondsに到達したが、まだmax_seconds以内なら高スコアのみ追加
        elif total_duration < max_seconds and section.get('importance_score', 0) >= 15:
            selected.append(section)
            total_duration += section_duration
        else:
            break

    return {
        'selected_sections': selected,
        'total_duration': total_duration,
        'within_tolerance': min_seconds <= total_duration <= max_seconds,
        'count': len(selected)
    }

def main():
    # 元動画の長さ
    original_duration = 1642  # 27分22秒

    # 圧縮率計算
    target_config = calculate_compression(original_duration, compression_rate=0.40)

    print("=== Phase 2.5: 圧縮率計算 ===")
    print(f"元動画: {int(original_duration // 60)}分{int(original_duration % 60)}秒")
    print(f"圧縮率: {target_config['compression_rate'] * 100}%")
    print(f"ターゲット: {int(target_config['target_seconds'] // 60)}分{int(target_config['target_seconds'] % 60)}秒")
    print(f"許容範囲: {int(target_config['min_seconds'] // 60)}分{int(target_config['min_seconds'] % 60)}秒 ～ {int(target_config['max_seconds'] // 60)}分{int(target_config['max_seconds'] % 60)}秒")
    print(f"(±{target_config['tolerance']}秒)")

    # filtered_scenes.jsonを読み込み
    with open("work/filtered_scenes.json", "r") as f:
        sections = json.load(f)

    print(f"\nフィルタリング後セクション数: {len(sections)}")

    # 重要度スコアを仮設定（Phase 2完了後に実際のデータで再計算）
    for i, section in enumerate(sections):
        section['importance_score'] = 10  # デフォルト
        section['estimated_duration'] = section.get('length', 10)

    # セクション選択
    result = select_sections_by_importance(sections, target_config)

    print(f"\n選択されたセクション: {result['count']}個")
    print(f"合計時間: {int(result['total_duration'] // 60)}分{int(result['total_duration'] % 60)}秒")
    print(f"許容範囲内: {'✓' if result['within_tolerance'] else '✗'}")

    # 保存
    output = {
        'target_config': target_config,
        'selected_sections': result['selected_sections'],
        'total_duration': result['total_duration'],
        'within_tolerance': result['within_tolerance']
    }

    with open("work/compression_plan.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print("\n✓ 圧縮計画を保存しました: work/compression_plan.json")

if __name__ == "__main__":
    main()
