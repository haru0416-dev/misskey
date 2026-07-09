/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

export const muting = pgTable('muting', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	expiresAt: timestamp({ withTimezone: true }),
	muteeId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	muterId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
}, table => [
	index('IDX_MUTING_EXPIRES_AT').on(table.expiresAt),
	index('IDX_MUTING_MUTEE_ID').on(table.muteeId),
	index('IDX_MUTING_MUTER_ID').on(table.muterId),
	uniqueIndex('IDX_MUTING_MUTER_ID_MUTEE_ID_UNIQUE').on(table.muterId, table.muteeId),
]);

export type MutingRow = typeof muting.$inferSelect;
export type MutingInsert = typeof muting.$inferInsert;
