<!-- AGENTS.md から生成。更新: bun run sync:agent-instructions -->

# Misskey 開発エージェント指針

このファイルはリポジトリ共通の判断と保護条件の正本。パスはリポジトリルート起点。詳細な設計意図と評価条件は `docs/agent-workflow-spec.md`、製品の内部最適化計画は `docs/optimization-plan.md` に置く。

## 目的と変更の判断

要求された結果を満たし、認証・公開範囲・データ整合性・upstream 連合を維持したうえで、性能と継続的な保守負担を改善する。行数、ファイル数、ツール回数、説明の短さを単独の目的にしない。

- 変更前に利用側の結果、保存・認可・非同期処理の境界、確認方法を把握する。共通処理を変える場合は他の呼び出し元も追う。利用者が報告した失敗を確認するためだけの再実行はせず、原因の切り分けと修正確認へ進む。
- 既存実装、標準機能、導入済み依存は、入力・権限・失敗時の意味が要求に合う場合に使う。factory・型・別ファイルの必要性は資源所有や変更範囲で判断し、利用数だけで消さない。
- 内部 API・型・配置・設定の破壊的変更は許容する。全利用箇所を切り替え、不要な旧 export・alias・分岐を残さない。利用者の明示要求を簡略版へ置き換えたり、無関係な機能を追加したりしない。
- DB 保存、queue 受理、相手での反映は別の完了条件。再実行の副作用、同時実行上限、キャンセル、終了時の資源解放を確認する。応答短縮と引き換えに無制限の滞留を増やさない。
- 独立した大きな変更だけを並行化し、共有ファイルの編集は調整する。利用可能な完了通知を使い、同じ出力の反復取得を待機手段にしない。

## 保護する契約

- token scope・利用者・役割・停止・ブロックを維持する。公開範囲は配送だけでなく API、ActivityPub 取得、cache、WebSocket でも守る。匿名通信や別アカウントへ認証情報・状態を渡さない。
- 投稿・集計・outbox、予約投稿の draft ロック・再検証・投稿・削除など、現在の transaction 境界を理解して変更する。再配送は冪等な最終状態を検証し、外部副作用の exactly-once を仮定しない。
- actor/object の識別、署名、宛先、Follow/Undo/Delete/Move の意味と upstream 連合を維持する。同 fork 同士のテスト成功を、独立 upstream との互換性証明にしない。
- 外部接続先・redirect・署名者の検証、接続予算、セッションロック、migration journal を、簡素化の都合で省略しない。失敗を握りつぶして成功扱いにする fallback を作らない。
- 既存テストが守る挙動と回帰検出能力を維持する。実装形状の assertion は利用側の契約へ移し、skip・期待値の追認・対象縮小で不具合を隠さない。

## 編集・データ・外部操作の制約

- 説明コメントは日本語で、現在の制約・不変条件・実測値・非自明な選択理由を書く。処理の言い換え、概念メタファー、変更履歴は残さない。SPDX、検査指示、仕様識別子、コメント構文 fixture は別扱い。
- 新規コードの SPDX 対象と除外は `.github/workflows/check-spdx-license-id.yml` を確認する。AGPL 対象には `SPDX-FileCopyrightText: syuilo and misskey-project` と `SPDX-License-Identifier: AGPL-3.0-only` を付ける。Vue/HTML は HTML コメント、TS/JS/SCSS はブロックコメント。MIT の `packages/misskey-js` 等は固有のライセンスに従い、既存の権利表記を消さない。
- locale YAML の手動変更は `locales/ja-JP.yml` のみ。他言語は Crowdin 管理。対象ブランチとの差分で他言語変更があれば、手動変更か自動配信かを区別する。
- マージ済の `packages/backend/migration/*.sql` と `_legacy/` は変更しない。通常の schema 変更は `db:generate`、特殊 DDL は `db:generate:custom` で新規 migration を作る。forward-only。DB 初期化・既存データ削除は内部互換廃止とは別の操作であり、無断で実施しない。
- secrets・本番設定値・token・秘密鍵をコミットしない。テストは専用の設定と DB/Valkey を使い、既存設定を無断で上書きしない。
- `main` / `develop` / `master` へ force-push しない。`git commit --no-verify`、共有済みコミットの amend、他人のブランチの破壊的 reset/delete、無断の `git config` 変更をしない。
- PR の merge/close、外部サービスへの投稿・送信は利用者の明示指示がある場合だけ行う。公開前に秘密情報を除く。脆弱性は通常 Issue/PR に詳細を投稿せず、`SECURITY.md` と起票 Skill の非公開手順を確認する。

