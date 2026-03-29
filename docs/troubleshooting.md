# トラブルシューティング

VideoJSON で発生しやすい問題と解決方法をまとめています。

## まず試すこと

```bash
# 環境をチェック
npm run doctor
```

doctor コマンドは環境の問題を診断し、対処法を案内します。

---

## ffmpeg 関連

### Q: 「ffmpeg が見つかりません」

**症状**: レンダリング時に `ffmpeg: command not found` と表示される

**解決方法**:

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get update
sudo apt-get install ffmpeg

# Windows
# https://ffmpeg.org/download.html からダウンロード
# PATH に追加する
```

インストール後、確認:
```bash
ffmpeg -version
```

---

## Whisper 関連

### Q: 「Whisper がインストールされていません」

**症状**: `--video` ルートで動画を分析しようとすると表示される

**解決方法（Python版推奨）**:
```bash
pip install openai-whisper
```

**解決方法（macOS whisper-cpp）**:
```bash
brew install whisper-cpp
```

**Whisper なしで使う方法**:

Whisper がなくても以下の方法で動画制作できます：

1. **SRT/VTT 字幕を使う**:
   ```bash
   npm run project:create -- --subtitles input.srt --out myproject
   ```

2. **YouTube 字幕を使う**:
   ```bash
   npm run project:create -- --youtube-url "https://..." --out myproject
   ```

3. **yt-dlp で字幕をダウンロード**:
   ```bash
   yt-dlp --write-auto-sub --sub-lang ja --skip-download "https://..."
   npm run project:create -- --subtitles "*.ja.vtt" --out myproject
   ```

---

## YouTube 字幕関連

### Q: 「YouTube字幕の取得に失敗しました」

**考えられる原因**:
- 動画に字幕が設定されていない
- 地域制限がある
- 年齢制限がある
- 非公開/限定公開の動画

**解決方法**:

1. **yt-dlp で試す**:
   ```bash
   yt-dlp --write-auto-sub --sub-lang ja --skip-download "URL"
   ```

2. **SRT/VTT ルートを使う**: 字幕ファイルがダウンロードできた場合
   ```bash
   npm run project:create -- --subtitles downloaded.vtt --out myproject
   ```

3. **Whisper ルートを使う**: 動画自体がダウンロードできる場合
   ```bash
   yt-dlp -f best "URL" -o video.mp4
   npm run project:create -- --video video.mp4 --out myproject
   ```

---

## 検証エラー

### Q: 「Missing in narration.md: s01, s02, ...」

**症状**: validate:strict で narration.md のセグメントが不足している

**原因**: narration.md のセグメント ID が structure.json と一致していない

**解決方法**:
1. structure.json のセグメント ID を確認
2. narration.md に対応するセクションがあるか確認
3. 不足しているセグメントを追加

```markdown
## s01
[話者: host]
ここに台本を書く

## s02
[話者: host]
ここに台本を書く
```

### Q: 「Schema validation failed」

**症状**: structure.json のスキーマ検証に失敗

**解決方法**:
1. エラーメッセージを確認（どのフィールドが問題か）
2. schemas/structure.schema.json の定義を確認
3. 必須フィールドを追加

**よくある問題**:
- `type` が不正（`intro`, `talk`, `demo`, `broll`, `cta`, `outro` のいずれか）
- `summary` が未設定
- `duration_ms` が 0 以下

---

## TTS 関連

### Q: 「No TTS segments found」

**症状**: レンダリング時に TTS セグメントが見つからない

**解決方法**:
- render.json で `audio.mode: "tts"` を使用しているか確認
- `audio.mode: "uploaded"` の場合は TTS は使用されません

### Q: 「ELEVENLABS_API_KEY が設定されていません」

**解決方法**:

1. `.env` ファイルを作成:
   ```bash
   cp .env.example .env
   ```

2. API キーを設定:
   ```
   ELEVENLABS_API_KEY=your_api_key
   ELEVENLABS_VOICE_ID=your_voice_id
   ```

3. 開発時は dummy プロバイダーを使用:
   ```
   VIDEOJSON_TTS_PROVIDER=dummy
   ```

---

## policy/consent 関連

### Q: 「Policy validation に警告が出る」

**症状**: validate:policy で警告が表示される

**これは正常です**: policy 検証は著作権や肖像権に関する注意を促すもので、エラーではありません。

**対応**:
1. 台本がオリジナルであることを確認
2. 使用する素材の権利を確認
3. 第三者の声や顔を使用していないことを確認

---

## 書き込み権限

### Q: 「書き込み権限がありません」

**症状**: ディレクトリに書き込めない

**解決方法**:
```bash
# 権限を確認
ls -la work/ outputs/

# 権限を変更
chmod 755 work/ outputs/

# または所有者を変更
chown $USER work/ outputs/
```

---

## Node.js 関連

### Q: 「Node.js 20 以上が必要です」

**解決方法**:

```bash
# nvm を使う場合
nvm install 20
nvm use 20

# 公式サイトから
# https://nodejs.org/ でダウンロード
```

### Q: 「node_modules が見つかりません」

**解決方法**:
```bash
npm install
```

---

## その他

### Q: どのルートを使えばいいかわからない

| 状況 | 推奨ルート |
|------|-----------|
| YouTube 動画がある | `--youtube-url` |
| SRT/VTT 字幕がある | `--subtitles`（ネット不要） |
| 動画ファイルがある | `--video`（Whisper必要） |
| CI/自動化したい | `--transcript`（ネット不要） |

### Q: コマンドがたくさんあって混乱する

**推奨フロー**:
1. `npm run doctor` - 環境チェック
2. `npm run project:create` - プロジェクト作成
3. narration.md を編集
4. `npm run project:run` - 動画生成

これで完結します。

---

## ヘルプを得る

- [GitHub Issues](https://github.com/taiyousan15/videojson2/issues) で質問・報告
- `npm run doctor` で環境を確認してからの問い合わせがスムーズです
