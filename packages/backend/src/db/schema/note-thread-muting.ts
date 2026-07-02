/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';

export const noteThreadMuting = pgTable('note_thread_muting', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	threadId: varchar({ length: 256 }).notNull(),
}, table => [
	index('IDX_29c11c7deb06615076f8c95b80').on(table.userId),
	index('IDX_c426394644267453e76f036926').on(table.threadId),
	uniqueIndex('IDX_ae7aab18a2641d3e5f25e0c4ea').on(table.userId, table.threadId),
]);

export type NoteThreadMutingRow = typeof noteThreadMuting.$inferSelect;
export type NoteThreadMutingInsert = typeof noteThreadMuting.$inferInsert;
