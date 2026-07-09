/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { note } from './note.js';
import { user } from './user.js';

export const noteReaction = pgTable('note_reaction', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	noteId: varchar({ length: 32 }).notNull().$type<MiNote['id']>().references(() => note.id, { onDelete: 'cascade' }),
	reaction: varchar({ length: 260 }).notNull(),
}, table => [
	index('IDX_NOTE_REACTION_USER_ID').on(table.userId),
	index('IDX_NOTE_REACTION_NOTE_ID').on(table.noteId),
	uniqueIndex('IDX_NOTE_REACTION_USER_ID_NOTE_ID_UNIQUE').on(table.userId, table.noteId),
	index('IDX_NOTE_REACTION_NOTE_ID_ID').on(table.noteId, table.id),
	index('IDX_NOTE_REACTION_USER_ID_ID').on(table.userId, table.id),
]);

export type NoteReactionRow = typeof noteReaction.$inferSelect;
export type NoteReactionInsert = typeof noteReaction.$inferInsert;
