/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';
import { user } from './user.js';
import { userList } from './user-list.js';

export const userListFavorite = pgTable(
	'user_list_favorite',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		userId: varchar({ length: 32 })
			.notNull()
			.$type<MiUser['id']>()
			.references(() => user.id, { onDelete: 'cascade' }),
		userListId: varchar({ length: 32 })
			.notNull()
			.$type<MiUserList['id']>()
			.references(() => userList.id, { onDelete: 'cascade' }),
	},
	(table) => [
		index('IDX_USER_LIST_FAVORITE_USER_ID').on(table.userId),
		index('IDX_USER_LIST_FAVORITE_USER_LIST_ID').on(table.userListId),
		uniqueIndex('IDX_USER_LIST_FAVORITE_USER_ID_USER_LIST_ID_UNIQUE').on(table.userId, table.userListId),
	],
);

export type UserListFavoriteRow = typeof userListFavorite.$inferSelect;
export type UserListFavoriteInsert = typeof userListFavorite.$inferInsert;
