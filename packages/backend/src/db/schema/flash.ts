/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { MiFlash } from '@/models/Flash.js';
import type { MiUser } from '@/models/User.js';

const emptyVarcharArray = sql`'{}'::character varying[]`;

export const flash = pgTable('flash', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	updatedAt: timestamp({ withTimezone: true }).notNull(),
	title: varchar({ length: 256 }).notNull(),
	summary: varchar({ length: 1024 }).notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	script: varchar({ length: 65536 }).notNull(),
	permissions: varchar({ length: 256 }).array().default(emptyVarcharArray).notNull(),
	likedCount: integer().default(0).notNull(),
	visibility: varchar({ length: 512 }).default('public').notNull().$type<MiFlash['visibility']>(),
});

export type FlashRow = typeof flash.$inferSelect;
export type FlashInsert = typeof flash.$inferInsert;
