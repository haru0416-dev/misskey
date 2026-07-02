/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';

export const userListMembership = pgTable('user_list_membership', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	userListId: varchar({ length: 32 }).notNull().$type<MiUserList['id']>(),
	withReplies: boolean().default(false).notNull(),

	//#region Denormalized fields
	userListUserId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	//#endregion
}, table => [
	index('IDX_021015e6683570ae9f6b0c62be').on(table.userId),
	index('IDX_cddcaf418dc4d392ecfcca842a').on(table.userListId),
	uniqueIndex('IDX_e4f3094c43f2d665e6030b0337').on(table.userId, table.userListId),
]);

export type UserListMembershipRow = typeof userListMembership.$inferSelect;
export type UserListMembershipInsert = typeof userListMembership.$inferInsert;
