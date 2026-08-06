/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { MiApp } from '@/models/App.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';
import { app } from './app.js';

const emptyVarcharArray = sql`'{}'::character varying[]`;

export const accessToken = pgTable(
	'access_token',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		lastUsedAt: timestamp({ withTimezone: true }),
		token: varchar({ length: 128 }).notNull(),
		session: varchar({ length: 128 }),
		hash: varchar({ length: 128 }).notNull(),
		userId: varchar({ length: 32 })
			.notNull()
			.$type<MiUser['id']>()
			.references(() => user.id, { onDelete: 'cascade' }),
		appId: varchar({ length: 32 })
			.$type<MiApp['id'] | null>()
			.references(() => app.id, { onDelete: 'cascade' }),
		name: varchar({ length: 128 }),
		description: varchar({ length: 512 }),
		iconUrl: varchar({ length: 512 }),
		permission: varchar({ length: 64 }).array().default(emptyVarcharArray).notNull().$type<string[]>(),
		fetched: boolean().default(false).notNull(),
	},
	(table) => [
		index('IDX_ACCESS_TOKEN_TOKEN').on(table.token),
		index('IDX_ACCESS_TOKEN_SESSION').on(table.session),
		index('IDX_ACCESS_TOKEN_HASH').on(table.hash),
		index('IDX_ACCESS_TOKEN_USER_ID').on(table.userId),
		index('IDX_ACCESS_TOKEN_APP_ID').on(table.appId),
	],
);

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
