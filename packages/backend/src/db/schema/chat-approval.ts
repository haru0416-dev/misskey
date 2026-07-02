/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';

export const chatApproval = pgTable('chat_approval', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	otherId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
}, table => [
	index('IDX_530257863e1381a7f2f1d3282f').on(table.userId),
	index('IDX_b1d46037f23d170da5c05fdf75').on(table.otherId),
	uniqueIndex('IDX_12c4768a2f706fc267f2078903').on(table.userId, table.otherId),
]);

export type ChatApprovalRow = typeof chatApproval.$inferSelect;
export type ChatApprovalInsert = typeof chatApproval.$inferInsert;
