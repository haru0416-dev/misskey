# drizzle-orm モデル / migration パターン

Misskey backend は 2026-07-07 に TypeORM を全廃し、drizzle-orm + PostgreSQL 構成になった。`@Entity` / `@Column` / `@Index` デコレータは存在しない。テーブル定義・アプリ内モデル・migration DDL は **3 つの別ファイル** に分かれており、変更時はこの 3 つを手動で同期させる必要がある。

## 3 つの場所

| 役割 | 場所 | 形式 |
|---|---|---|
| クエリ用のテーブル定義 (drizzle-orm) | `packages/backend/src/db/schema/<name>.ts` | `pgTable('<table>', { ... })` |
| アプリ内で扱う型付きオブジェクト | `packages/backend/src/models/<Name>.ts` | プレーンクラス (`export class MiXxx { public field: T; constructor(data: Partial<MiXxx>) {...} }`) |
| 本番 DB に反映する DDL | `packages/backend/migration/{unixMs}-{name}.js` | 手書き raw SQL (`queryRunner.query(...)`) |

drizzle-kit のようなスキーマ差分からの自動 migration 生成ツールは導入されていない (`drizzle-kit` は依存に無い)。**`db/schema/*.ts` を変更しても migration は自動生成されない** — 変更したら手で `packages/backend/migration/` に新規ファイルを追加する。

### `db/schema/*.ts` の例

```ts
import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export const accessToken = pgTable('access_token', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	permission: varchar({ length: 64 }).array().default(sql`'{}'::character varying[]`).notNull().$type<string[]>(),
	fetched: boolean().default(false).notNull(),
}, table => [
	index('IDX_9949557d0e1b2c19e5344c171e').on(table.userId),
]);

export type AccessTokenRow = typeof accessToken.$inferSelect;
export type AccessTokenInsert = typeof accessToken.$inferInsert;
```

`$type<T>()` で TypeORM 時代の型 (`MiUser['id']` 等) をそのまま引き継げる。既存 index 名 (`IDX_...`) は TypeORM が生成していたものをそのまま踏襲しているファイルが多い。

### `models/<Name>.ts` の例

```ts
export class MiUser {
	public id: string;
	public username: string;
	// ... フィールド列挙

	constructor(data: Partial<MiUser>) {
		if (data == null) return;
		for (const [k, v] of Object.entries(data)) {
			(this as Record<string, unknown>)[k] = v;
		}
	}
}
```

デコレータは一切無い。zod スキーマ (`localUsernameSchema` 等のバリデーション用定数) が同じファイルに併記されることもある。

## migration ファイルの構造

各ファイル `packages/backend/migration/{unixMs}-{descriptive-name}.js` は ESM JS。最小形:

```js
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class PascalCaseName1234567890123 {
    name = 'PascalCaseName1234567890123'

    async up(queryRunner) {
        await queryRunner.query(`...`);
    }

    async down(queryRunner) {
        await queryRunner.query(`...`);  // up の完全な巻き戻し
    }
}
```

`packages/backend/src/migration-runner.ts` がこのディレクトリを読み込み、`migrations` テーブルで適用済みかどうかを管理する自前ランナー (TypeORM CLI ではない)。詳細手順は [tasks/creating-migration.md](../tasks/creating-migration.md) を参照。**マージ済 migration の編集は絶対禁止**。

**2026-07-03 に migration 履歴が [migration/0000000000001-InitialSchema.js](../../../../../packages/backend/migration/0000000000001-InitialSchema.js) 1 本へ squash された。** それ以前のタイムスタンプを持つ migration ファイルは repo 上に存在しない。squash 後の migration は本稿執筆時点で 8 本のみで、いずれもインデックス追加/調整が中心 (`packages/backend/migration/` を `ls` して現況を確認すること)。以下の参照実装リンクは **すべて squash 後の実在ファイル** に限定してある。

## CONCURRENTLY (CREATE INDEX CONCURRENTLY) の扱い

大規模テーブルへの `CREATE INDEX` は本番で長時間ロックする恐れがある。`CONCURRENTLY` で発行するときは migration class に **「この migration は transaction を張らない」と指示する** 必要がある。PostgreSQL は `CREATE INDEX CONCURRENTLY` を transaction 内で実行できないため。

参照実装: [migration/1783491564196-AddTrgmSearchIndexes.js](../../../../../packages/backend/migration/1783491564196-AddTrgmSearchIndexes.js), [migration/1782863440578-AddDatabaseTuningIndexes.js](../../../../../packages/backend/migration/1782863440578-AddDatabaseTuningIndexes.js) (どちらも実運用中の環境変数分岐)

