# 仕様書（VideoJSON）

この文書は「どう作るか（設計の約束）」です。
requirements.md の内容を前提に、実装が迷わないように整理します。

## 1. 全体アーキテクチャ（ざっくり）
- Web（Next.js）: 画面、API（管理、編集、ジョブ作成）
- Worker（バックグラウンド）: 重い処理（解析、生成、レンダリング）
- DB（PostgreSQL + Prisma）: プロジェクト、ジョブ、アセット、生成物の管理
- Storage（GCS等）: 動画/音声/画像/JSON/ログなど

ポイント:
- 「時間がかかる処理」はジョブとしてWorkerに投げる
- ジョブの結果は "ファイル（JSON/動画）" として保存し、いつでも再利用できる

## 2. ジョブ種別（前提）
- INGEST: 動画の取り込み・正規化
- ANALYZE: 構造解析（チャプター/イベント抽出 → structure.json）
- OCR: 画面内テキスト抽出
- EMBED: 人物の紐付け（可能な範囲）
- HIGHLIGHT: ハイライト抽出
- GENERATE: 台本/画像/動画など生成
- COMFYUI: ComfyUIワークフロー実行（任意）
- RENDER: render.json に基づくレンダリング（FFmpeg等）
- ASSEMBLE: 最終動画の組み立て

## 3. データ契約（最重要）
このプロジェクトの品質は「JSONの契約」を守れるかで決まります。

### 3.1 structure.json（Event JSON）
- 目的: 元動画の"流れ"をセグメントに分けて表現する
- 検証: schemas/structure.schema.json
- 最小運用: examples/minimal/structure.json を常に最新に保つ

### 3.2 narration.md
- 目的: セグメントIDに対応した台本
- ルール: 見出し（## s01 など）でセグメントIDを一致させる
- 台本は必ず書き換える（コピー禁止）

### 3.3 render.json（自動編集用JSON）
- 目的: 最終動画を作るための設計図
- 検証: schemas/render.schema.json
- render_mode:
  - remix: 元動画の映像を主に使う
  - generative: 生成映像を主に使う
  - hybrid: 混在

## 4. ストレージ設計（例）
- projects/{projectId}/source/original.mp4
- projects/{projectId}/analysis/structure.json
- projects/{projectId}/authoring/narration.md
- projects/{projectId}/render/render.json
- projects/{projectId}/output/final.mp4
- projects/{projectId}/assets/{assetId}/...

重要:
- "同じ入力→同じ出力" になるように、生成時のパラメータ（モデル名など）も記録する

## 5. UI（ユーザー操作フローの想定）
1) プロジェクト作成
2) 元動画を登録（YouTubeリンク or アップロード）
3) 解析（structure.jsonを生成）
4) 台本作成（narration.mdを生成→編集）
5) 画像・音声をアップロード（本人素材）
6) render.json生成（自動編集設計図）
7) レンダリング→最終動画生成
8) 差分修正（台本や一部セグメントだけ直して再生成）

「台本はどこに入力する？」への答え:
- UI上: 台本編集画面（Script Editor）を用意する
- ファイル: projects/{projectId}/authoring/narration.md を編集して反映する

「人物の画像/音声はどう渡す？」への答え:
- 画像: assetsとしてアップロード（顔画像IDを render.json の lipsync 設定へ紐付け）
- 音声: assetsとしてアップロード（本人の声として利用。第三者の声は禁止）

## 6. 検証（validateの機械化）
- schemas/structure.schema.json / schemas/render.schema.json を用意する
- scripts/validate-json.mjs で構造を検証する
- examples/ に最小サンプルを置き、CIで必ずチェックする
- schema_version 更新時は docs/migrations.md に移行手順を書く

## 7. 権利・安全の実装要件（必須）
- 音声/顔画像アセットには「本人の許諾がある」前提の注意書きをUIにも持つ
- "コピーにならない" ため、台本生成では元動画の文言を復元しない設計にする
- ログに個人情報や機密データを不用意に出さない

## 8. 成果物（最低限）
- schemas/structure.schema.json
- schemas/render.schema.json
- examples/minimal/structure.json
- examples/minimal/narration.md
- examples/minimal/render.json
- npm run schema:validate が通る
- docs/workflow.html で全体の流れが一目で分かる

---
更新ルール:
- 実装を変える前に spec.md を更新する
- spec.md を変えたら schema / examples / docs も整合させる
