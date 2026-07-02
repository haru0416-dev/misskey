/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiClip } from '@/models/Clip.js';
import type { MiNote } from '@/models/Note.js';

export const clipNote = pgTable('clip_note', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	noteId: varchar({ length: 32 }).notNull().$type<MiNote['id']>(),
	clipId: varchar({ length: 32 }).notNull().$type<MiClip['id']>(),
}, table => [
	index('IDX_a012eaf5c87c65da1deb5fdbfa').on(table.noteId),
	index('IDX_ebe99317bbbe9968a0c6f579ad').on(table.clipId),
	uniqueIndex('IDX_6fc0ec357d55a18646262fdfff').on(table.noteId, table.clipId),
]);

export type ClipNoteRow = typeof clipNote.$inferSelect;
export type ClipNoteInsert = typeof clipNote.$inferInsert;
