# Backend

サーバー実装。Hono ベースの HTTP / REST レイヤと、drizzle-orm によるデータアクセス、
ジョブキュー、ActivityPub 連合処理を含む。DI コンテナは使わず、`createXxx()` ファクトリで
サービスを組み立てる。

- REST エンドポイント: `src/server/rest/` (契約は `contracts/`、実装は `endpoints/`)
- DB スキーマ: `src/db/schema/` (変更後は `bun run --filter backend db:generate` で migration を生成)
- テスト: `test/unit`、`test/e2e`、`test-federation/`

開発環境の準備・テストの走らせ方は [ルートの CONTRIBUTING.md](/CONTRIBUTING.md) を参照。

## migration

`migration/0000_init.sql` が schema 全体を作る。拡張機能・enum・関数、テーブルとローカル制約・index、外部キー、初期データ、トリガの順に並べ、`drizzle-kit` で出力できない DDL (チャート表・関数 index・trigram index・トリガ) も含む。
`bun run migrate` は、`migration/meta/_journal.json` の順に未適用の migration を、advisory lock を持つ 1 つのセッションで適用する。履歴のない既存 schema には適用できず、エラーになる。

schema を変えるときは `db:generate`、特殊 DDL は `db:generate:custom` で新しい migration を足す。適用済みの SQL は書き換えない。`migration/_legacy/` は、drizzle-kit へ移る前の手書き JS の記録で、実行には使わない。
