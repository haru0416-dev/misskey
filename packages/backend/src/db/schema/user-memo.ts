/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';

export const userMemo = pgTable('user_memo', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	targetUserId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	memo: varchar({ length: 2048 }).notNull(),
}, table => [
	index('IDX_650b49c5639b5840ee6a2b8f83').on(table.userId),
	index('IDX_66ac4a82894297fd09ba61f3d3').on(table.targetUserId),
	uniqueIndex('IDX_faef300913c738265638ba3ebc').on(table.userId, table.targetUserId),
]);

export type UserMemoRow = typeof userMemo.$inferSelect;
export type UserMemoInsert = typeof userMemo.$inferInsert;
