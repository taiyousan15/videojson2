# VideoJSON / Claude Code ガイド（このリポジトリの最優先ルール）

このファイルは、Claude Code がこのリポジトリで作業するときの「共通ルール」です。
初心者の方でも迷わないように、専門用語はできるだけ避けて書いています。

## 1. このリポジトリで作りたいもの（ゴール）
元動画を「構造（流れ）」としてJSON化し、台本・音声・人物（見た目）を差し替えて、元の流れを参考にしつつ "中身は別物" の動画を作る仕組みを作ります。

重要:
- そのままのコピーにならないように、必ず台本は書き換える（オリジナル化）
- 声・顔画像は、本人の許可があるものだけを使う（本人の声/本人の画像ならOK）

---

## 2. 絶対禁止事項（最重要）

| 禁止事項 | 理由 |
|----------|------|
| **元動画からの画像・フレームの切り出し・コピー** | 著作権リスク |
| **元動画のフレームを背景として使用** | 暗くしても、ぼかしても禁止 |
| **元動画の映像を加工して再利用** | いかなる形式での再利用も禁止 |
| プレースホルダー（「[画像]」等）の使用 | 不完全な教材になる |
| ハルシネーション（新情報の追加） | OCR + transcript + ユーザー追記のみ許可 |
| **🚫 Phase 5（品質検証）のスキップ** | 破損画像が最終動画に混入 |
| **🚫 Phase 7（テロップ）のスキップ** | アクセシビリティ・可読性の欠如 |
| **🚫 PIL (Pillow) の使用** | 2度と使用禁止・削除済み |
| **🚫 NanoBananaの代わりにPIL使用** | ショートカット禁止 |
| **時間短縮を理由にした手順の省略** | 不完全な成果物の納品リスク |

**違反した場合は全工程をやり直すこと。**

### ⚠️ 「時間短縮」の正しい意味

| ❌ 間違った時間短縮 | ✅ 正しい時間短縮 |
|-------------------|-----------------|
| Phase 5をスキップ | 並列処理で高速化 |
| Phase 7をスキップ | スクリプト最適化 |
| NanoBananaの代わりにPIL | バッチ処理の活用 |

**「40-60%の処理時間短縮」= 並列化による高速化であり、フェーズのスキップではない。**

---

## 3. まず読むべきドキュメント（優先順位）
1) docs/requirements.md   … 何を実現するか（要件）
2) docs/spec.md           … どう作るか（仕様）
3) docs/implementation-plan.md … どう進めるか（計画）
4) docs/migrations.md     … schema_version を上げるときの約束
5) docs/claude-code-setup.md … Claude Codeでの操作フロー（自動読み込み含む）

---

## 4. 生成物（このリポジトリが扱う"核"のデータ）
- structure.json（＝Event JSON）: 元動画の流れを「区間（セグメント）」に分けた設計図
- narration.md           : 台本（structureのセグメントIDに対応）
- render.json            : 自動編集用の設計図（最終的にFFmpeg等へ渡す想定）

これらは必ず schemas/structure.schema.json と schemas/render.schema.json で検証すること。

---

## 5. Claude Code に求める動き（自動読み込み・自動判断）
あなた（Claude Code）は、ユーザーの発言を見て、必要なら自発的に以下を実行してください。

**まず最初に**: 動画生成・スライド動画・企業研修に関する作業は
→ `.claude/skills/スライド.md` を読んで、Phase 0から順に実行する

### スキル選択ガイド

| キーワード | 参照スキル | 備考 |
|-----------|-----------|------|
| **スライド動画, 企業研修, 研修動画** | **スライド.md** | **完全ワークフロー（推奨）** |
| **動画ダウンロード, 文字起こし, Whisper** | **スライド.md** | Phase 0-1, 0-2 |
| **翻訳, Ollama, ローカルLLM** | **スライド.md** | Phase 0-3（コスト無料） |
| **NanoBanana, 画像生成** | **スライド.md** | 画像生成（500枚/日無料） |
| **TTS, Neural2-D** | **スライド.md** | 音声生成 |
| **並列処理, Parallel Advanced** | **スライド.md** | 高度な並列化 |
| structure.json, Event JSON | videojson_pipeline | 基本の構造化（旧式） |
| 台本, narration.md | narration_generator | 台本生成（旧式） |
| render.json, 自動編集 | render_generator | レンダリング設定（旧式） |

### Quick Mode vs Parallel Advanced Mode

スライド.md v7.0 に統合されています。

| シナリオ | 推奨モード | スキル |
|----------|-----------|--------|
| 短い動画（5分以下）、急ぎ | Quick Mode | スライド.md |
| 長い動画（15分以上）、高品質 | Parallel Advanced | スライド.md |
| キャラクター一貫性が重要 | Parallel Advanced | スライド.md |
| 企業納品・本番用 | Parallel Advanced | スライド.md |
| 初回テスト・プロトタイプ | Quick Mode | スライド.md |
| **高品質+高速（40-60%短縮）** | **Parallel Advanced** | **スライド.md** |
| **大量動画処理（30+セクション）** | **Parallel Advanced** | **スライド.md** |

---

## 6. セクション計測ルール（最重要）

