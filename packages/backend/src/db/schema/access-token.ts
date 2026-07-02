/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiApp } from '@/models/App.js';
import type { MiUser } from '@/models/User.js';

const emptyVarcharArray = sql`'{}'::character varying[]`;

export const accessToken = pgTable('access_token', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	lastUsedAt: timestamp({ withTimezone: true }),
	token: varchar({ length: 128 }).notNull(),
	session: varchar({ length: 128 }),
	hash: varchar({ length: 128 }).notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	appId: varchar({ length: 32 }).$type<MiApp['id'] | null>(),
	name: varchar({ length: 128 }),
	description: varchar({ length: 512 }),
	iconUrl: varchar({ length: 512 }),
	permission: varchar({ length: 64 }).array().default(emptyVarcharArray).notNull().$type<string[]>(),
	fetched: boolean().default(false).notNull(),
}, table => [
	index('IDX_70ba8f6af34bc924fc9e12adb8').on(table.token),
	index('IDX_bf3a053c07d9fb5d87317c56ee').on(table.session),
	index('IDX_64c327441248bae40f7d92f34f').on(table.hash),
	index('IDX_9949557d0e1b2c19e5344c171e').on(table.userId),
	index('IDX_ACCESS_TOKEN_APP_ID').on(table.appId),
]);

export type AccessTokenRow = typeof accessToken.$inferSelect;
export type AccessTokenInsert = typeof accessToken.$inferInsert;

/**
 * access_token テーブルは `user`/`app` リレーションを持つが、既存コードはいずれの経路でも
 * relation を読み込まないため、ここでも常に `user: null, app: null` を補って
 * MiAccessToken 形状に揃える。
 */
export function deserializeAccessToken(row: AccessTokenRow): MiAccessToken {
	return {
		...row,
		user: null,
		app: null,
	};
}