## 作業に応じて読む場所

Skills の正本は `.claude/skills/`。対象を編集する前に該当 Skill を読む。既に読んだ内容は変更されていなければ再読不要で、参照文書は今回の境界に必要なものだけ開く。description は索引であり、読まれたことの保証ではない。

| 対象 | 入口 |
| --- | --- |
| backend のコード・schema・migration・テスト | `.claude/skills/working-on-backend/SKILL.md` |
| frontend・embed/shared/SW の UI 境界、UI 向け locale | `.claude/skills/working-on-frontend/SKILL.md` |
| 変更を返す・commit・PR 前の検証 | `.claude/skills/shipping-misskey-change/SKILL.md` |
| Issue/PR の作成・外部送信 | `.claude/skills/creating-issues-and-prs/SKILL.md` |
| 指示の読込範囲・重複・常駐量の調査 | `.claude/skills/context-budget/SKILL.md` |

backend は Bun/Hono/drizzle と明示的な依存の組み立て、frontend は Vue を使用する。現在の入口は `packages/backend/src/runtime-dependencies.ts`、`packages/backend/src/server/rest/endpoint-definition.ts`、`packages/frontend/src/_boot_.ts`。過去の説明より現行コード・設定・テストに照合し、不一致を黙って無視せず正本を修正する。

## 検証と引き渡し

変更した境界に近い検証から実施し、最後に全体の整合を確認する。恒久テストは現実的な回帰を検出できる場合に追加し、確認だけの一時コードは結果を残して除去する。

- バグ修正は報告された失敗が修正後に起きないことを確認する。API/DB/queue は結果と保存・副作用、HTTP/WS/連合は実通信、UI は実操作を確認する。使える実行環境がない場合は代替検証と未確認範囲を明記する。
- 性能は実バイナリ、revision、データ、負荷を固定して複数回比較する。本文・順序・権限・副作用を性能指標とは別に確認し、失敗を都合よく除外しない。
- `bun run lint` を通す。API の `meta` / `paramDef` / `res` 変更時は `bun run build-misskey-js-with-types` を実行し、生成差分を含める。
- schema/migration 変更時は生成 SQL を確認して専用 DB へ適用し、`bun run --bun --filter backend check-migrations` で未適用 migration がないことを確認する。これは実 DB schema との完全一致の検査ではない。
- ユーザーに見える機能・挙動変更は `CHANGELOG.md` の `## Unreleased` 配下の General/Client/Server に `- <Feat|Enhance|Fix>: <概要>` を追記する。
- 実行コマンドの正本はルートと各 package の `package.json`。backend テスト前に `.config/test.yml` を用意し、未作成時だけ `.github/misskey/test.yml` からコピーする。必要な unit/e2e/external e2e/federation は変更境界で選び、lint の成功で代用しない。
- 成果物、実行結果、未実行・失敗・残存リスクを区別して報告する。文面の短さのために要件や根拠を落とさず、求められた分析・説明は省略しない。

## 入口の同期

Claude は `CLAUDE.md` から本書を取り込み、Codex は本書と `.agents/skills/` の参照入口を読む。Copilot 用 `.github/copilot-instructions.md` は本書から生成し、単体でも共通条件を渡す。

正本変更後は `bun run sync:agent-instructions`、差分検査は `bun run lint:agent-instructions`。後者は `bun run lint` に含む。生成先を独立に編集しない。既存のプラグイン・個人設定・上位指示はこの生成処理で変更しない。