```js
const isConcurrentIndexMigrationEnabled = process.env.MISSKEY_MIGRATION_CREATE_INDEX_CONCURRENTLY === '1';

export class AddTrgmSearchIndexes1783491564196 {
    name = 'AddTrgmSearchIndexes1783491564196'
    transaction = isConcurrentIndexMigrationEnabled ? false : undefined

    async up(queryRunner) {
        const concurrently = isConcurrentIndexMigrationEnabled ? 'CONCURRENTLY ' : '';
        await queryRunner.query(`CREATE INDEX ${concurrently}IF NOT EXISTS "IDX_NOTE_TEXT_TRGM" ON "note" USING gin (lower("text") gin_trgm_ops)`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_NOTE_TEXT_TRGM"`);
    }
}
```

要点:

- **`transaction = isConcurrentIndexMigrationEnabled ? false : undefined;`** が必須。これがないと `CREATE INDEX CONCURRENTLY` が transaction 内で実行されて `ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block` で失敗
- 環境変数 `MISSKEY_MIGRATION_CREATE_INDEX_CONCURRENTLY=1` がデフォルト OFF。OFF のときは普通の `CREATE INDEX` (transaction 内) で動く必要がある。`up`/`down` 双方を環境変数で分岐させる
- [migration-runner.ts](../../../../../packages/backend/src/migration-runner.ts) の `runMigrations()` は、pending な migration すべての `transaction` が `false` でなければ (=undefined ばかりなら) それら全体を 1 つの transaction にまとめて実行し、1 つでも `transaction === false` があれば migration ごとに個別実行する。`transaction: false` を指定した migration は他の pending migration と同時に走らない前提で書くこと
- [migration/1782863440578-AddDatabaseTuningIndexes.js](../../../../../packages/backend/migration/1782863440578-AddDatabaseTuningIndexes.js) の `down()` コメントにある通り、`migration-runner.ts` の revert 経路は `transaction: false` を指定していても常に通常 DDL (非 CONCURRENTLY) でロールバックする前提で書かれている。`down()` で `CONCURRENTLY` を使う必要はない

## migration 難ケース集

手書きで踏み外しやすいパターンを「**なぜ危険か → up の形 → down 戦略**」でまとめる。**squash 後の 8 本は全てインデックス関連で、下記の NOT NULL 追加・enum 変更・列リネーム等を実演する参照実装は現在のリポジトリに存在しない** — SQL 自体は汎用的な PostgreSQL の知識なので、パターンとして頭に入れつつ実際に書くときは類似の既存 migration (無ければ [InitialSchema.js](../../../../../packages/backend/migration/0000000000001-InitialSchema.js) 内の該当テーブル定義) と見比べてスタイルを揃えること。

共通の鉄則: `down()` は `up()` の **完全な巻き戻し**。下記ケースは「単純な逆 SQL では戻らない」ものが多い。

### 1. NOT NULL 列の追加

**なぜ危険か**: 既存行があるテーブルに `NOT NULL` 列を `DEFAULT` 無しで足すと、既存行を埋められず `ALTER TABLE` が失敗する。

- **既定値で良い場合** — `DEFAULT` を付ければ 1 文で済む。これが最も多い

  ```js
  // up
  await queryRunner.query(`ALTER TABLE "note_draft" ADD "isActuallyScheduled" boolean NOT NULL DEFAULT false`);
  // down
  await queryRunner.query(`ALTER TABLE "note_draft" DROP COLUMN "isActuallyScheduled"`);
  ```

- **行ごとに計算した値で埋めたい / 既定値を後で外したい場合** — 3 段に分ける: ①nullable で追加 → ②`UPDATE` でバックフィル (ケース 3 参照) → ③`ALTER COLUMN ... SET NOT NULL`。`down` は `DROP COLUMN` で良い。巨大テーブルでは ② の `UPDATE` と ③ の `SET NOT NULL` (全行スキャン) が長時間ロックし得る点に注意

**補足:** `db/schema/*.ts` 側で `.default(...)` を付けても migration の DDL は自動生成されない (drizzle-kit 未導入)。DB 既定値が必要か、アプリ実行時に常に値を入れるので不要かを判断して `DEFAULT` 句の有無を手で決める。

### 2. enum 型の値の追加・変更

**なぜ危険か**: PostgreSQL の enum は **値を削除できない** (`ALTER TYPE ... DROP VALUE` は存在しない) ため、`ADD VALUE` した変更を素直に巻き戻せない。さらに migration は基本的に 1 トランザクションで実行され得る (上記 CONCURRENTLY 節参照) ので、`ADD VALUE` で足した値を同一トランザクション内で使う処理もエラーになる。そこで **「旧型を rename → 新型を CREATE → 列を新型へ ALTER (USING キャスト) → 旧型を DROP」** という巻き戻し可能な手順に従う。

```js
// up: 値 'app' を追加する例 (新値を含む型へ載せ替える)
await queryRunner.query(`ALTER TYPE "public"."notification_type_enum" RENAME TO "notification_type_enum_old"`);
await queryRunner.query(`CREATE TYPE "public"."notification_type_enum" AS ENUM('follow', 'mention', /* ... */ 'app')`);
await queryRunner.query(`ALTER TABLE "notification" ALTER COLUMN "type" TYPE "public"."notification_type_enum" USING "type"::"text"::"public"."notification_type_enum"`);
await queryRunner.query(`DROP TYPE "public"."notification_type_enum_old"`);
```

