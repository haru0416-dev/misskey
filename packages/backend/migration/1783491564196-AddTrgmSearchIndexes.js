/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 全文検索フォールバック (notes/search の LIKE '%...%') とユーザー検索 (name/description ILIKE、
// usernameLower 中間一致) は行数に線形の全表走査で、statement_timeout (10s) の最有力候補だった。
// pg_trgm の GIN で中間一致をビットマップスキャン化する。式はクエリ側と完全一致させること:
//   note:   LOWER("text") LIKE '%q%'          -> gin (lower("text") gin_trgm_ops)
//   user:   "name" ILIKE '%q%'                -> gin ("name" gin_trgm_ops)
//   user:   "usernameLower" LIKE '%q%'        -> gin ("usernameLower" gin_trgm_ops)
//   profile:"description" ILIKE '%q%'         -> gin ("description" gin_trgm_ops)
// note の GIN は fastupdate = off (migration 1783490715308 と同じ理由: INSERTのテールレイテンシ平坦化)。

const isConcurrentIndexMigrationEnabled = process.env.MISSKEY_MIGRATION_CREATE_INDEX_CONCURRENTLY === '1';

const trgmIndexes = [
	{ name: 'IDX_NOTE_TEXT_TRGM', definition: 'ON "note" USING gin (lower("text") gin_trgm_ops) WITH (fastupdate = off)' },
	{ name: 'IDX_USER_NAME_TRGM', definition: 'ON "user" USING gin ("name" gin_trgm_ops)' },
	{ name: 'IDX_USER_USERNAME_LOWER_TRGM', definition: 'ON "user" USING gin ("usernameLower" gin_trgm_ops)' },
	{ name: 'IDX_USER_PROFILE_DESCRIPTION_TRGM', definition: 'ON "user_profile" USING gin ("description" gin_trgm_ops)' },
];

export class AddTrgmSearchIndexes1783491564196 {
    name = 'AddTrgmSearchIndexes1783491564196'
    transaction = isConcurrentIndexMigrationEnabled ? false : undefined

    async up(queryRunner) {
        // 実行コネクションはアプリと同じ statement_timeout (10s) を持つが、大きいテーブルへの
        // GIN 構築は普通に10秒を超える。このセッションに限り解除する。
        await queryRunner.query('SET statement_timeout = 0');
        await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');

        const concurrently = isConcurrentIndexMigrationEnabled ? 'CONCURRENTLY ' : '';
        for (const index of trgmIndexes) {
            await queryRunner.query(`CREATE INDEX ${concurrently}IF NOT EXISTS "${index.name}" ${index.definition}`);
        }
    }

    async down(queryRunner) {
        for (const index of [...trgmIndexes].reverse()) {
            await queryRunner.query(`DROP INDEX IF EXISTS "public"."${index.name}"`);
        }
        // 拡張は他の利用者がいる可能性があるため落とさない
    }
}
