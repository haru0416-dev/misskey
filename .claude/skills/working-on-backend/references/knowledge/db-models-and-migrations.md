# DB 定義と migration の判断

## 定義・アプリ型・適用履歴を分ける

| 対象 | 現行の入口 |
| --- | --- |
| drizzle のテーブル・列・index・外部キー | [src/db/schema](../../../../../packages/backend/src/db/schema/) |
| アプリ内のモデル | [src/models](../../../../../packages/backend/src/models/) |
| 生成する SQL・journal・snapshot | [migration](../../../../../packages/backend/migration/) と [drizzle.config.ts](../../../../../packages/backend/drizzle.config.ts) |
| 適用と未適用検査 | [migration-runner.ts](../../../../../packages/backend/src/migration-runner.ts) |

[access-token.ts](../../../../../packages/backend/src/db/schema/access-token.ts) は `pgTable`、型付き列、外部キー、index、`$inferSelect`・`$inferInsert`、モデルへの変換の実例。モデルのフィールド追加だけでは DB は変わらず、schema の変更だけでは既存 DB は更新されない。関連する deserialize・packing・API schema への波及も確認する。

外部キーの削除時挙動、null の意味、既定値、時刻・ID の型を既存定義に合わせる。循環・自己参照の列は近い schema の `AnyPgColumn` 注釈を使う。既存データを保持すべき rename を drop/add に置換しない。

## 生成結果で判断する

通常の DDL は `bun run --filter backend db:generate`、生成で表せない拡張機能・関数・index 詳細・データ補正は `bun run --filter backend db:generate:custom` を使う。生成コマンドは [backend package.json](../../../../../packages/backend/package.json) にある。journal・snapshot と SQL の対応を維持し、同じ DDL を通常生成と custom の両方へ重ねない。

| 変更 | 確認すること |
| --- | --- |
| NOT NULL 列追加 | 既存行を埋める値と、その値が契約上正しいこと。必要なら nullable 追加・backfill・制約追加を設計する |
| 列・型の rename | データを維持する SQL になっていること。生成時の rename 判定を未確認で採用しない |
| enum 変更 | 既存値の変換、依存列、同じ transaction での新しい値の使用可否を実適用で確認する |
| 外部キー・unique 制約 | 既存行の違反、削除の連鎖、並行書込みとの関係 |
| backfill・index | 対象行数、ロック時間、transaction の大きさ、失敗後の再実行と回復方法 |

大量データを扱う変更は、一括更新でよいか、段階的なデータ移行と制約確定が必要かを決める。消したデータが逆 DDL だけで戻るという説明をしない。

## runner の保証と限界

runner は `pool.connect()` で確保した同一 client 上で advisory lock、pending 判定、drizzle の migrate、unlock、timeout 復元を行い、最後に release する。ロック取得と DDL を別セッションへ分ける最適化はこの保証を失う。セッション状態を戻せない接続を正常なものとして pool に返さない。

標準 migrator の transaction では `CREATE INDEX CONCURRENTLY` は使えない。手動の concurrent 作成と通常 migration の同一 `CREATE` を併記する方式を手順化しない。オンライン DDL が必要なら適用識別・index 有効性・再実行・失敗回復・journal 整合の運用設計を先に確定する。

forward-only の適用履歴を保ち、訂正は新しい migration にする。`migration/_legacy/` は実行手順の見本にしない。`check-migrations` は journal と DB 最新適用時刻の比較であり、schema 差分や SQL 改変の検査ではない。管理 schema/table の作成も起こり得る。生成・適用・検査の具体的な順序は [migration 作業](../tasks/creating-migration.md) にまとめる。
