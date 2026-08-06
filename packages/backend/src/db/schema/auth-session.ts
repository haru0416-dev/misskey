/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, varchar } from 'drizzle-orm/pg-core';
import type { MiApp } from '@/models/App.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';
import { app } from './app.js';

export const authSession = pgTable(
	'auth_session',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		token: varchar({ length: 128 }).notNull(),
		userId: varchar({ length: 32 })
			.$type<MiUser['id'] | null>()
			.references(() => user.id, { onDelete: 'cascade' }),
		appId: varchar({ length: 32 })
			.notNull()
			.$type<MiApp['id']>()
			.references(() => app.id, { onDelete: 'cascade' }),
	},
	(table) => [
		index('IDX_AUTH_SESSION_TOKEN').on(table.token),
		index('IDX_AUTH_SESSION_USER_ID').on(table.userId),
		index('IDX_AUTH_SESSION_APP_ID').on(table.appId),
	],
);

export type AuthSessionRow = typeof authSession.$inferSelect;
export type AuthSessionInsert = typeof authSession.$inferInsert;
