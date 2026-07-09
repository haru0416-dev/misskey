/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';
import { user } from './user.js';
import { userList } from './user-list.js';

export const userListMembership = pgTable('user_list_membership', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	userListId: varchar({ length: 32 }).notNull().$type<MiUserList['id']>().references(() => userList.id, { onDelete: 'cascade' }),
	withReplies: boolean().default(false).notNull(),

	//#region Denormalized fields
	userListUserId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	//#endregion
}, table => [
	index('IDX_USER_LIST_MEMBERSHIP_USER_ID').on(table.userId),
	index('IDX_USER_LIST_MEMBERSHIP_USER_LIST_ID').on(table.userListId),
	uniqueIndex('IDX_USER_LIST_MEMBERSHIP_USER_ID_USER_LIST_ID_UNIQUE').on(table.userId, table.userListId),
]);

export type UserListMembershipRow = typeof userListMembership.$inferSelect;
export type UserListMembershipInsert = typeof userListMembership.$inferInsert;
