# 90%精度再現プロジェクト: qidLTyXROLA

## 対象動画
**タイトル**: ChatGPTより予測に強い！表形式に特化したAIの活用方法について解説してみた
**URL**: https://www.youtube.com/watch?v=qidLTyXROLA
**長さ**: 20分4秒 (1204秒)
**チャンネル**: にゃんたのAIチャンネル

---

## クイックスタート

### 1. 動画ダウンロード

```bash
yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" \
  -o "input.mp4" \
  "https://www.youtube.com/watch?v=qidLTyXROLA"
```

### 2. 完全版ワークフロー実行

```bash
python3 run_complete_workflow.py
```

**予想時間**: 約2時間37分
**予想コスト**: 約$0.92

---

## フェーズ別実行

個別にフェーズを実行したい場合:

### Phase 0: 動画ダウンロード
```bash
yt-dlp -f "best[ext=mp4]" -o "input.mp4" \
  "https://www.youtube.com/watch?v=qidLTyXROLA"
```

### Phase 1: セクション検出
```bash
scenedetect -i input.mp4 \
  detect-adaptive --threshold 3.0 \
  list-scenes --output work/scenes.csv
```

### Phase 2-1: 文字起こし
```bash
whisper input.mp4 \
  --model large-v3 \
  --language ja \
  --output_format json \
  --output_dir work/
```

### Phase 2-2: 翻訳・オリジナル化
```bash
python3 phase2_2_translate_batch.py
```

### Phase 2-3: 圧縮率計算
```bash
python3 phase2_5_compression_v2.py
```

### Phase 3: 構造解析
```bash
python3 phase3_structure_analysis.py
```

### Phase 4: NanoBanana背景画像生成
```bash
python3 phase4_nanobanana_generate.py
```

### Phase 5: 品質検証
```bash
python3 phase5_quality_verification.py
```

### Phase 6: 音声生成
```bash
python3 phase6_generate_audio.py
```

### Phase 7: Remotionテロップ生成
```bash
python3 phase7_remotion_telop.py
```

### Phase 8: 最終動画結合
```bash
python3 phase8_concat_remotion.py
```

---

## 90%精度の定義

| 項目 | 精度目標 | 検証方法 |
|------|----------|----------|
| **構造・フロー** | 100% | セクション数・長さの比較 |
| **台本内容** | 90%+ | 専門用語・説明順序の確認 |
| **背景画像品質** | 90%+ | 解像度・鮮明度の測定 |
| **テロップ配置** | 95%+ | 位置・スタイルの確認 |
| **音声品質** | 90%+ | 発音・速度の確認 |

---

## ディレクトリ構造

```
youtube_qidLTyXROLA/
├── README.md                          # このファイル
├── run_complete_workflow.py           # 完全版実行スクリプト
├── input.mp4                          # ダウンロード済み動画
├── final_video_remotion.mp4           # 最終出力動画
│
├── phase1_detect_scenes.py            # Phase 1
├── phase2_1_transcribe.py             # Phase 2-1
├── phase2_2_translate_batch.py        # Phase 2-2
├── phase2_5_compression_v2.py         # Phase 2-3
├── phase3_structure_analysis.py       # Phase 3
├── phase4_nanobanana_generate.py      # Phase 4
├── phase5_quality_verification.py     # Phase 5
├── phase6_generate_audio.py           # Phase 6
├── phase7_remotion_telop.py           # Phase 7
├── phase8_concat_remotion.py          # Phase 8
│
└── work/                              # 作業ディレクトリ
    ├── scenes.csv                     # セクション情報
    ├── input.json                     # Whisper出力
    ├── translated.txt                 # Ollama翻訳
    ├── structure_analysis.json        # 構造解析
    ├── narration.md                   # 台本
    ├── final_images/                  # NanoBanana背景
    ├── final_audio/                   # TTS音声
    └── remotion_segments/             # Remotionセグメント
```

