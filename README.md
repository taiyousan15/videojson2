# VideoJSON

動画をJSON形式で構造化し、テンプレート化することで類似動画を量産するシステム。

## システム概要

```
[元動画] → [解析] → [Event JSON] → [テンプレート化] → [差し替え] → [新動画生成]
```

## 技術スタック

| 層 | 技術 |
|---|------|
| Frontend | Next.js 15, React 19, Tailwind CSS |
| API | Next.js API Routes |
| Worker | Express, Cloud Tasks |
| DB | PostgreSQL, Prisma |
| Storage | Google Cloud Storage |
| AI | Anthropic, OpenAI, Gemini, ComfyUI, etc. |

## クイックスタート

### 前提条件

- Node.js 20+
- Docker & Docker Compose
- pnpm または npm

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd videoJSON
```

### 2. 依存関係のインストール

```bash
npm install
cd worker && npm install && cd ..
```

### 3. 環境変数の設定

```bash
cp .env.example .env
# .envファイルを編集して必要な値を設定
```

**最小限の設定:**
- `DATABASE_URL` - PostgreSQL接続文字列
- `NEXTAUTH_SECRET` - `openssl rand -base64 32` で生成
- `ANTHROPIC_API_KEY` または `OPENAI_API_KEY` - 少なくとも1つ

### 4. データベースの起動

```bash
docker-compose up -d
```

### 5. データベースのセットアップ

```bash
npm run db:generate
npm run db:push
npm run db:seed  # 初期データ投入（オプション）
```

### 6. 開発サーバーの起動

**Frontend (Terminal 1):**
```bash
npm run dev
```

**Worker (Terminal 2):**
```bash
cd worker
npm run dev
```

### 7. アクセス

- Frontend: http://localhost:3000
- Worker API: http://localhost:8080
- Prisma Studio: `npm run db:studio`

## プロジェクト構造

```
videoJSON/
├── app/                    # Next.js App Router
│   ├── (auth)/            # 認証ページ
│   ├── (dashboard)/       # ダッシュボード
│   ├── admin/             # 管理画面
│   └── api/               # API Routes
├── components/            # React コンポーネント
├── lib/                   # ユーティリティ
├── shared/                # 共有型定義・スキーマ
├── worker/                # バックグラウンドワーカー
│   ├── src/
│   │   ├── jobs/         # ジョブ実行ロジック
│   │   ├── pipelines/    # 処理パイプライン
│   │   ├── providers/    # AIプロバイダー連携
│   │   └── tasks/        # タスク管理
│   └── prisma/           # DB スキーマ
├── prisma/                # Prisma設定
├── tests/                 # テストスイート
└── docs/                  # ドキュメント
```

## ジョブタイプ

| タイプ | 説明 |
|--------|------|
| INGEST | 動画の取り込み・正規化 |
| ANALYZE | AI解析（チャプター、イベント抽出） |
| OCR | 画面内テキスト認識 |
| EMBED | 顔認識・人物紐付け |
| HIGHLIGHT | ハイライト自動抽出 |
| RENDER | FFmpegレンダリング |
| ASSEMBLE | 最終動画組み立て |
| GENERATE | AI生成コンテンツ作成 |
| COMFYUI | ComfyUIワークフロー実行 |

## テスト

```bash
# 単体テスト
npm run test

# E2Eテスト
npm run test:e2e

# カバレッジレポート
npm run test:coverage
```

## 開発コマンド

```bash
npm run dev          # 開発サーバー起動
npm run build        # 本番ビルド
npm run lint         # Lint実行
npm run typecheck    # 型チェック
npm run db:studio    # Prisma Studio起動
npm run db:migrate   # マイグレーション実行
```

## 環境変数一覧

詳細は `.env.example` を参照。

**必須:**
- `DATABASE_URL` - PostgreSQL
- `NEXTAUTH_SECRET` - 認証シークレット

**推奨:**
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` - LLM
- `GCS_BUCKET` - ファイルストレージ

**オプション:**
- `COMFYUI_URL` - ローカルComfyUI
- `ELEVENLABS_API_KEY` - TTS
- `RUNWAY_API_KEY` - 動画生成

## ライセンス

Private
