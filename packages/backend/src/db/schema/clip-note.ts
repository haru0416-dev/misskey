/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiClip } from '@/models/Clip.js';
import type { MiNote } from '@/models/Note.js';
import { note } from './note.js';
import { clip } from './clip.js';

export const clipNote = pgTable('clip_note', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	noteId: varchar({ length: 32 }).notNull().$type<MiNote['id']>().references(() => note.id, { onDelete: 'cascade' }),
	clipId: varchar({ length: 32 }).notNull().$type<MiClip['id']>().references(() => clip.id, { onDelete: 'cascade' }),
}, table => [
	index('IDX_CLIP_NOTE_NOTE_ID').on(table.noteId),
	index('IDX_CLIP_NOTE_CLIP_ID').on(table.clipId),
	uniqueIndex('IDX_CLIP_NOTE_NOTE_ID_CLIP_ID_UNIQUE').on(table.noteId, table.clipId),
]);

export type ClipNoteRow = typeof clipNote.$inferSelect;
export type ClipNoteInsert = typeof clipNote.$inferInsert;
