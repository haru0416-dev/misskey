# DB migration を作成する

`packages/backend/migration/` に新規 migration を追加するための手順。**TypeORM は全廃済み (2026-07-07) で CLI ツールは存在しない** — `packages/backend/node_modules/typeorm/` も `ormconfig.js` も無い。migration は **常に手書き**。

## 大前提 (絶対 NG)

- **既にマージ済み (develop / master) のマイグレーションファイルを編集しない** ([AGENTS.md](../../../../../AGENTS.md))。本番履歴の改変は深刻なデータ不整合を引き起こす。スキーマ変更は **常に新しいタイムスタンプで新規ファイル** を作る
- ファイル名のタイムスタンプ部分を後から書き換えない (順序が壊れる)
- マージ済 migration の `up()` / `down()` 本文も触らない (たとえ "明らかなバグ" であっても、新しい migration で打ち消すこと)

---

## 手順: 新規ファイルを手で作る

自動生成ツールは無いので、**近いパターンの既存ファイルをコピーして書き換える** のが最短路 (下記「既存ファイル参照テンプレ」参照)。

1. タイムスタンプを取得: `bun -e "console.log(Date.now())"`
2. `packages/backend/migration/{unixMs}-{descriptive-name}.js` を新規作成 (拡張子 `.js`)
3. 下記の最小テンプレートに沿って `up()` / `down()` を書く
4. SPDX ヘッダーを付ける
5. 「検証」セクションのコマンドで確認する

`db/schema/*.ts` (drizzle-orm のテーブル定義) や `models/*.ts` を変更したときも、対応する DDL を **この migration ファイルに手で書く**。drizzle-kit のようなスキーマ差分の自動生成は導入されていない。

---

## 共通: クラス命名規則

- ファイル名: `packages/backend/migration/{unixMs}-{descriptive-name}.js` (拡張子 `.js`)
- ファイル名の `descriptive-name` 部分は既存履歴で混在 (PascalCase / camelCase / kebab-case)、変更を表す単一英語名なら良い
- **クラス名は PascalCase + 13 桁タイムスタンプ** (例: `class BirthdayIndex1767169026317`)
- **`name` プロパティもクラス名と同一文字列** にする (`name = 'BirthdayIndex1767169026317'`)

```js
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class PascalCaseName1234567890123 {
    name = 'PascalCaseName1234567890123'

    async up(queryRunner) {
        // 前進マイグレーション
    }

    async down(queryRunner) {
        // up を完全に巻き戻す
    }
}
```

`queryRunner` は [migration-runner.ts](../../../../../packages/backend/src/migration-runner.ts) の `PgMigrationQueryRunner` が渡すラッパーで、`query(sql, params?)` メソッドのみを持つ (TypeORM の `QueryRunner` 由来の API 互換だが実体は薄いラッパー)。生の SQL 文字列をそのまま渡す。

---

## SPDX ヘッダー付与

**必ず冒頭に追加する** (CI の `spdx` ジョブが失敗するため)。

```js
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
```

---

## up / down の整合確認

- `up()` の各ステートメントに対し、`down()` で完全に巻き戻せること
- 列追加 (`ADD COLUMN`) ↔ 列削除 (`DROP COLUMN`)、テーブル作成 ↔ テーブル削除、FK 追加 ↔ FK 削除、インデックス作成 ↔ インデックス削除 を必ずペアで書く
- `down()` を空のまま残さない。本番ロールバック時に詰む

**単純な逆 SQL では戻らない難ケース** (enum 値の追加・変更 / NOT NULL 列追加 / データ移行 UPDATE / JSONB・配列デフォルト / 列リネーム / 安全な DROP・COMMENT) は [knowledge/db-models-and-migrations.md §migration 難ケース](../knowledge/db-models-and-migrations.md) を必ず参照。特に **enum 変更** と **列リネーム** は要注意 (単純な逆操作では巻き戻せない / データが消える)。

### インデックス追加時 (CREATE INDEX CONCURRENTLY)

大規模テーブルへの `CREATE INDEX` は本番で長時間ロックする恐れがある。`CONCURRENTLY` で発行するときは migration class に `transaction = false` 等の対応が必要。詳細は [knowledge/db-models-and-migrations.md §CONCURRENTLY](../knowledge/db-models-and-migrations.md) を参照。

