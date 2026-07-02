/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';

export const noteReaction = pgTable('note_reaction', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	noteId: varchar({ length: 32 }).notNull().$type<MiNote['id']>(),
	reaction: varchar({ length: 260 }).notNull(),
}, table => [
	index('IDX_13761f64257f40c5636d0ff95e').on(table.userId),
	index('IDX_45145e4953780f3cd5656f0ea6').on(table.noteId),
	uniqueIndex('IDX_ad0c221b25672daf2df320a817').on(table.userId, table.noteId),
]);

export type NoteReactionRow = typeof noteReaction.$inferSelect;
export type NoteReactionInsert = typeof noteReaction.$inferInsert;
