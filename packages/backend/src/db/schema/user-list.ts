/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';

export const userList = pgTable('user_list', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	isPublic: boolean().default(false).notNull(),
	name: varchar({ length: 128 }).notNull(),
}, table => [
	index('IDX_b7fcefbdd1c18dce86687531f9').on(table.userId),
	index('IDX_48a00f08598662b9ca540521eb').on(table.isPublic),
]);

export type UserListRow = typeof userList.$inferSelect;
export type UserListInsert = typeof userList.$inferInsert;
