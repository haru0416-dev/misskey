/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';

export const blocking = pgTable('blocking', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	blockeeId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	blockerId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
}, table => [
	index('IDX_2cd4a2743a99671308f5417759').on(table.blockeeId),
	index('IDX_0627125f1a8a42c9a1929edb55').on(table.blockerId),
	uniqueIndex('IDX_98a1bc5cb30dfd159de056549f').on(table.blockerId, table.blockeeId),
]);

export type BlockingRow = typeof blocking.$inferSelect;
export type BlockingInsert = typeof blocking.$inferInsert;
