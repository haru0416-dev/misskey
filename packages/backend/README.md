# Backend

サーバー実装。Hono ベースの HTTP / REST レイヤと、drizzle-orm によるデータアクセス、
ジョブキュー、ActivityPub 連合処理を含む。DI コンテナは使わず、`createXxx()` ファクトリで
サービスを組み立てる。

- REST エンドポイント: `src/server/`
- DB スキーマ: `src/db/schema/` (変更後は `bun run --filter backend db:generate` で migration を生成)
- テスト: `test/unit`、`test/e2e`、`test-federation/`

開発環境の準備・テストの走らせ方は [ルートの CONTRIBUTING.md](/CONTRIBUTING.md) を参照。
