# 実装計画書（VideoJSON）

目的:
- 「元動画→構造JSON→台本→自動編集JSON→動画生成」までを、壊れにくい形で段階的に実装する

## フェーズ0（先に"壊れない土台"を作る）
成果物:
- schemas/structure.schema.json
- schemas/render.schema.json
- examples/minimal/*
- scripts/validate-*.mjs
- CIで schema validate が走る

完了条件:
- npm run schema:validate がローカル/CIで成功する

## フェーズ1（最小フローを通す）
目標:
- structure.json と narration.md から render.json を作れる（まずは手動でもOK）

タスク:
- narration.md のフォーマットを固定（セグメントID見出し）
- render.json を生成する最小ロジック（将来はUI/Workerへ統合）

完了条件:
- examples/minimal/ を元に render.json を組み立てられる説明が docs にある

## フェーズ2（音声と人物差し替え）
目標:
- "本人の声" と "本人の画像（または生成キャラ）" を使って差し替えできる

タスク（推奨の順番）:
1) 音声: narration → セグメント音声生成（TTS/音声変換）
2) 口パク: セグメント音声 → リップシンク（任意）
3) 画面: 元構成を維持しつつ、必要に応じてB-roll/生成映像へ差し替え

完了条件:
- render.json に「音声」「顔画像」「リップシンク」が設定できる

## フェーズ3（スタイル違いのバリエーション量産）
目標:
- アニメ風 / 3D風 / 実写風 などを選択して複数出力できる

タスク:
- style パラメータ（プリセット）を定義
- 生成系モデル（ComfyUI等）の呼び出しを render_mode=generative/hybrid へ統合

完了条件:
- 同じ台本で複数スタイルの render.json が生成できる

## フェーズ4（運用・品質）
タスク:
- 失敗時の再実行、コスト上限、監視
- 権利・許諾に関するチェックリストをUI/運用に組み込む

完了条件:
- 初心者でも手順通りに進められる（docs と UI が一致）

---
注意:
- 最初から全部自動化せず、まず「schemaで壊れない」「最小例が動く」を優先する
