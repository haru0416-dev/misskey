# drizzle-orm モデル / migration パターン

Misskey backend は 2026-07-07 に TypeORM を全廃し、drizzle-orm + PostgreSQL 構成になった。`@Entity` / `@Column` / `@Index` デコレータは存在しない。テーブル定義・アプリ内モデル・migration DDL は **3 つの別ファイル** に分かれている。

2026-07-09 に drizzle-kit を導入し、`db/schema/*.ts` の変更から migration SQL を自動生成できるようになった(それ以前は migration も手書きJSだった)。

## 3 つの場所

| 役割 | 場所 | 形式 |
|---|---|---|
| クエリ用のテーブル定義 (drizzle-orm) | `packages/backend/src/db/schema/<name>.ts` | `pgTable('<table>', { ... })` |
| アプリ内で扱う型付きオブジェクト | `packages/backend/src/models/<Name>.ts` | プレーンクラス (`export class MiXxx { public field: T; constructor(data: Partial<MiXxx>) {...} }`) |
| 本番 DB に反映する DDL | `packages/backend/migration/{0000,0001,...}_{name}.sql` | drizzle-kit生成のSQL (+ `meta/_journal.json`) |

**`db/schema/*.ts` を変更したら `bun run --filter backend db:generate` を実行して migration を生成する** — 詳細手順は [tasks/creating-migration.md](../tasks/creating-migration.md) を参照。

### `db/schema/*.ts` の例 (FK込み)

```ts
import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { user } from './user.js';

export const accessToken = pgTable('access_token', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	permission: varchar({ length: 64 }).array().default(sql`'{}'::character varying[]`).notNull().$type<string[]>(),
	fetched: boolean().default(false).notNull(),
}, table => [
	index('IDX_9949557d0e1b2c19e5344c171e').on(table.userId),
]);

export type AccessTokenRow = typeof accessToken.$inferSelect;
export type AccessTokenInsert = typeof accessToken.$inferInsert;
```

`$type<T>()` で TypeORM 時代の型 (`MiUser['id']` 等) をそのまま引き継げる。既存 index 名 (`IDX_...`) は TypeORM が生成していたものをそのまま踏襲しているファイルが多い。

**外部キー**: `.references(() => 対象テーブル.対象カラム, { onDelete: 'cascade' | 'set null' | 'restrict' | 'no action' | 'set default' })` で宣言する。2ファイル間で相互参照(循環import)になる場合(例: `user.ts` の avatarId が `drive-file.ts` を参照し、`drive-file.ts` の userId が `user.ts` を参照する)は、TypeScriptの型推論が循環するため片方(または両方)で明示的な戻り値型アノテーションを使う:

```ts
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

avatarId: varchar({ length: 32 }).references((): AnyPgColumn => driveFile.id, { onDelete: 'set null' }),
```

同一テーブルの自己参照(例: `drive_folder.parentId -> drive_folder.id`)も同じ `AnyPgColumn` パターンが必要。

1つのカラムに複数のFKを持たせたい場合(稀)は、column-levelの`.references()`に加えてテーブル配列側で`foreignKey({ columns: [table.col], foreignColumns: [other.col] }).onDelete('cascade')` を追加する。

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

## migrationファイルの構造 (drizzle-kit生成)

`packages/backend/migration/` 配下は `{0000,0001,...}_{name}.sql` の連番ファイル + `meta/_journal.json`(適用順とタイムスタンプの記録) + `meta/{N}_snapshot.json`(その時点のスキーマ全体のスナップショット、次回generateの差分基準)。

- `0000_baseline.sql` : drizzle-kit移行時のベースライン(当時のschema.ts全体を再現)
- `0001_chart_tables_and_manual_ddl.sql` : drizzle-kitが検出できない特殊DDL(チャート集計テーブル・関数・拡張機能等、後述)をまとめた手書きファイル
- それ以降は通常 `bun run --filter backend db:generate` で1個ずつ増えていく

`packages/backend/src/migration-runner.ts` が `drizzle-orm/node-postgres/migrator` の `migrate()` に委譲し、`drizzle.__drizzle_migrations` テーブル(drizzle標準のブックキーピング、`created_at`とjournalの`when`を比較するだけで適用済み判定する)で管理する。**マージ済 migration の編集は絶対禁止**。

**forward-only** — drizzle-kitはdown migrationを生成しない。変更を取り消したい場合は「取り消すDDLを持つ新しいmigration」を追加する(例: 追加した列を消したいなら新規migrationで`ALTER TABLE ... DROP COLUMN`)。

`packages/backend/migration/_legacy/` に旧TypeORM/手書きJS時代のmigration 10本を歴史的参照として保持しているが、実行系(migration-runner.ts)からは完全に外れている。

## drizzle-kitで自動生成できないDDL

以下は `db/schema/*.ts` の宣言的定義では表現できないため、`bun run --filter backend db:generate --custom` で空ファイルを作り、生SQLを手書きする対象:

