# 🚀 クイックスタートガイド

## 対象動画
**URL**: https://www.youtube.com/watch?v=qidLTyXROLA
**タイトル**: ChatGPTより予測に強い！表形式に特化したAIの活用方法について解説してみた
**長さ**: 20分4秒

---

## ⚡ 3ステップで90%精度再現動画を生成

### Step 1: 環境確認 (初回のみ)

```bash
# 必要なソフトウェアがインストールされているか確認
which ffmpeg yt-dlp whisper scenedetect ollama node

# インストールされていない場合
brew install ffmpeg yt-dlp
pip install openai-whisper scenedetect
brew install ollama
ollama pull llama3.1:70b
```

### Step 2: ワークフロー実行

```bash
# プロジェクトディレクトリに移動
cd /Users/matsumototoshihiko/Desktop/テスト開発/videoJSON2/projects/youtube_qidLTyXROLA

# 完全版ワークフロー実行
python3 run_complete_workflow.py
```

**予想時間**: 約2時間37分
**予想コスト**: 約$0.92

### Step 3: 完成動画確認

```bash
# 動画を開く
open final_video_remotion.mp4

# 動画情報確認
ffprobe -v error -show_entries format=duration,size final_video_remotion.mp4
```

---

## 📊 実行中の表示

ワークフロー実行中、以下のような表示が出ます:

```
============================================================
  90%精度再現 完全版ワークフロー
  対象動画: https://www.youtube.com/watch?v=qidLTyXROLA
============================================================

============================================================
Phase 0: 動画ダウンロード
============================================================

▶ 動画をダウンロード中...
✓ 完了 (45.2秒)

============================================================
Phase 1: セクション検出 (PySceneDetect)
============================================================

▶ PySceneDetect実行中...
✓ 完了 (180.5秒)

...

============================================================
  🎉 90%精度再現動画の生成が完了しました！
============================================================

✓ 動画を確認してください: final_video_remotion.mp4
```

---

## 🔍 90%精度検証チェックリスト

完成後、以下を確認:

### 構造・フロー (100%)
- [ ] セクション数が元動画と±5%以内
- [ ] 総再生時間が元動画±5%以内 (1204秒 → 1144-1264秒)

### 台本内容 (90%+)
- [ ] 専門用語が正確 (ChatGPT, LightGBM, XGBoost, Claude Code)
- [ ] 説明の順序が同じ
- [ ] 重要ポイントが全て含まれる

### 背景画像品質 (90%+)
- [ ] 全画像が1920x1080
- [ ] テキストが一切含まれない
- [ ] NanoBananaで生成された高品質画像

### テロップ (95%+)
- [ ] lecture スタイル (画面下部10%、半透明黒背景)
- [ ] フェードイン・アウトアニメーション
- [ ] 読みと表示の正しい変換 (90% → 90%)

### 音声品質 (90%+)
- [ ] Google Cloud TTS Neural2-D
- [ ] 自然な日本語発音
- [ ] 適切な速度と音量

---

## 💡 各フェーズの詳細

### Phase 0: 動画ダウンロード (5分)
- yt-dlp で最高品質ダウンロード
- 1920x1080, 20分動画 → 約86MB

### Phase 1: セクション検出 (3分)
- PySceneDetect で画面切り替え検出
- 予想: 40-60セクション

### Phase 2-1: 文字起こし (25分)
- Whisper large-v3 で高精度文字起こし
- 日本語音声 → テキスト

### Phase 2-2: 台本オリジナル化 (15分)
- Ollama llama3.1:70b で表現書き換え
- 専門用語は維持、説明順序も維持

### Phase 2-3: 圧縮率計算 (1分)
- 目標: 70-80%圧縮 (約14,000-16,000文字)

### Phase 3: 構造解析 (30分)
- Ollama Vision で各セクションのフレーム解析
- タイトル、テキスト、レイアウトを抽出

### Phase 4: NanoBanana背景生成 (30分)
- Google Gemini で高品質背景画像生成
- 1920x1080、テキストなし、モダンなデザイン

### Phase 5: 品質検証 (5分)
- 解像度、ファイルサイズ、鮮明度をチェック
- 不合格の画像は再生成

### Phase 6: 音声生成 (10分)
- Google Cloud TTS Neural2-D
- 自然な日本語音声

### Phase 7: Remotionテロップ (30分)
- 背景 + 音声 + テロップを統合
- lecture スタイル、フェードアニメーション

### Phase 8: 動画結合 (3分)
- 全セグメントをffmpegで結合
- 最終動画: final_video_remotion.mp4

---

## ❗ トラブルシューティング

### 問題: "whisper: command not found"
```bash
pip install openai-whisper
```

### 問題: "ollama: command not found"
```bash
brew install ollama
ollama serve &
ollama pull llama3.1:70b
```

### 問題: NanoBananaレート制限
- 1日500枚まで無料
- 翌日まで待つか、待機時間を10秒に延長

### 問題: Google Cloud TTS APIエラー
```bash
# APIキーを設定
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
```

### 問題: Remotionフォントエラー
- 既に修正済み (CDN + システムフォント)
- 再実行すれば正常に動作

---

## 📈 進捗確認

各フェーズの出力ファイルで進捗を確認:

```bash
# Phase 1: セクション検出
cat work/scenes.csv

# Phase 2-1: 文字起こし
cat work/input.json | jq '.text' | wc -c

# Phase 3: 構造解析
cat work/structure_analysis.json | jq '.sections | length'

# Phase 4: 画像生成
ls work/final_images/*.png | wc -l

# Phase 6: 音声生成
ls work/final_audio/*.mp3 | wc -l

# Phase 7: セグメント動画
ls work/remotion_segments/*.mp4 | wc -l
```

---

## 🎯 次のステップ

1. **ワークフロー実行**
   ```bash
   python3 run_complete_workflow.py
   ```

2. **完成動画確認**
   ```bash
   open final_video_remotion.mp4
   ```

3. **90%精度検証**
   - チェックリストで品質確認

4. **必要に応じて調整**
   - セクション分割の閾値調整
   - 圧縮率の調整
   - NanoBananaプロンプトの改善

---

## 📚 参考ドキュメント

- [README.md](./README.md) - 詳細な使用方法
- [COMPLETE_90_PERCENT_WORKFLOW.md](../../.claude/COMPLETE_90_PERCENT_WORKFLOW.md) - 完全版ワークフロー詳細
- [CLAUDE.md](../../.claude/CLAUDE.md) - リポジトリルール

---

## 💰 コスト内訳

| サービス | 使用量 | コスト |
|---------|--------|--------|
| Whisper large-v3 | 20分 | $0.12 |
| Ollama llama3.1:70b | ローカル | 無料 |
| NanoBanana (Gemini) | 50画像 | 無料 (500枚/日) |
| Google Cloud TTS Neural2 | 50リクエスト | $0.80 |
| **合計** | - | **$0.92** |

---

**🎬 さあ、90%精度の再現動画を作りましょう！**

```bash
python3 run_complete_workflow.py
```
