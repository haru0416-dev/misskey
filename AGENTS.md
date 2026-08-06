# Misskey – AI Agent Guide

このファイルは Misskey リポジトリで動く AI コーディングエージェント (Claude Code / OpenAI Codex / GitHub Copilot 等) が共通で参照する **絶対禁止事項と最低限のチェック** を集めた索引。次の 3 経路から参照・読み込みされる:

- **Claude Code**: ルート `CLAUDE.md` から `@AGENTS.md` で取り込まれる。詳細手順・規約は `.claude/skills/` (description で自動索引)
- **OpenAI Codex**: ルート `AGENTS.md` を直接読み込む (skill エントリは `.agents/skills/`、実体は `.claude/skills/` を指す)
- **GitHub Copilot**: `.github/copilot-instructions.md` (本ファイルの規約を Copilot code review 向けに再掲) 経由で参照する

人間 contributor 向けの一般規約 (Issue / PR の出し方、ActivityPub 拡張など) は [CONTRIBUTING.md](CONTRIBUTING.md) を参照。本ファイルは AI が **コードを書く・直す・出す** 際に踏み外してはいけない事項に絞る。

---

## 絶対にやってはいけない事

違反すると CI 失敗 / 本番事故 / 共有環境破壊 になる。順守すること。

### コード・データ関連

1. **SPDX ヘッダー欠落のまま AGPL 管轄ディレクトリへ新規ファイルを追加しない**
   - 対象: 新規 `.ts` / `.js` / `.cjs` / `.mjs` / `.vue` / `.scss` / `.html` ファイル
   - CI の対象判定は [.github/workflows/check-spdx-license-id.yml](.github/workflows/check-spdx-license-id.yml) の `directories` 配列を参照 (`*.config.{ts,js,cjs,mjs}` と `*eslint*` は除外)
   - 欠落すると CI (`spdx` ジョブ) が失敗する
   - `packages/misskey-js` は MIT ライセンスのサブパッケージなので、この AGPL ヘッダーを一律に付けない (サブパッケージ固有の `package.json` / `LICENSE` / 既存ファイルのヘッダーに従う)

   `.ts` / `.js` / `.cjs` / `.mjs` / `.scss`:

   ```text
   /*
    * SPDX-FileCopyrightText: syuilo and misskey-project
    * SPDX-License-Identifier: AGPL-3.0-only
    */
   ```

   `.vue` / `.html` (HTML コメント形式):

   ```text
   <!--
   SPDX-FileCopyrightText: syuilo and misskey-project
   SPDX-License-Identifier: AGPL-3.0-only
   -->
   ```

2. **`locales/ja-JP.yml` 以外の locale YAML を手動編集しない**
   - 他言語ファイル (`en-US.yml` など `ja-JP.yml` 以外すべて) は Crowdin の自動配信先。手動編集すると次の同期で上書き喪失する
   - 根拠: [locales/README.md](locales/README.md) と [crowdin.yml](crowdin.yml) (`ja-JP.yml` → `locales/%locale%.yml` の同期設定)

3. **マージ済 migration ファイルを編集しない**
   - 対象: `packages/backend/migration/*.sql` のうち、既に `develop` / `master` にマージされたもの (`migration/_legacy/` は旧TypeORM時代の手書きmigrationの歴史的アーカイブで実行系からは外れている、触らない)
   - 本番環境で履歴改変が起きると深刻なデータ不整合を引き起こす
   - スキーマ変更は `packages/backend/src/db/schema/*.ts` を編集した上で `bun run --filter backend db:generate` を実行し、drizzle-kitに差分SQLを自動生成させる。関数・拡張機能・`INCLUDE`句・ストレージパラメータ変更等drizzle-kitが検出できないDDLは `bun run --filter backend db:generate:custom` で空ファイルを作り手書きする
   - migrationはforward-onlyで`down()`の概念が無い(drizzle-kitはdownを生成しない)。変更を戻したい場合は新しいmigrationとして逆方向のSQLを書く
   - `bun run --bun --filter backend check-migrations` を通すこと (`migration-runner.ts` が設定先DBに対して未適用のmigrationファイルが無いことを検査する)

