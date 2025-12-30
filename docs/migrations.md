# migrations.md（schema_version移行ルール）

目的:
- structure.json / render.json の仕様（schema）を変更したときに、破綻しないための手順を固定します。

## 1) 基本ルール
- schema_version は "MAJOR.MINOR.PATCH" 形式（例: 1.0.0）
- 互換性の考え方:
  - PATCH: バグ修正や説明追加（データ構造は変えない）
  - MINOR: 後方互換の追加（新しい任意フィールド追加など）
  - MAJOR: 後方互換を壊す変更（必ず移行手順が必要）

## 2) 変更時に必ずやること（チェックリスト）
1) schemas/*.schema.json を更新する
2) examples/minimal/* を更新する（新しいschemaで通る形）
3) npm run schema:validate を通す
4) この docs/migrations.md に「何が変わったか」「どう直すか」を書く

## 3) 移行テンプレ
### 3.1 変更概要
- 対象: structure / render
- 旧: x.y.z
- 新: x.y.z
- 何が変わったか:
  - 例: segments[].audio.lipsync.enabled を必須にした、など

### 3.2 影響範囲
- 既存JSONがどこで壊れるか
- どの作業（生成/レンダリング）に影響するか

### 3.3 自動移行できるか
- 可能なら scripts/migrate-*.mjs を追加する
- 難しければ手動手順を明確に書く

## 4) 例：1.0.0 → 1.1.0（後方互換の追加）
- 追加: segments[].overlays.captions.style を任意で追加
- 既存JSONはそのままでも通る（後方互換）
- examplesを更新して新機能の使い方を示す

---
重要:
- schema を変えたら「必ず examples を更新する」
- examples が最新の仕様を保証する（CIが守ってくれる）
