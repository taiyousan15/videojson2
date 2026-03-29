#!/usr/bin/env python3
"""
FishAudio TTS Generator
すねーく博士のクローンボイスで音声を生成
"""

import os
import sys
from pathlib import Path

# .venv を使う場合
venv_path = Path(__file__).parent.parent / ".venv" / "lib" / "python3.13" / "site-packages"
if venv_path.exists():
    sys.path.insert(0, str(venv_path))

try:
    from fish_audio_sdk import Session, TTSRequest
except ImportError:
    # 他のPythonバージョン用
    for p in Path(__file__).parent.parent.glob(".venv/lib/python*/site-packages"):
        sys.path.insert(0, str(p))
    from fish_audio_sdk import Session, TTSRequest

# ============================================================
# 設定（ここを編集してください）
# ============================================================

# FishAudio APIキー（環境変数または直接設定）
API_KEY = os.environ.get("FISH_AUDIO_API_KEY", "YOUR_API_KEY_HERE")

# すねーく博士のモデルID（FishAudioでアップロードしたボイスのID）
# FishAudioのマイモデルページで確認できます
SUNAKE_HAKASE_MODEL_ID = os.environ.get("FISH_AUDIO_VOICE_ID", "YOUR_MODEL_ID_HERE")

# ============================================================
# 台本
# ============================================================

SCRIPT = """
AIの波に乗り遅れた未経験者にも朗報！
高額スクールに参加したのに「成果ゼロ」の方
各SNS集客に挫折し、売るスキルも商品もない方
講師と直接話せない「放置型スクール」に後悔した方
副業収入50万円の壁をどうしても超えられない方へ
まさか今のAIがバブル絶頂期だと勘違いしていませんか？

まだ成功者の99%も見落としている
2026年版の巨大な「第二次AIバブル」とは？

もう、小手先のAIノウハウは終焉！
""".strip()

# ============================================================
# メイン処理
# ============================================================

def generate_audio(text: str, output_path: str, model_id: str):
    """FishAudio APIで音声を生成"""

    if API_KEY == "YOUR_API_KEY_HERE":
        print("エラー: FISH_AUDIO_API_KEY を設定してください")
        print("  export FISH_AUDIO_API_KEY='your-api-key'")
        return False

    if model_id == "YOUR_MODEL_ID_HERE":
        print("エラー: FISH_AUDIO_VOICE_ID を設定してください")
        print("  export FISH_AUDIO_VOICE_ID='your-model-id'")
        print("\nすねーく博士のモデルIDはFishAudioで確認できます:")
        print("  https://fish.audio/my-models/")
        return False

    print(f"[FishAudio] モデルID: {model_id}")
    print(f"[FishAudio] テキスト: {text[:50]}...")
    print(f"[FishAudio] 出力先: {output_path}")

    try:
        session = Session(apikey=API_KEY)

        # TTSリクエスト
        request = TTSRequest(
            text=text,
            reference_id=model_id,  # すねーく博士のモデルID
            format="mp3",
        )

        # 音声を生成してファイルに保存
        with open(output_path, "wb") as f:
            for chunk in session.tts(request):
                f.write(chunk)

        print(f"[FishAudio] 完了: {output_path}")
        return True

    except Exception as e:
        print(f"[FishAudio] エラー: {e}")
        return False


def main():
    output_dir = Path(__file__).parent.parent / "output" / "fishaudio_test"
    output_dir.mkdir(parents=True, exist_ok=True)

    output_path = output_dir / "sunake_hakase_narration.mp3"

    print("=" * 60)
    print("FishAudio TTS - すねーく博士")
    print("=" * 60)
    print()
    print("台本:")
    print("-" * 40)
    print(SCRIPT)
    print("-" * 40)
    print()

    success = generate_audio(
        text=SCRIPT,
        output_path=str(output_path),
        model_id=SUNAKE_HAKASE_MODEL_ID
    )

    if success:
        print()
        print("=" * 60)
        print(f"音声ファイルが生成されました:")
        print(f"  {output_path}")
        print("=" * 60)


if __name__ == "__main__":
    main()