### Git / リポジトリ操作

4. **`git push --force` / `--force-with-lease` を `main` / `develop` / `master` にしない** (他人の作業を消す可能性)
5. **`git commit --no-verify` で hook をスキップしない** (lint / format / SPDX チェックを潰す)
6. **マージ済 / プッシュ済コミットを `git commit --amend` で書き換えない** (履歴の整合性が壊れる)
7. **他人のブランチを `git reset --hard` / `git branch -D` で破壊しない**
8. **`git config` をユーザーに無断で書き換えない** (特に `user.name` / `user.email` / `commit.gpgsign`)

### Issue / PR / 外部送信

9. **ユーザーの明示指示なしに PR を merge / close / force-push しない**
10. **ユーザーの明示指示なしに external service (GitHub comments / Slack / メール 等) へ送信しない**
11. **secrets / 認証情報をリポジトリにコミットしない** (`.config/*.yml` の本番値、`.env` ファイル、API token、private key 等)
12. **脆弱性報告を通常の Issue / PR 経由で行わない** (脆弱性報告を行う場合のルールは `creating-issues-and-prs` スキルを参照すること)

### スキル呼び出し

上流スキルの実行・事前知識・memory の内容に関わらず免除されない。

13. **`working-on-backend` スキルを参照せずに `packages/backend/` 配下のファイルを編集・追加しない**
14. **`working-on-frontend` スキルを参照せずに `packages/frontend/` 配下のファイルを編集・追加しない**
15. **`shipping-misskey-change` スキルを参照せずに commit / PR 作成 / 作業をユーザーに返さない**
16. **`creating-issues-and-prs` スキルを参照せずに Issue / PR を起票しない** (脆弱性報告のルールも含む)

---

## 変更を出す前の最低チェック

各エージェントは [shipping-misskey-change スキル](.claude/skills/shipping-misskey-change/SKILL.md) を参照すること。スキルが利用できない環境でも、以下のチェックは必ず実施すること:

1. **lint**: `bun run lint` が通る (oxlint + typecheck, 全パッケージ)
2. **backend API 変更時**: `bun run build-misskey-js-with-types` を実行し `packages/misskey-js/src/autogen/` の差分も commit に含めた
3. **migration 変更時**: `bun run --bun --filter backend check-migrations` が未適用 migration 0 件で通る / schema.ts変更は`db:generate`(または特殊DDLのみ`db:generate:custom`)で生成したものであること
4. **新規ファイル**: SPDX ヘッダーを付けた (`.vue` / `.html` は HTML コメント形式、それ以外は TS コメント形式)
5. **ユーザー影響のある変更**: `CHANGELOG.md` の `## Unreleased` 配下の該当サブセクション (`### General` / `### Client` / `### Server`) に `- <Feat|Enhance|Fix>: <概要>` を 1 行追記
6. **locale safety**: `locales/` を編集した場合、`git diff --name-only develop -- 'locales/*.yml' | grep -v '^locales/ja-JP\.yml$'` が空 (ja-JP.yml 以外に差分が無い) ことを確認

### Validation commands

各チェックで使う Bun コマンド一覧。状況に応じて最も近いコマンドから検証する。

