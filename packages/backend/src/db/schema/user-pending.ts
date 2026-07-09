/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

export const userPending = pgTable('user_pending', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	code: varchar({ length: 128 }).notNull(),
	username: varchar({ length: 128 }).notNull(),
	email: varchar({ length: 128 }).notNull(),
	password: varchar({ length: 128 }).notNull(),
}, table => [
	uniqueIndex('IDX_USER_PENDING_CODE_UNIQUE').on(table.code),
]);

export type UserPendingRow = typeof userPending.$inferSelect;
export type UserPendingInsert = typeof userPending.$inferInsert;
