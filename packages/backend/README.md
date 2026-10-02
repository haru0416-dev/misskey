# Backend

サーバー実装。Hono ベースの HTTP / REST レイヤと、drizzle-orm によるデータアクセス、
ジョブキュー、ActivityPub 連合処理を含む。DI コンテナは使わず、`createXxx()` ファクトリで
サービスを組み立てる。

- REST エンドポイント: `src/server/rest/` (契約は `contracts/`、実装は `endpoints/`)
- DB スキーマ: `src/db/schema/` (変更後は `bun run --filter backend db:generate` で migration を生成)
- テスト: `test/unit`、`test/e2e`、`test-federation/`

開発環境の準備・テストの走らせ方は [ルートの CONTRIBUTING.md](/CONTRIBUTING.md) を参照。

## 新規 DB の初期化と migration

`bun run migrate` は、適用履歴がなく public schema が空の DB に限り、`migration/baseline/manifest.json` の順序で分割 SQL を実行する。
baseline は履歴の追加・ALTER・削除を反映した最終状態で、拡張機能・enum・関数、テーブルとローカル制約・index、外部キー、初期データ、トリガに分けている。
SQL と実際に実行した内容のハッシュを持つ checkpoint は、同じ advisory lock セッションの transaction で確定する。

適用履歴がある DB では baseline を実行せず、従来の SQL を順に適用する。`migration/*.sql`、`meta/`、`_legacy/` は履歴として保持し、統合のために書換・削除しない。
baseline が覆う履歴より後の migration は、新規 DB でも通常どおり適用される。履歴のない既存 schema は初期化せず、エラーにする。

schema 変更時は引き続き `db:generate`、特殊 DDL は `db:generate:custom` で新しい migration を追加する。
新規初期化用 baseline の更新には、接続先と同じ major version に対応する `pg_dump` と、scratch DB を作成・削除できる管理接続が必要になる。

```sh
bun run --bun --filter backend db:generate:baseline 'postgresql://USER@HOST:PORT/postgres'
```

生成処理はランダム名の専用 DB に履歴を適用して最終 schema と初期データを取得し、その DB だけを削除する。既存のアプリ DB や設定ファイルは読み書きしない。
接続情報は生成物に保存しない。実行後は分割 SQL の差分を確認し、専用 DB で初期化、旧履歴との一致、再実行、`check-migrations` を検証する。
