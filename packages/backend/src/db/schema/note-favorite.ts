/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { note } from './note.js';
import { user } from './user.js';

export const noteFavorite = pgTable('note_favorite', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	noteId: varchar({ length: 32 }).notNull().$type<MiNote['id']>().references(() => note.id, { onDelete: 'cascade' }),
}, table => [
	index('IDX_47f4b1892f5d6ba8efb3057d81').on(table.userId),
	index('IDX_0e00498f180193423c992bc437').on(table.noteId),
	uniqueIndex('IDX_0f4fb9ad355f3effff221ef245').on(table.userId, table.noteId),
]);

export type NoteFavoriteRow = typeof noteFavorite.$inferSelect;
export type NoteFavoriteInsert = typeof noteFavorite.$inferInsert;
