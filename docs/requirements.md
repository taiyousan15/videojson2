# 要件定義書（全文・人間用）

## 1. 概要

動画を **構造化→制作計画→生成/編集→反復改善** する。
World Modelsの実務版として「メディア世界（登場物・行為・時間・テロップ・意図）」を扱う。

---

## 2. ロール

| ロール | 説明 |
|--------|------|
| **Creator** | コンテンツ作成者 |
| **Editor** | 編集・レビュー担当 |
| **Admin** | 管理者（権限分離） |

---

## 3. 主要ユースケース

| ID | ユースケース |
|----|--------------|
| UC-1 | RemixでShorts/長編を安定出力 |
| UC-2 | Event JSON→Authoring差分→派生量産 |
| UC-3 | ComfyUIでGenerative作り直し |
| UC-4 | Style抽出（OCR）提案→人間採用 |
| UC-5 | Entity linking（顔embedding/辞書/LLM）強化 |
| UC-6 | ハイライト評価の学習化（feedback→weights） |

---

## 4. 機能要件（要約）

| ID | 機能 | 説明 |
|----|------|------|
| FR-1 | プロジェクト管理 | domain/language/profiles |
| FR-2 | URL/MP4取り込み | GCS直upload、正規化、sha256 |
| FR-3 | Job基盤 | Cloud Tasks、冪等、進捗 |
| FR-4 | ANALYZE | 粗→詳細、Event v1.1、レビューpatch |
| FR-5 | OCR | 日本語、bbox→safe_area、report→承認 |
| FR-6 | EMBED | 人物同一性：強一致自動、弱一致レビュー |
| FR-7 | HIGHLIGHT | スコア＋任意LLM rerank＋レビュー＋学習ログ |
| FR-9 | RENDER | Remix/Generative |
| FR-10 | ASSEMBLE | 結合＋字幕ASS＋BGM |
| FR-11 | TRAIN | weights更新 |
| FR-12 | STATE | 監査・再現・比較 |

---

## 5. 非機能要件（要約）

| カテゴリ | 要件 |
|----------|------|
| 可用性 | 99.5%（初期目標） |
| パフォーマンス | UI P95 < 500ms（通常操作） |
| セキュリティ | 署名URL、Secret Manager、監査ログ |
| コスト | キャッシュ・ライフサイクルでコスト管理 |
| 拡張性 | プロバイダ差し替え（OCR/Embedding/LLM/ComfyUI） |

---

## 6. OCR（日本語対応）選定

### 要件
- **目的**：テロップbboxとsafe_area推定
- **自動適用禁止**（提案→承認）

### 推奨優先順位

| 優先度 | プロバイダ | 特徴 |
|--------|------------|------|
| 1 | Cloud Vision | 安定 |
| 2 | PaddleOCR | 自前/GPUでコスト最適化 |
| 3 | Tesseract | fallback |

---

## 7. 顔embedding閾値

### 方針
- **誤統合最小**（False Merge最小化）

### 暫定閾値

| 判定 | 類似度（sim） |
|------|---------------|
| 自動統合 | sim ≥ 0.65 |
| 要レビュー | 0.55 ≤ sim < 0.65 |
| 別人扱い | sim < 0.55 |

### 本番前タスク
- ROC/PRでキャリブレーション（FAR目標）
