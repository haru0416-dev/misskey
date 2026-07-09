/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { user } from './user.js';

export const userPublickey = pgTable('user_publickey', {
	userId: varchar({ length: 32 }).primaryKey().notNull().references(() => user.id, { onDelete: 'cascade' }),
	keyId: varchar({ length: 256 }).notNull(),
	keyPem: varchar({ length: 4096 }).notNull(),
}, table => [
	uniqueIndex('IDX_171e64971c780ebd23fae140bb').on(table.keyId),
]);

export type UserPublickeyRow = typeof userPublickey.$inferSelect;
export type UserPublickeyInsert = typeof userPublickey.$inferInsert;