---

## 必要な環境

### ソフトウェア
- Python 3.10+
- ffmpeg
- yt-dlp
- whisper (openai-whisper)
- scenedetect
- ollama (llama3.1:70b)
- Node.js 18+ (Remotion)

### APIキー
- Google Cloud TTS API Key
- NanoBanana (Gemini) アクセス (500枚/日無料)

### インストール
```bash
# Python パッケージ
pip install openai-whisper scenedetect yt-dlp

# Ollama
brew install ollama
ollama pull llama3.1:70b

# Remotion
cd ../../remotion-telop
npm install
```

---

## トラブルシューティング

### 問題: セクション数が多すぎる (100+)
**解決**: PySceneDetectの閾値を上げる
```bash
scenedetect -i input.mp4 detect-adaptive --threshold 5.0 list-scenes
```

### 問題: NanoBananaレート制限
**解決**: 待機時間を10秒に延長
```python
# phase4_nanobanana_generate.py
time.sleep(10)  # 5秒 → 10秒
```

### 問題: Remotionフォントエラー
**解決**: 既に修正済み (CDN + システムフォント)

### 問題: 音声と映像のズレ
**解決**: 音声長さを正確に取得するコードを確認

---

## 90%精度検証チェックリスト

実行後、以下を確認してください:

### 構造・フロー (100%)
- [ ] セクション数が元動画と±5%以内
- [ ] 各セクションの長さが±10%以内
- [ ] 画面遷移のタイミングが一致

### 台本内容 (90%+)
- [ ] 専門用語が全て正確
- [ ] 説明の順序が同じ
- [ ] 重要ポイントが全て含まれる
- [ ] 文字数が元動画の70-80%

### 背景画像品質 (90%+)
- [ ] 全画像が1920x1080
- [ ] テキストが一切含まれない
- [ ] レイアウトが元スライドと類似
- [ ] 視覚的に高品質

### テロップ配置 (95%+)
- [ ] lecture スタイルで統一
- [ ] 画面下部10%に配置
- [ ] フェードアニメーション
- [ ] 読みと表示の正しい変換

### 音声品質 (90%+)
- [ ] Google Cloud TTS Neural2-D 使用
- [ ] 発音が自然
- [ ] 速度が適切 (1.0x)
- [ ] 音量が適切

### 全体品質
- [ ] 総再生時間が元動画±5%以内 (1204秒 → 1144-1264秒)
- [ ] セグメント間のギャップなし
- [ ] 音声と映像の同期
- [ ] 最終ファイルサイズ: 20-40MB

---

## コスト見積もり

20分動画、50セクション想定:

| サービス | 使用量 | コスト |
|---------|--------|--------|
| Whisper large-v3 | 20分 | $0.12 |
| Ollama llama3.1:70b | ローカル | 無料 |
| NanoBanana (Gemini) | 50画像 | 無料 |
| Google Cloud TTS Neural2 | 50リクエスト | $0.80 |
| **合計** | - | **$0.92** |

---

## 次のステップ

1. **動画ダウンロード**: `yt-dlp` で input.mp4 を取得
2. **ワークフロー実行**: `python3 run_complete_workflow.py`
3. **品質検証**: 90%精度チェックリストで確認
4. **改善**: 必要に応じてパラメータ調整

---

## 参考ドキュメント

- [完全版ワークフロー詳細](../../.claude/COMPLETE_90_PERCENT_WORKFLOW.md)
- [リポジトリルール](../../.claude/CLAUDE.md)
- [NanoBanana統合](../../.claude/NANABANA_METAPROMPT_INTEGRATION.md)

---

## サポート

問題が発生した場合:
1. GitHub Issues: https://github.com/taiyousan15/videojson2/issues
2. ドキュメント確認: `.claude/` ディレクトリ
3. ログ確認: `work/` ディレクトリ

---

**🎯 このワークフローで90%精度の再現動画を生成できます！**
