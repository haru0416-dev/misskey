/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, serial, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';

export const userIp = pgTable('user_ip', {
	id: serial().primaryKey().notNull(),
	createdAt: timestamp({ withTimezone: true }).notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	ip: varchar({ length: 128 }).notNull(),
}, table => [
	index('IDX_7f7f1c66f48e9a8e18a33bc515').on(table.userId),
	uniqueIndex('IDX_361b500e06721013c124b7b6c5').on(table.userId, table.ip),
]);

export type UserIpRow = typeof userIp.$inferSelect;
export type UserIpInsert = typeof userIp.$inferInsert;
