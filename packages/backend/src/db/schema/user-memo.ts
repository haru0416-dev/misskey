/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

export const userMemo = pgTable('user_memo', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	targetUserId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	memo: varchar({ length: 2048 }).notNull(),
}, table => [
	index('IDX_USER_MEMO_USER_ID').on(table.userId),
	index('IDX_USER_MEMO_TARGET_USER_ID').on(table.targetUserId),
	uniqueIndex('IDX_USER_MEMO_USER_ID_TARGET_USER_ID_UNIQUE').on(table.userId, table.targetUserId),
]);

export type UserMemoRow = typeof userMemo.$inferSelect;
export type UserMemoInsert = typeof userMemo.$inferInsert;
