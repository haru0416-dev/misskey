---
name: shipping-misskey-change
description: "Use at every finish moment of this Misskey fork change — immediately before committing, pushing, opening a PR, or handing work back. Runs the Bun-era pre-ship checklist: `bun run lint` (oxlint + typecheck), `bun run build-misskey-js-with-types` when backend API schemas changed, `bun run --bun --filter backend check-migrations` when entities or migrations changed, SPDX verification for new files, locale safety, and `CHANGELOG.md` Unreleased entries for user-visible changes."
---

# shipping-misskey-change

Misskey の変更の **finish 局面** (commit / PR / merge する直前、またはコミットせずユーザーに作業を返す直前) に必ず走らせる最終チェックリスト。

CI で落ちやすい / レビュアーから指摘されやすいポイントを 1 箇所に集めている。後で references を辿る余裕を作らないため、チェックリストは SKILL.md 本体に直書きする。

**他スキル実行後も免除されない。** `brainstorming` / `writing-plans` / その他アップストリームスキルを先に呼んでいても、作業を返す直前・commit 直前のタイミングでこのスキルを呼ぶこと。

## 最終チェックリスト

このリストを TodoWrite に展開して 1 項目ずつ確認すること。**該当しない項目は飛ばして良いが、判断は明示する**。

- [ ] lint が通る — 標準は `bun run lint` (oxlint + Playwright 型検査 + 全 package typecheck)。軽量な追加確認が要る場合は [/quality-gate](../../commands/quality-gate.md) も参照してよい
- [ ] backend で `meta` / `paramDef` / `res` を変更した → `bun run build-misskey-js-with-types` を実行して `packages/misskey-js/src/autogen/` の差分も commit に含めた → 詳細手順は [references/tasks/regenerate-misskey-js.md](references/tasks/regenerate-misskey-js.md)
- [ ] エンティティ (`packages/backend/src/models/*.ts` の `@Column` / `@Entity` / `@Index`) を変更した → `bun run --bun --filter backend check-migrations` が pending DDL 0 件で通る
- [ ] migration ファイルを追加した → `db/schema/*.ts` の変更を `bun run --filter backend db:generate`(特殊DDLのみ`db:generate:custom`)で生成したものである / 生成SQLの中身を目視確認した / 既存のマージ済 migration は一切触っていない
- [ ] 新規 `.ts` / `.js` / `.cjs` / `.mjs` / `.vue` / `.scss` / `.html` ファイルを追加した → SPDX ヘッダーを付けた (`.vue` / `.html` は HTML コメント形式、その他は TS コメント形式)
- [ ] `locales/` を編集した → **`ja-JP.yml` だけ** を変更しており、他言語 yml の diff は出ていない (`git diff --name-only develop -- 'locales/*.yml' | grep -v '^locales/ja-JP\.yml$'` が空)
- [ ] ユーザーから見える変更 (機能追加 / 既存挙動変更) → `CHANGELOG.md` の `## Unreleased` 直下の該当サブセクション (General / Client / Server) に 1 行追記した → 詳細書式は [references/tasks/changelog-update.md](references/tasks/changelog-update.md)
- [ ] backend API endpoint を追加・変更した → Claude Code 等で subagent が使える環境なら [misskey-api-reviewer](../../agents/misskey-api-reviewer.md) を起動する。Codex など subagent 起動が制限される環境では、同等の観点 (endpoint-list 登録 / misskey-js 再生成 / meta・UUID / SPDX) を自分で確認する
- [ ] frontend の `.vue` を追加・変更した → subagent が使える環境なら [vue-component-reviewer](../../agents/vue-component-reviewer.md) を起動する。使えない環境では、同等の観点 (SPDX 形式 / 命名 / i18n / SCSS 変数 / os.* / a11y / コンポーネントカタログ 併設) を自分で確認する

## 何のためのスキルか

これは「**作業中に何を作るか**」を決めるスキルではなく、「**作り終わった後に CI を通す**」スキル。`working-on-backend` / `working-on-frontend` から始まった作業の **出口** として機能する。

該当する変更がある場合は各 references/tasks/ を Read して詳細手順を踏むこと。`bun run lint` は references を読まずに直接走らせて良い。