参照実装: [packages/backend/migration/1783491564196-AddTrgmSearchIndexes.js](../../../../../packages/backend/migration/1783491564196-AddTrgmSearchIndexes.js)。

---

## 検証

ルートから実行:

```bash
# 未適用の migration ファイルが無いか (実行し忘れの検出)
bun run --bun --filter backend check-migrations

# ローカル DB に適用
bun run migrate

# ロールバック (down が壊れていないか)
bun run revert

# 再適用 (順方向にもう一度通す)
bun run migrate
```

`check-migrations` の実体は [migration-runner.ts](../../../../../packages/backend/src/migration-runner.ts) の `check` コマンド (`bun run compile-config && bun ./built/migration-runner.js check`)。設定先 DB の `migrations` テーブルと `packages/backend/migration/*.js` を突き合わせ、**まだ適用されていない migration ファイルが無いか**を検査する。**TypeORM 時代のような「エンティティと migration の DDL が同期しているか」の検査ではない** — 純粋に「migration ファイルを書いたのに `bun run migrate` し忘れていないか」のチェックである点に注意 (CI は新規 migration に対して `migrate` → `check` の順で走らせて検証する)。

---

## 既存ファイル参照テンプレ

新規ファイルを書くときは、変更パターンが近い既存ファイルを **必ずひとつ開いて並べて書く**。スタイルが激しくズレた PR は差し戻されやすい。

| パターン | 参照ファイル |
|---|---|
| インデックス追加 + 関数定義 (`CREATE OR REPLACE FUNCTION` + それを使う式インデックス) | [migration/1783108921646-RestoreBirthdayDateFunction.js](../../../../../packages/backend/migration/1783108921646-RestoreBirthdayDateFunction.js) |
| 複数インデックスをまとめて安全に追加 (存在チェック + 旧インデックス削除) | [migration/1782863440578-AddDatabaseTuningIndexes.js](../../../../../packages/backend/migration/1782863440578-AddDatabaseTuningIndexes.js) |
| CONCURRENTLY 付きインデックス + `pg_trgm` 拡張の有効化 | [migration/1783491564196-AddTrgmSearchIndexes.js](../../../../../packages/backend/migration/1783491564196-AddTrgmSearchIndexes.js) |
| 列追加 / テーブル新規作成 + FK | **squash 後の実例が無い** ([knowledge/db-models-and-migrations.md §migration 難ケース](../knowledge/db-models-and-migrations.md) の SQL パターンを参考に、[InitialSchema.js](../../../../../packages/backend/migration/0000000000001-InitialSchema.js) 内の類似テーブル定義とスタイルを揃える) |

---

## CHANGELOG (ユーザー影響がある場合)

スキーマ変更がユーザーに見える挙動を生む場合のみ、`CHANGELOG.md` に追記する。内部リファクタや純粋なインデックス追加は不要。詳細は [shipping-misskey-change スキル](../../../shipping-misskey-change/SKILL.md) で確認。

---

## 提出前セルフレビューチェックリスト

完了前に以下を上から確認する (各項目を TodoWrite 化してよい):

- [ ] **新規タイムスタンプ**で作成し、既にマージ済みの migration ファイルは一切編集していない (大前提)
- [ ] ファイル冒頭に **SPDX ヘッダー**がある
- [ ] `export class <PascalName><ms>` と `name = '<PascalName><ms>'` の **文字列が完全一致** している (PascalCase + 13 桁タイムスタンプ)
- [ ] `db/schema/*.ts` / `models/*.ts` を変更したなら、対応する DDL がこの migration に手で書かれている
- [ ] `up()` の各文に対応する巻き戻しが `down()` にあり、**`down()` が空でない** (難ケースは [knowledge/db-models-and-migrations.md](../knowledge/db-models-and-migrations.md) を確認済み)
- [ ] `bun run --bun --filter backend check-migrations` が **0 件 (未適用 migration なし)** で通る (事前に `bun run migrate` を実行しておくこと)
- [ ] (可能なら) `bun run migrate` → `bun run revert` → `bun run migrate` が通る
- [ ] ユーザーに見える変更なら CHANGELOG 追記 → [shipping-misskey-change](../../../shipping-misskey-change/SKILL.md)
