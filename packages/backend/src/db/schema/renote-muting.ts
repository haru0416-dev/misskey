/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';

export const renoteMuting = pgTable('renote_muting', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	muteeId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	muterId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
}, table => [
	index('IDX_7eac97594bcac5ffcf2068089b').on(table.muteeId),
	index('IDX_7aa72a5fe76019bfe8e5e0e8b7').on(table.muterId),
	uniqueIndex('IDX_0d801c609cec4e9eb4b6b4490c').on(table.muterId, table.muteeId),
]);

export type RenoteMutingRow = typeof renoteMuting.$inferSelect;
export type RenoteMutingInsert = typeof renoteMuting.$inferInsert;
