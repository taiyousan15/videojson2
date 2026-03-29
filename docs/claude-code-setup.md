# Claude Code での使い方（VideoJSON）

このドキュメントは「Claude Codeに何を貼って、どう進めればいいか」を初心者向けにまとめたものです。

## 1) まず結論：自動読み込みはどう動く？
- Claude Codeは "会話の内容" を見て、必要そうな手順（スキル）を呼び出します。
- ただし、確実に自動化するには「手順の置き場所」が必要です。

VideoJSONでは、手順を以下に置きます:
- .claude/skills/***/SKILL.md  … このリポジトリ内の "自分用スキル"
- （任意）外部のプラグイン/スキルマーケット … 汎用スキル（開発補助）を追加

## 2) 実際の会話ログ例（スキルが切り替わる瞬間）
例A: 元動画を構造JSONにしたい
- User: 「YouTubeリンクを解析して structure.json を作って」
- Claude Code:
  1) "structure.json / 動画をJSON化" を検知
  2) .claude/skills/videojson_pipeline/SKILL.md を読む
  3) 必要な出力（structure.json）を schema で検証できる形で作る

例B: structureから台本を作りたい
- User: 「この structure.json から narration.md を自動生成して」
- Claude Code:
  1) "narration.md生成" を検知
  2) .claude/skills/narration_generator/SKILL.md を読む
  3) セグメントID（s01等）を維持した台本を出す

例C: 自動編集用JSONを作りたい
- User: 「narration.md + structure.json から render.json を作って」
- Claude Code:
  1) "render.json" を検知
  2) .claude/skills/render_generator/SKILL.md を読む
  3) schemas/render.schema.json で通る render.json を出す

## 3) 自分用に"最小構成"で使う方法（最短ルート）
最小で必要なものはこれだけです:
- structure.json（元動画の流れ）
- narration.md（台本）
- render.json（自動編集用設計図）

手順:
1) examples/minimal/structure.json をコピーして、自分の案件に合わせて編集
2) examples/minimal/narration.md をコピーして台本を書く
3) examples/minimal/render.json をコピーして、音声/映像の方針を決める
4) npm run schema:validate で壊れていないかチェック

## 4) 業務特化スキルの作り方（自分用自動化）
ルール:
- .claude/skills/<skill_name>/SKILL.md を作る
- 「いつ使うか」「何を入力にするか」「何を出力にするか」「手順」を短く書く
- 最後に schema validate を必ず入れる

例:
- .claude/skills/clientA_style/SKILL.md
  - triggers: 「クライアントA」「アニメ風」「テロップ太字」
  - outputs: render.json の style_hint を固定する

## 5) 外部のプラグイン＋スキル（任意）
開発を楽にするために、外部の "プラグイン・スキル集" を入れる選択肢があります。
これは VideoJSON の必須ではありませんが、以下に効きます:
- ドキュメント整備
- テストやCIの整備
- リポジトリ診断

注意:
- 外部の機能は「このリポジトリにファイルを置いただけ」で自動インストールされるものではありません
- 使う場合は、Claude Codeの /plugin install や CLI で "自分の環境" に入れます

## 6) render.json をコマンドで生成する

structure.json と narration.md から render.json を自動生成できます。

```bash
node scripts/generate-render.mjs \
  --structure examples/minimal/structure.json \
  --narration examples/minimal/narration.md \
  --out examples/minimal/render.cli.json
```

または npm script で:
```bash
npm run render:generate -- --structure <path> --narration <path> --out <path>
```

生成後、自動的に schema validate が実行されます。

### よくある失敗と直し方
- **セグメントID不一致**: narration.md の見出し（## s01）が structure.json の segments[].id と一致しているか確認
- **台本が空**: narration.md の各セグメントに本文があるか確認（[話者: ...] 行だけでは不可）

## 7) 画像/音声をどう渡す？
- 画像: assets としてアップロード → asset_id を render.json の lipsync 設定へ
- 音声: assets としてアップロード → 本人の声として利用（第三者の声は禁止）

---

## 参考リンク

- **[クイックスタート](./quickstart.md)** - 初めての方はこちらから
- [設定ガイド](./config.md) - 環境変数とプロバイダー設定
- [レンダリングガイド](./rendering.md) - 詳細なレンダリングオプション
- [プロバイダーガイド](./providers.md) - TTS/リップシンクなどの設定

---

迷ったら:
- docs/requirements.md を読む（何を守るべきか）
- schemas/ を通す（壊れていないか）
- examples/ を更新（再現できる最小例を残す）
