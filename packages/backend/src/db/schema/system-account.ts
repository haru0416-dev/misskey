/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { user } from './user.js';

export const systemAccount = pgTable('system_account', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().references(() => user.id, { onDelete: 'cascade' }),
	type: varchar({ length: 256 }).notNull(),
}, table => [
	index('IDX_41a3c87a37aea616ee459369e1').on(table.userId),
	uniqueIndex('IDX_c362033aee0ea51011386a5a7e').on(table.type),
]);

export type SystemAccountRow = typeof systemAccount.$inferSelect;
export type SystemAccountInsert = typeof systemAccount.$inferInsert;
