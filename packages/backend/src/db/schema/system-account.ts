/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { pgTable, varchar } from 'drizzle-orm/pg-core';

export const systemAccount = pgTable('system_account', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull(),
	type: varchar({ length: 256 }).notNull(),
});

export type SystemAccountRow = typeof systemAccount.$inferSelect;
export type SystemAccountInsert = typeof systemAccount.$inferInsert;
