/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

export const noteThreadMuting = pgTable(
	'note_thread_muting',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		userId: varchar({ length: 32 })
			.notNull()
			.$type<MiUser['id']>()
			.references(() => user.id, { onDelete: 'cascade' }),
		threadId: varchar({ length: 256 }).notNull(),
	},
	(table) => [
		index('IDX_NOTE_THREAD_MUTING_USER_ID').on(table.userId),
		index('IDX_NOTE_THREAD_MUTING_THREAD_ID').on(table.threadId),
		uniqueIndex('IDX_NOTE_THREAD_MUTING_USER_ID_THREAD_ID_UNIQUE').on(table.userId, table.threadId),
	],
);

export type NoteThreadMutingRow = typeof noteThreadMuting.$inferSelect;
export type NoteThreadMutingInsert = typeof noteThreadMuting.$inferInsert;
