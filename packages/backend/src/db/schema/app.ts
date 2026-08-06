/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

export const app = pgTable(
	'app',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		userId: varchar({ length: 32 })
			.$type<MiUser['id'] | null>()
			.references(() => user.id, { onDelete: 'set null' }),
		secret: varchar({ length: 64 }).notNull(),
		name: varchar({ length: 128 }).notNull(),
		description: varchar({ length: 512 }).notNull(),
		permission: varchar({ length: 64 }).array().notNull().$type<string[]>(),
		callbackUrl: varchar({ length: 512 }),
	},
	(table) => [index('IDX_APP_USER_ID').on(table.userId), index('IDX_APP_SECRET').on(table.secret)],
);

export type AppRow = typeof app.$inferSelect;
export type AppInsert = typeof app.$inferInsert;
