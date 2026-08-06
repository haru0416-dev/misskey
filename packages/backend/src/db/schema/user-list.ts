/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

export const userList = pgTable(
	'user_list',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		userId: varchar({ length: 32 })
			.notNull()
			.$type<MiUser['id']>()
			.references(() => user.id, { onDelete: 'cascade' }),
		isPublic: boolean().default(false).notNull(),
		name: varchar({ length: 128 }).notNull(),
	},
	(table) => [index('IDX_USER_LIST_USER_ID').on(table.userId), index('IDX_USER_LIST_IS_PUBLIC').on(table.isPublic)],
);

export type UserListRow = typeof userList.$inferSelect;
export type UserListInsert = typeof userList.$inferInsert;
