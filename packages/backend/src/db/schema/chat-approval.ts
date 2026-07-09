/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

export const chatApproval = pgTable('chat_approval', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	otherId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
}, table => [
	index('IDX_CHAT_APPROVAL_USER_ID').on(table.userId),
	index('IDX_CHAT_APPROVAL_OTHER_ID').on(table.otherId),
	uniqueIndex('IDX_CHAT_APPROVAL_USER_ID_OTHER_ID_UNIQUE').on(table.userId, table.otherId),
]);

export type ChatApprovalRow = typeof chatApproval.$inferSelect;
export type ChatApprovalInsert = typeof chatApproval.$inferInsert;