- **拡張機能** (`CREATE EXTENSION IF NOT EXISTS pg_trgm` 等) — drizzle-kitに対応する概念が無い
- **関数** (`CREATE OR REPLACE FUNCTION ...`) とそれを使う関数インデックス — ストアドプロシージャの概念が無い
- **`INCLUDE` 句を持つカバリングインデックス** — `IndexConfig` 型に`INCLUDE`フィールドが無い
- **既存インデックスへの事後 `ALTER INDEX ... SET (fastupdate = off)`** — ただし**新規作成時**なら `index(...).with({ fastupdate: false })` で表現可能(`note.ts`のGINインデックス群を参照)
- **`gin_clean_pending_list()` のようなワンショットのメンテナンス関数呼び出し**
- **同一カラムへの複数インデックス共存**(例: 通常btree + `varchar_pattern_ops`付きbtree)で、drizzle-kitの差分検出の安定性が未検証なもの — この場合、`--custom`側で直接管理し `db/schema/*.ts` には載せない判断もあり得る(実例: `user.usernameLower` への `IDX_USER_USERNAME_LOWER_PATTERN`)
- **重複行削除のDML・環境変数分岐による実行方法の切替・`COMMENT ON INDEX`ベースの出所トラッキング**等の手続き型ロジック

それ以外(カラム追加/削除、単純index、通常の外部キー、enum追加)は`db:generate`で自動生成される。

## CONCURRENTLY (CREATE INDEX CONCURRENTLY) の扱い — 標準ワークフローでは使用不可

`drizzle-orm/node-postgres/migrator`の`migrate()`は**pending migration全体を1つのtransactionにまとめて実行する**(`pg-core/dialect.js`の`PgDialect.migrate`を参照)。PostgreSQLは`CREATE INDEX CONCURRENTLY`をtransaction内で実行できないため、**標準の`db:generate`/`db:generate:custom`ワークフローではCONCURRENTLYは使えない**。

大規模テーブルへのインデックス追加でCONCURRENTLYがどうしても必要な場合は、通常のmigrationフローに乗せず、運用者が手動で個別に`psql`等から直接`CREATE INDEX CONCURRENTLY`を実行し、その後 `bun run --bun --filter backend check-migrations` が指す通常の`db:generate`生成物(CONCURRENTLYなしの同等DDL)をmigration履歴としても残す、といった特別対応が必要になる。日常的な変更では基本的に発生しないはずなので、直面したらPRで相談すること。

(旧TypeORM時代は `transaction = false` を指定した個別migrationとして書けたが、drizzle-kit移行後この仕組みは廃止された。`migration/_legacy/1782863440578-AddDatabaseTuningIndexes.js` 等に当時のパターンが歴史的参照として残っている。)

## schema.ts作成時に踏み外しやすいパターン

### 1. NOT NULL 列の追加

**なぜ危険か**: 既存行があるテーブルに `NOT NULL` 列を `DEFAULT` 無しで足すと、既存行を埋められず生成されたSQLの実行が失敗する。

- **既定値で良い場合** — schema.tsに `.default(...).notNull()` を付ければ、生成されるSQLに `DEFAULT` 句が入り1文で済む。これが最も多い
- **行ごとに計算した値で埋めたい場合** — `db:generate`が作る素直な`ADD COLUMN NOT NULL DEFAULT ...`では対応できないため、`db:generate:custom`で「nullable追加→UPDATEでバックフィル→`ALTER COLUMN SET NOT NULL`」の3段に手書きする。この場合、schema.ts側は最終形(NOT NULL)を宣言し、生成された素朴なSQLを手動で3段に書き換える

### 2. enum 型の値の追加・変更

**なぜ危険か**: PostgreSQL の enum は **値を削除できない** (`ALTER TYPE ... DROP VALUE` は存在しない)。drizzle-kitは`pgEnum(...)`配列の要素追加・削除を検出すると自動でSQLを生成するが、生成される内容を確認すること — 単純な値追加なら`ALTER TYPE ... ADD VALUE`で足りるが、削除や複数変更が絡む場合は「旧型をrename→新型をCREATE→列をALTER (USINGキャスト)→旧型をDROP」という手順になり、`db:generate`が意図通りに出さないことがある。**enum名を変更した場合、drizzle-kitはrename(既存型の維持)かdrop+create(データ非互換)かを対話的に確認してくる** — 非対話環境で実行すると誤判定されるリスクがあるため、enum変更を伴うmigrationは生成後に必ず内容を目視確認すること。

### 3. データ移行 (UPDATE バックフィル)

**なぜ危険か**: migration内の`UPDATE`は本番の全行を触る可能性がある。大量行では長時間ロック・トランザクション肥大を招く。これは`db:generate`では生成されないため、必要なら`db:generate:custom`で手書きする。

- 既定値を入れるだけなら `UPDATE ... WHERE col IS NULL` で冪等に書く
- 巨大テーブルの全行更新は避けるのが基本。どうしても必要ならバッチ分割や別運用を検討し、PR で相談する
- forward-onlyなので「取り消せないデータ移行をした」場合、取り消したければ別の新規migrationで復元用のUPDATEを書く(コメントで「完全には戻せない」旨を明示)

### 4. 列リネーム

「DROP 旧列 + ADD 新列」で書くと**データが消える**。schema.ts上でカラム名を変えて`db:generate`を実行すると、drizzle-kitが「これはrenameか、drop+addか」を対話的に確認してくる。非対話実行では誤判定される可能性があるため、リネームを意図した変更は生成後に必ずSQL内容を確認し、`ALTER TABLE "t" RENAME COLUMN "old" TO "new"`になっているか確かめること。
