---
name: shipping-misskey-change
description: Misskey の変更を利用者へ返す前、コミット・プッシュ・PR 作成前の検証を行う。
---

# 変更を返す前の確認

共通の安全条件と完了条件は [AGENTS.md](../../../AGENTS.md) を正本とする。この Skill は変更境界に応じた実行先を選ぶための手順であり、送信や DB 操作の許可を与えない。既に読んだ規則や、同じ変更状態で得た検証結果は使い回す。

## 変更と証拠を対応させる

要求された利用側の結果、変更した境界、その処理を共有する経路を確認し、各境界に必要な証拠を揃える。

- 不具合修正は、報告された失敗に対する修正確認を行う。既存テストの検出能力を維持し、期待値の緩和・skip・対象縮小で失敗を隠さない。
- API・DB・queue は、応答だけでなく保存状態と失敗・競合・再実行時の副作用を確認する。HTTP・WebSocket・連合を変更した場合は実際の通信境界を通す。
- UI は実ブラウザで対象操作を確認する。実行環境が無い場合は代替確認と未確認の表示・操作を分けて報告する。
- smoke は変更した経路の証拠であり、既存の認証・公開範囲・データ整合性・連合互換性の検証を一本で置き換えるものではない。
- 文書・設定は参照先と現行実装を照合する。調査だけで変更が無い場合は調査結果を証拠とし、DB や生成型のコマンドを実行しない。

## 実行先

コマンドはリポジトリルートから実行する。対象は [root scripts](../../../package.json) と [backend scripts](../../../packages/backend/package.json) に照合する。

| 変更対象 | 必要な確認 |
| --- | --- |
| 変更全体 | 最終状態で `bun run lint`。個別 typecheck や smoke の成功で代用しない |
| エージェント規則・入口 | `bun run lint:agent-instructions`。正本を更新した場合は `bun run sync:agent-instructions` で入口を生成してから検査する |
| API の `meta`・`paramDef`・`res`、公開 schema、型生成への入力 | [型再生成手順](references/tasks/regenerate-misskey-js.md) |
| `packages/backend/src/db/schema/`・migration | 下記の DB 確認 |
| 新規ファイル・locale・利用者影響 | AGENTS.md の SPDX・locale・CHANGELOG 条件を差分に適用する。CHANGELOG の編集先は [追記手順](references/tasks/changelog-update.md) |

`bun run lint` の対象は package script を正本とする。失敗時には失敗した検査と原因を記録し、関係ない期待値や設定を緩めない。

挙動の確認は変更に近い既存テストから選び、通信・連合・実ランタイムが契約なら対応する E2E まで含める。backend の `test` / `test:e2e` / `test:e2e:bun` / `test:fed` は `bun run --bun --filter backend <script>` で実行する。`.config/test.yml` が無い場合だけ `.github/misskey/test.yml` をコピーし、専用 DB 等の依存先を確認する。各 script が設定をコンパイルする。参照先は [backend CI](../../../.github/workflows/test-backend.yml) と [連合 CI](../../../.github/workflows/test-federation.yml)。

## DB 変更時だけ行うこと

- schema 変更は `bun run --filter backend db:generate`、自動検出できない DDL は `bun run --filter backend db:generate:custom` で生成し、SQL と journal を確認する。マージ済 migration は変更せず、forward-only の新規 migration とする。
- 接続先を隔離した検証 DB に固定し、最新の backend build を使って migration の適用と対象データ・制約を検証する。本番 DB へ接続したまま確認しない。
- 適用後、同じ検証 DB を指定して `bun run --bun --filter backend check-migrations` が未適用 migration 0 件で終わることを確認する。
- この check は [migration-runner.ts](../../../packages/backend/src/migration-runner.ts) の journal と DB の適用時刻の比較であり、schema 差分・SQL の正しさ・履歴改変を検出する検査ではない。管理 schema/table が無ければ作成するため、読み取り専用の調査コマンドとして使わない。

## 返す内容

成果物と要求への対応、実行した検証と結果、適用外の項目と理由、未実行の検証と不足する前提を返す。必要なら [API reviewer](../../agents/misskey-api-reviewer.md) または [Vue reviewer](../../agents/vue-component-reviewer.md) に対象差分・契約・証拠を渡すが、レビューは実行検証の代わりにはならない。性能・費用・品質の改善は、比較実測が無ければ未実証とする。
