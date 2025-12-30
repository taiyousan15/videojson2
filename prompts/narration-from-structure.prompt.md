# narration.md 自動生成テンプレート（structure.json → narration.md）

目的:
- structure.json の "セグメントID" に合わせて narration.md を作る
- 元動画の言い回しを復元しない（コピー防止）
- 初心者が後で編集しやすい文章にする

入力:
- structure.json（JSON）
- 動画テーマ（例: AIシステム開発の未来）
- 口調（例: 丁寧/カジュアル）
- 対象（例: 初心者向け/経営者向け）

出力ルール（必須）:
- narration.md を出力する
- 見出しは必ず「## s01」「## s02」…のように structure.segments[].id と一致させる
- 各セグメントは 1〜6文程度で、短く区切る
- 元動画の固有名詞/固有の言い回しをそのまま再現しない
- "同じ構成"でも中身は別にする（例: 比喩・例・結論の言い方を変える）

ここからプロンプト（そのまま使う）:

---
あなたは動画台本の作成者です。
次の structure.json を読み、指定テーマに沿った narration.md を作ってください。

【テーマ】
{{THEME}}

【口調】
{{TONE}}

【対象者】
{{AUDIENCE}}

【structure.json】
{{STRUCTURE_JSON}}

【出力形式（必須）】
- Markdown
- 先頭に以下のYAMLヘッダーを含める:
  ---
  schema_version: 1.0.0
  language: ja
  structure_ref: ./structure.json
  ---
- その後、各セグメントを次の形式で出す:
  ## s01
  [話者: host]
  （本文）

【重要ルール】
- 元動画の文章の復元や引用は禁止
- セグメントIDは必ず一致
- 初心者にも分かる言葉で
---