**セクション数 = 元動画の画面切り替え回数**

```
❌ 誤り: 動画の長さからセクション数を推定する
   例: 「25分動画だから10セクションくらい」

✓ 正しい: 元動画で画面が変わった回数をカウントする
   例: 「画面切り替えを計測したら57回だった → 57セクション」
```

### 画面切り替えの定義

| カウントする | カウントしない |
|--------------|----------------|
| スライドが次のスライドに変わった | 同じスライド内でのアニメーション |
| 画面上の主要な画像が変わった | マウスカーソルの移動のみ |
| レイアウトが大きく変わった | 小さなUI要素の変化 |
| 新しいUIや画面が表示された | テキストのハイライト追加 |

### セクション検証（必須）

```bash
# 検証スクリプト実行
python3 scripts/validate_sections.py --sections sections_data.json --video input.mp4

# 合格基準
# - カバー率 = 100%
# - ギャップ = 0
# - 重複 = 0
```

---

## 7. 画像処理ルール

### 🚫 PIL (Pillow) 使用禁止

**PIL / Pillow は2度と使用しません:**
- ❌ 画像生成にPIL使用禁止
- ❌ テキスト配置にPIL使用禁止
- ❌ 画像合成にPIL使用禁止
- ❌ いかなる用途でもPIL禁止

### 画像生成方法（必須）

| 必須方法 | 用途 |
|----------|------|
| **NanoBanana** | 背景画像生成（テキストなし） |
| **Remotion** | テキスト配置、テロップ、字幕 |
| **Sora2** | 映像（動画）生成 |

**正しいワークフロー:**
1. **Phase 4**: NanoBananaで背景画像のみ生成（1920x1080、テキストなし）
2. **Phase 7**: Remotionで背景 + テキスト + テロップを統合

---

## 8. 作業ルール（失敗しないための最低限）

1. 変更の前に "どこをどう変えるか" を短く整理してから着手する
2. JSONを出力したら必ず `npm run schema:validate` を通す
3. **セクション作成後は必ず `python3 scripts/validate_sections.py` で検証**
4. **🚫 PIL (Pillow) は2度と使用しない**
5. examples/ が壊れる変更は、必ず examples/ も更新して直す
6. schema_version を変えたら docs/migrations.md も更新する
7. 迷ったら「初心者が理解できる言葉」に言い換える
8. **出力は必ず視覚的に確認してから「完了」と報告**
9. **日本語音声は必ず Google Cloud TTS Neural2 を使用**
10. **FFmpeg合成時は `-map 0:v -map 1:a` で音声を明示指定**
11. **🚫 Phase 5（品質検証）とPhase 7（テロップ）は絶対にスキップ禁止**
12. **ワークフロー実行前に `python3 scripts/validate_workflow.py` で全フェーズ存在確認**
13. **Phase 4: NanoBanana（背景のみ）、Phase 7: Remotion（テキスト+テロップ）必須**

---

## 9. 品質検証ループ

Advanced Mode 使用時は品質検証を必須化:

```bash
# 品質検証
python3 scripts/advanced_video_analysis/quality_checker.py \
  --generated "./generated_slides/" \
  --jobs "./nanobanana_jobs/"

# 検証項目
# 1. OCR読み戻し（テキスト一致）
# 2. レイアウト一致度（IOU > 0.8）
# 3. 人物比率（7-8頭身）
# 4. 鮮明度（ラプラシアン分散 > 100）
```

---

## 10. 著作権・肖像・声の取り扱い（必須）
- 元動画の素材を使う場合は、利用許可・ライセンス・引用要件を確認する
- 第三者の顔写真・声の模倣は、明確な許可がない限り実装・運用しない
- "構成を参考にする" ことと "ほぼ同じものを複製する" の間には危険な境界があるため、
  本システムは「中身（台本・表現）は必ず作り替える」前提で設計する

---

## 11. スキル一覧（参照ファイル）

| スキル名 | ファイル | 用途 |
|----------|----------|------|
| **スライド.md（推奨）** | **`.claude/skills/スライド.md`** | **完全ワークフロー（URL→動画）** |

**以下は旧式（スライド.mdに統合済み）:**

| スキル名 | ファイル | 備考 |
|----------|----------|------|
| orchestrator | `.claude/skills/videojson_orchestrator/SKILL.md` | 旧: フロー誘導 |
| pipeline | `.claude/skills/videojson_pipeline/SKILL.md` | 旧: structure.json作成 |
| narration | `.claude/skills/narration_generator/SKILL.md` | 旧: 台本生成 |
| render | `.claude/skills/render_generator/SKILL.md` | 旧: render.json作成 |
| tts_video | `.claude/skills/tts_video_generator/SKILL.md` | 旧: TTS動画生成 |
| advanced | `.claude/skills/advanced_video_analysis/SKILL.md` | 旧: 高品質解析 |

---

最後に:
このリポジトリは、動画制作を高速化するための仕組みです。
ただし「自動化」より先に「安全」と「権利」を守ること。


<claude-mem-context>
# Recent Activity

<!-- This section is auto-generated by claude-mem. Edit content outside the tags. -->

*No recent activity*
</claude-mem-context>