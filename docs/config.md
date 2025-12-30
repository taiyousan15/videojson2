# 設定ガイド（.env と Provider）

このドキュメントでは、VideoJSON の環境設定とプロバイダーの選び方を説明します。

## 1. 基本設定（.env）

### セットアップ手順

```bash
# 1. .env.example をコピー
cp .env.example .env

# 2. 必要な値を編集
# 最小構成では以下のみ設定すればOK
VIDEOJSON_WORKDIR=.tmp
VIDEOJSON_TTS_PROVIDER=dummy
```

### 設定項目一覧

| 環境変数 | 必須 | デフォルト | 説明 |
|----------|------|-----------|------|
| `VIDEOJSON_WORKDIR` | - | `.tmp` | 生成ファイルの保存先 |
| `VIDEOJSON_TTS_PROVIDER` | - | `dummy` | TTS プロバイダー名 |
| `ELEVENLABS_API_KEY` | △ | - | ElevenLabs 使用時のみ必須 |
| `ELEVENLABS_VOICE_ID` | △ | - | ElevenLabs 使用時のみ必須 |
| `NARRATION_PROVIDER` | - | `skeleton` | 台本生成プロバイダー |
| `OPENAI_API_KEY` | △ | - | OpenAI 使用時のみ必須 |
| `ANTHROPIC_API_KEY` | △ | - | Anthropic 使用時のみ必須 |
| `OLLAMA_MODEL` | - | `llama2` | Ollama モデル名 |

## 2. プロバイダーの選び方

### TTS（Text-to-Speech）

| プロバイダー | 設定値 | 特徴 | 用途 |
|-------------|--------|------|------|
| **dummy** | `VIDEOJSON_TTS_PROVIDER=dummy` | 無音ファイルを生成、API不要 | CI、開発、テスト |
| **elevenlabs** | `VIDEOJSON_TTS_PROVIDER=elevenlabs` | 高品質、日本語対応 | 本番 |

### Narration（台本生成）

| プロバイダー | 設定値 | 特徴 | 用途 |
|-------------|--------|------|------|
| **skeleton** | `NARRATION_PROVIDER=skeleton` | テンプレート生成、API不要 | 手動編集のベース |
| **openai** | `NARRATION_PROVIDER=openai` | GPT-4o-mini使用、高品質 | 自動生成 |
| **anthropic** | `NARRATION_PROVIDER=anthropic` | Claude使用 | 自動生成 |
| **ollama** | `NARRATION_PROVIDER=ollama` | ローカルLLM | オフライン |

```bash
# 骨組みのみ生成（デフォルト）
npm run narration:skeleton -- --structure structure.json --out narration.md

# AI自動生成（APIキー必要）
OPENAI_API_KEY=xxx npm run narration:generate -- --structure structure.json --out narration.md
```

### CI/CD での挙動

**重要**: CI では外部 API を呼びません。

```yaml
# GitHub Actions での設定例
env:
  VIDEOJSON_TTS_PROVIDER: dummy  # 常に dummy を使用
```

- `VIDEOJSON_TTS_PROVIDER` が未設定または `dummy` の場合、無音ファイルが生成されます
- API キーが無い環境でもテストが通ります
- 本番環境でのみ `elevenlabs` を指定してください

### プロバイダー切り替え例

```bash
# 開発時（無音で高速にテスト）
VIDEOJSON_TTS_PROVIDER=dummy npm run render:smoke

# 本番（実音声を生成）
VIDEOJSON_TTS_PROVIDER=elevenlabs \
  ELEVENLABS_API_KEY=your_key \
  ELEVENLABS_VOICE_ID=your_voice \
  npm run render:run -- --structure my/structure.json --narration my/narration.md --out output.mp4
```

## 3. 生成物の置き場所（workdir）

### ディレクトリ構造

```
{VIDEOJSON_WORKDIR}/
├── cache/               # キャッシュ（同一入力の再利用）
│   └── tts/
│       └── {hash}.mp3
├── projects/
│   └── {project_id}/
│       ├── render.materialized.json
│       └── output/
│           └── final.mp4
└── temp/                # 一時ファイル（自動削除）
```

### 注意事項

- `.tmp/` はデフォルトで `.gitignore` に含まれています
- 生成されたバイナリ（mp3/mp4/png）は Git にコミットしないでください
- キャッシュを削除するには `rm -rf .tmp/cache/` を実行

## 4. トラブルシューティング

### APIキーが設定されていない

```
[WARN] TTS provider "elevenlabs" requires ELEVENLABS_API_KEY
[INFO] Falling back to dummy provider
```

→ これは正常な動作です。CI では dummy にフォールバックします。

### 音声が生成されない

1. `VIDEOJSON_TTS_PROVIDER` が正しいか確認
2. `ELEVENLABS_API_KEY` が設定されているか確認
3. `npm run render:smoke` でダミー音声が生成されるか確認

### キャッシュを無効化したい

```bash
# キャッシュディレクトリを削除
rm -rf .tmp/cache/

# または環境変数で無効化（将来実装）
VIDEOJSON_CACHE_DISABLED=true npm run render:run ...
```

## 5. セキュリティ

- `.env` ファイルは **絶対に Git にコミットしない**でください
- API キーは環境変数で管理し、コードにハードコードしないでください
- 本番環境では GitHub Secrets や Cloud Secret Manager を使用してください
