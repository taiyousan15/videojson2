# VideoJSON / Claude Code ガイド（このリポジトリの最優先ルール）

このファイルは、Claude Code がこのリポジトリで作業するときの「共通ルール」です。
初心者の方でも迷わないように、専門用語はできるだけ避けて書いています。

## 1. このリポジトリで作りたいもの（ゴール）
元動画を「構造（流れ）」としてJSON化し、台本・音声・人物（見た目）を差し替えて、元の流れを参考にしつつ "中身は別物" の動画を作る仕組みを作ります。

重要:
- そのままのコピーにならないように、必ず台本は書き換える（オリジナル化）
- 声・顔画像は、本人の許可があるものだけを使う（本人の声/本人の画像ならOK）

## 2. まず読むべきドキュメント（優先順位）
1) docs/requirements.md   … 何を実現するか（要件）
2) docs/spec.md           … どう作るか（仕様）
3) docs/implementation-plan.md … どう進めるか（計画）
4) docs/migrations.md     … schema_version を上げるときの約束
5) docs/claude-code-setup.md … Claude Codeでの操作フロー（自動読み込み含む）

## 3. 生成物（このリポジトリが扱う"核"のデータ）
- structure.json（＝Event JSON）: 元動画の流れを「区間（セグメント）」に分けた設計図
- narration.md           : 台本（structureのセグメントIDに対応）
- render.json            : 自動編集用の設計図（最終的にFFmpeg等へ渡す想定）

これらは必ず schemas/structure.schema.json と schemas/render.schema.json で検証すること。

## 4. Claude Code に求める動き（自動読み込み・自動判断）
あなた（Claude Code）は、ユーザーの発言を見て、必要なら自発的に以下を実行してください。

**まず最初に**: ユーザーの意図が不明確なときは
→ .claude/skills/videojson_orchestrator/SKILL.md を読んで、適切なスキルへ誘導する

**具体的な作業**:
- 「structure.json」「Event JSON」「動画をJSON化」「YouTube解析」などが出たら
  → .claude/skills/videojson_pipeline/SKILL.md を読んで手順に従う

- 「structureから台本を作る」「narration.mdを生成」などが出たら
  → .claude/skills/narration_generator/SKILL.md を読んで手順に従う

- 「narration + structure から自動編集JSON」「render.jsonを作る」などが出たら
  → .claude/skills/render_generator/SKILL.md を読んで手順に従う

## 5. 作業ルール（失敗しないための最低限）
- 変更の前に "どこをどう変えるか" を短く整理してから着手する
- JSONを出力したら必ず npm run schema:validate を通す
- examples/ が壊れる変更は、必ず examples/ も更新して直す
- schema_version を変えたら docs/migrations.md も更新する
- 迷ったら「初心者が理解できる言葉」に言い換える

## 6. 著作権・肖像・声の取り扱い（必須）
- 元動画の素材を使う場合は、利用許可・ライセンス・引用要件を確認する
- 第三者の顔写真・声の模倣は、明確な許可がない限り実装・運用しない
- "構成を参考にする" ことと "ほぼ同じものを複製する" の間には危険な境界があるため、
  本システムは「中身（台本・表現）は必ず作り替える」前提で設計する

---
最後に:
このリポジトリは、動画制作を高速化するための仕組みです。
ただし「自動化」より先に「安全」と「権利」を守ること。
