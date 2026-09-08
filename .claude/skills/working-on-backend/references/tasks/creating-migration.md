# DB migration を作成する

履歴・データ・接続先の安全条件は [AGENTS.md](../../../../../AGENTS.md)。migration は forward-only で、取り消しも新しい migration として行う。逆方向の DDL で消失済みデータが復元できるとは限らない。

## 生成するもの

[drizzle.config.ts](../../../../../packages/backend/drizzle.config.ts) は `src/db/schema/*.ts` を入力、`migration/` を出力にする。

- 通常の schema 変更は `packages/backend/src/db/schema/` と利用するモデル・クエリを更新し、ルートから `bun run --filter backend db:generate` を実行する。
- 拡張機能・関数・生成で表現できない index 定義・データ補正などは `bun run --filter backend db:generate:custom` で空の SQL を生成して実装する。対応範囲は導入済み drizzle-kit と生成結果に照合する。
- SQL と、生成された `migration/meta/_journal.json`・snapshot を一緒に扱う。journal や snapshot の手修正で生成漏れ・適用済み判定を取り繕わない。
- 生成 SQL を読み、列 rename が drop/add に化けていないか、既存行の NOT NULL・enum・外部キーを満たすか、削除対象・ロック・バックフィル量を確認する。[DB と migration](../knowledge/db-models-and-migrations.md) に判断点を示す。

## 隔離 DB で確認する

使用する設定と接続先を確定し、テスト用なら各コマンドに `NODE_ENV=test` を設定する。現在のソースに対応する backend build を用意してから実行する。`migrate` と `check-migrations` は生成 SQL ではなく built の runner を使う。

| ルートからのコマンド | 観測するもの |
| --- | --- |
| `bun run migrate` | 未適用 migration の実適用。接続先の DB を変更する |
| `bun run --bun --filter backend check-migrations` | 接続先 DB に journal 上の未適用 migration がないこと |

`check-migrations` は [migration-runner.ts](../../../../../packages/backend/src/migration-runner.ts) の `check`。journal の `when` を DB の最新 `created_at` と比較する。schema 定義と実 DB の差分、DDL の生成漏れ、既存 SQL の改変を検査するものではない。管理 schema/table がなければ `CREATE` するため、完全な読み取り専用でもない。

新規 DB と、影響を受ける既存データがある DB の適用結果を確認する。未適用件数ゼロだけでデータ移行の正しさを結論しない。失敗時の transaction・接続解放や再実行結果まで、今回触った境界に必要な観測を選ぶ。

## 実行方式の制約

runner は一つの接続で advisory lock、pending 判定、migration、unlock を行う。別セッションで取った lock や pool の別接続へ分割しない。接続・timeout の所有者を維持する。

標準 migrator は transaction 内で実行するため `CREATE INDEX CONCURRENTLY` をそのまま投入できない。手動作成後に同一 index の `CREATE` を通常 migration に残す手順も採らない。オンライン DDL が必要なら、適用済みの識別、既存 index の定義と有効性、失敗回復、再実行、journal との整合を定めた運用設計が必要であり、通常手順の延長で実行しない。
