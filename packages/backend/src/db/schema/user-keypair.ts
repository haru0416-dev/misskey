/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { pgTable, varchar } from 'drizzle-orm/pg-core';

export const userKeypair = pgTable('user_keypair', {
	userId: varchar({ length: 32 }).primaryKey().notNull(),
	publicKey: varchar({ length: 4096 }).notNull(),
	privateKey: varchar({ length: 4096 }).notNull(),
});

export type UserKeypairRow = typeof userKeypair.$inferSelect;
export type UserKeypairInsert = typeof userKeypair.$inferInsert;
