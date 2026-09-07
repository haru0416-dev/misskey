/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { integer, pgTable, varchar } from 'drizzle-orm/pg-core';

/**
 * プロセス内キャッシュの世代番号。行は key ごとに 1 つで、対象テーブルのトリガが書き込みのたびに
 * version を進める (migration 0016 参照)。書き込み経路が API・Store 関数・生 SQL のどれでも
 * 同じ経路で進むので、別プロセスのキャッシュもこの値だけで新旧を判定できる。
 * bigint にしないのは Bun.sql が int8 を文字列で返すため。
 */
export const cacheVersion = pgTable('cache_version', {
	key: varchar({ length: 64 }).primaryKey().notNull(),
	version: integer().default(0).notNull(),
});

export type CacheVersionRow = typeof cacheVersion.$inferSelect;
