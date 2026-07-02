/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export const ad = pgTable('ad', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	expiresAt: timestamp({ withTimezone: true }).notNull(),
	startsAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
	place: varchar({ length: 32 }).notNull(),
	priority: varchar({ length: 32 }).notNull(),
	ratio: integer().default(1).notNull(),
	url: varchar({ length: 1024 }).notNull(),
	imageUrl: varchar({ length: 1024 }).notNull(),
	memo: varchar({ length: 8192 }).notNull(),
	dayOfWeek: integer().default(0).notNull(),
	isSensitive: boolean().default(false).notNull(),
}, table => [
	index('IDX_2da24ce20ad209f1d9dc032457').on(table.expiresAt),
	index('IDX_3fcc2c589eaefc205e0714b99c').on(table.startsAt),
]);

export type AdRow = typeof ad.$inferSelect;
export type AdInsert = typeof ad.$inferInsert;
