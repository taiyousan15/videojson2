# VideoJSON

動画をJSON形式で構造化し、台本・音声・スタイルを差し替えて新しい動画を生成するCLIツール。

**元動画の「構成」を参考に、中身は完全オリジナルの動画を作る** ための仕組みです。

## 3ステップで始める

```bash
# 1. 環境チェック
npm run doctor

# 2. プロジェクト作成（4つの入力ルートから選択）
npm run project:create -- --subtitles input.srt --out myproject

# 3. 台本を編集して動画生成
# myproject/narration.md を編集
npm run project:run -- --project myproject
```

完成した動画は `myproject/outputs/output.mp4` に出力されます。

## 前提条件

- Node.js 20 以上
- ffmpeg

```bash
npm install
npm run doctor  # 環境チェック
```

## 入力ルート

| あなたの状況 | コマンド |
|-------------|---------|
| YouTube動画がある | `--youtube-url "https://..."` |
| SRT/VTT字幕がある | `--subtitles input.srt` |
| ローカル動画がある | `--video input.mp4`（Whisper必要） |
| transcript.jsonがある | `--transcript data.json` |

```bash
# YouTube から（ネット必要）
npm run project:create -- --youtube-url "https://youtube.com/watch?v=..." --out myproject

# SRT/VTT 字幕から（ネット不要・初心者推奨）
npm run project:create -- --subtitles input.srt --out myproject

# ローカル動画から（Whisper必要）
npm run project:create -- --video input.mp4 --out myproject --language ja

# transcript.json から（CI向け）
npm run project:create -- --transcript data.json --out myproject
```

## プリセット

縦型ショートやYouTube標準など、フォーマット別のプリセットが使えます。

```bash
# 縦型ショート（TikTok/Reels/Shorts）
npm run project:create -- --subtitles input.srt --out shorts/ep01 --preset vertical-short

# YouTube 16:9
npm run project:create -- --subtitles input.srt --out youtube/ep01 --preset youtube-16x9
```

## 量産

1つのプロジェクトから複数フォーマットを一括生成：

```bash
npm run project:variants -- --project myproject
# → outputs/default/, outputs/vertical-short/, outputs/youtube-16x9/
```

## よくある詰まり

### ffmpeg が見つからない

```bash
# macOS
brew install ffmpeg

# Ubuntu
sudo apt-get install ffmpeg
```

### Whisper が見つからない

Whisper なしでも使えます。SRT/VTT 字幕ルートを使ってください：
```bash
npm run project:create -- --subtitles input.srt --out myproject
```

Whisper をインストールする場合：
```bash
pip install openai-whisper
```

### YouTube 字幕が取得できない

1. 動画に字幕が設定されていない可能性があります
2. `yt-dlp` で字幕をダウンロードしてください：
   ```bash
   yt-dlp --write-auto-sub --sub-lang ja --skip-download "URL"
   ```
3. ダウンロードした .vtt/.srt を使用：
   ```bash
   npm run project:create -- --subtitles downloaded.ja.vtt --out myproject
   ```

### 詳しいトラブルシューティング

→ [docs/troubleshooting.md](./docs/troubleshooting.md)

## 権利・許諾について

**重要**: このツールは「構成を参考にする」ためのものであり、「コピーを作る」ためのものではありません。

- 台本は必ずオリジナルに書き換えてください
- 第三者の声・顔の模倣は、明確な許可がない限り禁止です
- 本人の声・本人の素材を使う場合のみ許可されます
- `validate:policy` コマンドで著作権・肖像権のチェックができます

## コマンド一覧

| コマンド | 説明 |
|----------|------|
| `npm run doctor` | 環境チェック |
| `npm run project:create` | プロジェクト作成（推奨入口） |
| `npm run project:run` | 動画生成 |
| `npm run project:variants` | 複数プリセットで一括生成 |
| `npm run validate:strict` | 厳格な検証 |
| `npm run preview:html` | HTMLプレビュー生成 |

## ドキュメント

- [クイックスタート](./docs/quickstart.md) - 詳しい使い方
- [トラブルシューティング](./docs/troubleshooting.md) - 問題解決
- [設定ガイド](./docs/config.md) - 環境変数とプロバイダー
- [レンダリング](./docs/rendering.md) - 詳細なレンダリングオプション

## ライセンス

Private
