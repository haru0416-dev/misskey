/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';

export const passwordResetRequest = pgTable('password_reset_request', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	token: varchar({ length: 256 }).notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
}, table => [
	uniqueIndex('IDX_0b575fa9a4cfe638a925949285').on(table.token),
	index('IDX_4bb7fd4a34492ae0e6cc8d30ac').on(table.userId),
]);

export type PasswordResetRequestRow = typeof passwordResetRequest.$inferSelect;
export type PasswordResetRequestInsert = typeof passwordResetRequest.$inferInsert;
