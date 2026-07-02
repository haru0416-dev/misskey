/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';

export const clip = pgTable('clip', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	lastClippedAt: timestamp({ withTimezone: true }),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	name: varchar({ length: 128 }).notNull(),
	isPublic: boolean().default(false).notNull(),
	description: varchar({ length: 2048 }),
}, table => [
	index('IDX_a3eac04ae2aa9e221e7596114a').on(table.lastClippedAt),
	index('IDX_2b5ec6c574d6802c94c80313fb').on(table.userId),
]);

export type ClipRow = typeof clip.$inferSelect;
export type ClipInsert = typeof clip.$inferInsert;