```js
// down: 新値を含まない旧い値集合へ同じ手順で戻す
await queryRunner.query(`ALTER TYPE "public"."notification_type_enum" RENAME TO "notification_type_enum_old"`);
await queryRunner.query(`CREATE TYPE "public"."notification_type_enum" AS ENUM('follow', 'mention', /* ... 'app' を除く ... */)`);
await queryRunner.query(`ALTER TABLE "notification" ALTER COLUMN "type" TYPE "public"."notification_type_enum" USING "type"::"text"::"public"."notification_type_enum"`);
await queryRunner.query(`DROP TYPE "public"."notification_type_enum_old"`);
```

要点: ①列がデフォルトを持つ場合は ALTER 前に `DROP DEFAULT`、ALTER 後に `SET DEFAULT` を挟む。②配列列 (`mutingNotificationTypes` 等) は `TYPE "..."[] USING "col"::"text"::"..."[]` と配列キャストにする。③**`down` の落とし穴**: 削除する値を既存行が使っていると `USING` キャストが「該当 enum に存在しない」で失敗する。新値を追加しただけの直後の巻き戻しは安全だが、運用後に使われた値を消す巻き戻しは本質的に危うい — その場合は down で先に `UPDATE ... SET "type" = '<代替値>' WHERE "type" = '<消す値>'` で退避してからキャストする。

### 3. データ移行 (UPDATE バックフィル)

**なぜ危険か**: migration 内の `UPDATE` は本番の全行を触る可能性がある。大量行では長時間ロック・トランザクション肥大を招く。

- 既定値を入れるだけなら `UPDATE ... WHERE col IS NULL` で冪等に書く。複数回流れても安全な形にする
- 巨大テーブルの全行更新は避けるのが基本。どうしても必要なら CONCURRENTLY 同様にバッチ分割や別運用を検討し、PR で相談する
- `down` で元値に戻せないデータ移行 (情報が失われる変換) は、`down` に戻せない旨をコメントで明示し、最低限スキーマだけは巻き戻す

```js
// up: nullable 追加 → バックフィル → NOT NULL 化
await queryRunner.query(`ALTER TABLE "user_profile" ADD "github" boolean`);
await queryRunner.query(`UPDATE "user_profile" SET "github" = FALSE WHERE "github" IS NULL`);
await queryRunner.query(`ALTER TABLE "user_profile" ALTER COLUMN "github" SET NOT NULL`);
```

### 4. JSONB / 配列列のデフォルト

**なぜ危険か**: 既定値リテラルの書式を誤ると既存 migration とスタイルがズレる。実績ある書式に揃える。

```js
await queryRunner.query(`ALTER TABLE "user_profile" ADD "room" jsonb NOT NULL DEFAULT '{}'`);          // オブジェクト
await queryRunner.query(`ALTER TABLE "bubble_game_record" ADD "logs" jsonb NOT NULL DEFAULT '[]'`);     // 配列(JSON)
await queryRunner.query(`ALTER TABLE "meta" ADD "pinnedUsers" character varying(256) array NOT NULL DEFAULT '{}'::varchar[]`); // PG 配列型
```

`down` はいずれも `DROP COLUMN`。

### 5. 安全な DROP と COMMENT

- **DROP の冪等性**: 状況により対象が無いことがある DROP は `IF EXISTS` を付ける (`DROP INDEX IF EXISTS "..."`)。ただし無闇に付けると本来検出すべき不整合を隠すので、「条件付きで存在する」と分かっている時だけにする
- **COMMENT ON COLUMN**: Misskey は denormalize した列に `'[Denormalized]'` コメントを付ける慣習がある。`up` で付与したら `down` でも対称に書く

  ```js
  await queryRunner.query(`COMMENT ON COLUMN "note"."renoteChannelId" IS '[Denormalized]'`);
  ```

### 6. 列リネーム

「DROP 旧列 + ADD 新列」で書くと **データが消える**。意図がリネームなら `ALTER TABLE "t" RENAME COLUMN "old" TO "new"` (down は逆) で書くこと。
