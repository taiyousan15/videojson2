# Release Checklist

VideoJSON のリリース前に確認すべき項目です。

## 開発完了チェック

- [ ] すべてのタスクが完了している
- [ ] 未コミットの変更がない

## テスト

```bash
# 環境チェック
npm run doctor

# 単体テスト
npm run test:run

# CLI E2Eテスト
npm run test:run -- tests/cli/cli.test.ts

# TypeScript 型チェック
npm run typecheck

# Lint
npm run lint
```

- [ ] `npm run doctor` がすべてパス
- [ ] `npm run test:run` がすべてパス
- [ ] `npm run typecheck` がエラーなし
- [ ] `npm run lint` がエラーなし

## ドキュメント

- [ ] README.md が最新
- [ ] CHANGELOG.md にリリース内容を追記
- [ ] docs/ 内のドキュメントが最新

## サンプル動作確認

```bash
# 1. プロジェクト作成（ネット不要）
npm run project:create -- --subtitles examples/fixtures/sample.srt --out /tmp/test-release

# 2. 検証
npm run validate:strict -- --project /tmp/test-release

# 3. プレビュー
npm run preview:html -- --project /tmp/test-release
```

- [ ] project:create が正常に動作
- [ ] validate:strict が正常に動作
- [ ] preview:html が正常に動作

## セキュリティ

- [ ] .env がコミットされていない
- [ ] API キーがハードコードされていない
- [ ] .gitignore に必要なファイルが含まれている

## バージョン管理

```bash
# バージョンを確認
cat package.json | grep version

# CHANGELOG を確認
cat CHANGELOG.md | head -50
```

- [ ] package.json の version が正しい
- [ ] CHANGELOG.md が更新されている

## Git

```bash
# ステータス確認
git status

# 最新コミット確認
git log -1

# リモートとの差分
git diff origin/main
```

- [ ] main ブランチにマージ済み
- [ ] タグが作成されている

## リリース手順

1. すべてのチェック項目を確認
2. package.json のバージョンを更新
3. CHANGELOG.md にリリース内容を追記
4. コミット: `git commit -m "chore: release v0.1.0"`
5. タグ作成: `git tag v0.1.0`
6. プッシュ: `git push origin main --tags`

## リリース後の確認

- [ ] GitHub リリースが作成されている
- [ ] npm run doctor が動作する
- [ ] サンプルプロジェクトが作成できる
