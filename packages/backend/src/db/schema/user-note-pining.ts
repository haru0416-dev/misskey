/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';
import { note } from './note.js';

export const userNotePining = pgTable('user_note_pining', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	noteId: varchar({ length: 32 }).notNull().$type<MiNote['id']>().references(() => note.id, { onDelete: 'cascade' }),
}, table => [
	index('IDX_USER_NOTE_PINING_USER_ID').on(table.userId),
	index('IDX_USER_NOTE_PINING_NOTE_ID').on(table.noteId),
	uniqueIndex('IDX_USER_NOTE_PINING_USER_ID_NOTE_ID_UNIQUE').on(table.userId, table.noteId),
]);

export type UserNotePiningRow = typeof userNotePining.$inferSelect;
export type UserNotePiningInsert = typeof userNotePining.$inferInsert;