| 用途 | コマンド |
| --- | --- |
| 全体 lint (oxlint + oxfmt + typecheck) | `bun run lint` |
| 整形の自動修正 | `bun run format:ox` |
| Vue テンプレートの構文検査 | `bun run lint:vue-templates` |
| 未使用ファイル / export / 依存の検出 | `bun run lint:knip` |
| コピペ (重複コード) の検出 | `bun run lint:jscpd` |
| Backend unit test | `bun run --bun --filter backend test` |
| Backend e2e test | `bun run --bun --filter backend test:e2e` |
| Backend e2e test (本番と同じ bun ランタイム + Bun.sql) | `bun run --bun --filter backend test:e2e:bun` |
| Backend federation test | `bun run --bun --filter backend test:fed` |
| Frontend unit test | `bun run --bun --filter frontend test` |
| Migration 未適用チェック | `bun run --bun --filter backend check-migrations` |
| schema.ts差分からmigration自動生成 | `bun run --filter backend db:generate` |
| 特殊DDL(拡張機能/関数/INCLUDE等)用の空migration作成 | `bun run --filter backend db:generate:custom` |
| `misskey-js` 再生成 (API 変更後必須) | `bun run build-misskey-js-with-types` |
| 全体ビルド | `bun run build` |
| 開発サーバー (backend + frontend watch) | `bun run dev` |

**注意:** backend テスト (`test` / `test:e2e` / `test:fed`) 実行前に `.config/test.yml` が必要 (`cp .github/misskey/test.yml .config/test.yml` で作成)。

**grep する時の注意:** `.vue` は oxfmt の対象外なので、アロー関数の書式が `.ts` と揃っていない (`.ts` は `(x) =>` に統一済み、`.vue` は `x =>` が 73%)。`packages/` 全体を検索するときは `(x) =>` と `x =>` の両方を試すこと。理由と再検討の手掛かりは [.oxfmtrc.json](.oxfmtrc.json) の `$comment` を参照。

---

## 調査と待ち時間の進め方

このリポジトリは backend / frontend / migration / e2e が独立に大きく、検証も分単位で走る。
以下は「いつ発火するか」と「何を禁じるか」だけを決めた方針で、手段は任せる。

1. **サブエージェントへの委任は、本当に独立して並列化できる大きな仕事に限る**
   - 該当例: 複数パッケージにまたがる調査、影響範囲の広い洗い出し
   - 数回のツール呼び出しで自分で終わる仕事は委任しない。自分の作業の検証・再確認のために委任しない
   - 1 体で足りるなら 1 体にする。起動数は少なく保つ
   - `.claude/agents/` の 2 本 (`misskey-api-reviewer` / `vue-component-reviewer`) は PR レビュー専用

2. **長い処理を待つ間、メインループを空転させない**
   - 該当例: `bun run --bun --filter backend test:e2e` (数分)、`bun run dev` の起動、フルビルド
   - 待つのは構わないが、待っている間に「その結果に依存しない作業」を進めること
   - 結果待ちの `sleep` を目分量で延長しない。完了条件が判定できるなら `Monitor` で条件成立を待つ

3. **委任した仕事の完了は自動で通知される。ポーリングしない**
   - サブエージェントもバックグラウンドのコマンドも、終わればこちらへ通知が来る
   - 通知を待つためだけに `sleep` を挟むターンを作らない

**Why:** 1 は [Claude Opus 5 のプロンプティングガイド](https://platform.claude.com/docs/ja/build-with-claude/prompt-engineering/prompting-claude-opus-5#controlling-subagent-spawning) の推奨をそのまま採る
(同モデルは委任に積極的で、小さな仕事に適用するとコストと時間が倍増するため、上限を課す側が正しい)。
2 と 3 は実測 (2026-08-05、本リポジトリ) による: 結果待ちの `sleep` が 1 セッションで合計 38 分に達し、
うち 2 件は同じログを目分量で 2 回に分けて待っていた。別のセッションでは通知が届く相手を待つためだけの
`sleep` が 13 回・248 秒あった。

**未解決:** 上記とは逆に、1,131 ターン 3 時間 21 分のセッションでサブエージェントが 1 度も使われなかった観測がある (n=1)。
公式ガイドの「積極的に委任する」と食い違うため、1 を委任を促す向きへ変えるのは、
同種のセッションを複数観測してからにすること。
