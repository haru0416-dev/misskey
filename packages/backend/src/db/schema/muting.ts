/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';

export const muting = pgTable('muting', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	expiresAt: timestamp({ withTimezone: true }),
	muteeId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	muterId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
}, table => [
	index('IDX_c1fd1c3dfb0627aa36c253fd14').on(table.expiresAt),
	index('IDX_ec96b4fed9dae517e0dbbe0675').on(table.muteeId),
	index('IDX_93060675b4a79a577f31d260c6').on(table.muterId),
	uniqueIndex('IDX_1eb9d9824a630321a29fd3b290').on(table.muterId, table.muteeId),
]);

export type MutingRow = typeof muting.$inferSelect;
export type MutingInsert = typeof muting.$inferInsert;
