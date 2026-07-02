/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export const usedUsername = pgTable('used_username', {
	username: varchar({ length: 128 }).primaryKey().notNull(),
	createdAt: timestamp({ withTimezone: true }).notNull(),
});

export type UsedUsernameRow = typeof usedUsername.$inferSelect;
export type UsedUsernameInsert = typeof usedUsername.$inferInsert;
