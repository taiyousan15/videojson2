#!/usr/bin/env python3
"""
Phase 1-2/1-3: SSIM + pHash フィルタリング
"""
import csv
import cv2
import imagehash
from PIL import Image
from skimage.metrics import structural_similarity as ssim
import json

def load_scenes(csv_path):
    """PySceneDetect結果を読み込み"""
    scenes = []
    with open(csv_path, 'r') as f:
        lines = f.readlines()
        # 2行目がヘッダー
        for i, line in enumerate(lines):
            if i == 0 or i == 1:
                continue  # タイムコードリストとヘッダーをスキップ
            parts = line.strip().split(',')
            if len(parts) < 10:
                continue
            scenes.append({
                'scene_number': int(parts[0]),
                'start_time': float(parts[3]),
                'end_time': float(parts[6]),
                'length': float(parts[9])
            })
    return scenes

def extract_frame(video_path, timestamp):
    """指定時刻のフレームを抽出"""
    cap = cv2.VideoCapture(video_path)
    cap.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
    ret, frame = cap.read()
    cap.release()
    if ret:
        return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    return None

def calculate_ssim(frame1, frame2):
    """SSIM計算（構造的類似度）"""
    if frame1 is None or frame2 is None:
        return 0.0

    # グレースケール変換
    gray1 = cv2.cvtColor(frame1, cv2.COLOR_RGB2GRAY)
    gray2 = cv2.cvtColor(frame2, cv2.COLOR_RGB2GRAY)

    # SSIM計算
    score, _ = ssim(gray1, gray2, full=True)
    return score

def calculate_phash(frame):
    """pHash計算（知覚ハッシュ）"""
    if frame is None:
        return None
    pil_image = Image.fromarray(frame)
    return imagehash.phash(pil_image)

def filter_scenes(scenes, video_path, ssim_threshold=0.95, phash_threshold=5):
    """
    SSIM + pHash でフィルタリング
    - SSIM > 0.95: 隣接シーンが類似すぎる → 統合
    - pHash差 < 5: 重複 → 除去
    """
    print(f"=== Phase 1-2: SSIM フィルタリング (threshold={ssim_threshold}) ===")

    filtered = []
    prev_frame = None

    for i, scene in enumerate(scenes):
        # 中間時刻のフレーム抽出
        mid_time = (scene['start_time'] + scene['end_time']) / 2
        frame = extract_frame(video_path, mid_time)

        if prev_frame is not None:
            similarity = calculate_ssim(prev_frame, frame)
            if similarity > ssim_threshold:
                print(f"  Skip: Scene {scene['scene_number']} (SSIM={similarity:.3f} with previous)")
                continue

        filtered.append({
            'scene': scene,
            'frame': frame
        })
        prev_frame = frame

    print(f"  {len(scenes)} → {len(filtered)} scenes (SSIM filtered)")

    # Phase 1-3: pHash 重複除去
    print(f"\n=== Phase 1-3: pHash 重複除去 (threshold={phash_threshold}) ===")

    unique = []
    hashes = []

    for item in filtered:
        phash = calculate_phash(item['frame'])
        if phash is None:
            continue

        # 既存ハッシュと比較
        is_duplicate = False
        for existing_hash in hashes:
            if abs(phash - existing_hash) < phash_threshold:
                print(f"  Skip: Scene {item['scene']['scene_number']} (pHash duplicate)")
                is_duplicate = True
                break

        if not is_duplicate:
            unique.append(item['scene'])
            hashes.append(phash)

    print(f"  {len(filtered)} → {len(unique)} scenes (pHash filtered)")

    return unique

def main():
    scenes = load_scenes("input-Scenes.csv")
    print(f"Total scenes from PySceneDetect: {len(scenes)}")

    # 短すぎるシーンを除外（2秒未満）
    scenes = [s for s in scenes if s['length'] >= 2.0]
    print(f"After length filter (>=2s): {len(scenes)}")

    # SSIM + pHash フィルタリング
    filtered_scenes = filter_scenes(scenes, "input.mp4", ssim_threshold=0.95, phash_threshold=5)

    # 結果保存
    with open("work/filtered_scenes.json", "w", encoding="utf-8") as f:
        json.dump(filtered_scenes, f, indent=2, ensure_ascii=False)

    print(f"\n✓ Filtered scenes saved: {len(filtered_scenes)} sections")

if __name__ == "__main__":
    main()
