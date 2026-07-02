/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';

export const userListFavorite = pgTable('user_list_favorite', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	userListId: varchar({ length: 32 }).notNull().$type<MiUserList['id']>(),
}, table => [
	index('IDX_016f613dc4feb807e03e3e7da9').on(table.userId),
	index('IDX_USER_LIST_FAVORITE_USER_LIST_ID').on(table.userListId),
	uniqueIndex('IDX_d6765a8c2a4c17c33f9d7f948b').on(table.userId, table.userListId),
]);

export type UserListFavoriteRow = typeof userListFavorite.$inferSelect;
export type UserListFavoriteInsert = typeof userListFavorite.$inferInsert;
