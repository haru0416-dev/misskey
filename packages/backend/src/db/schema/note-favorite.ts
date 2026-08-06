/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { note } from './note.js';
import { user } from './user.js';

export const noteFavorite = pgTable(
	'note_favorite',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		userId: varchar({ length: 32 })
			.notNull()
			.$type<MiUser['id']>()
			.references(() => user.id, { onDelete: 'cascade' }),
		noteId: varchar({ length: 32 })
			.notNull()
			.$type<MiNote['id']>()
			.references(() => note.id, { onDelete: 'cascade' }),
	},
	(table) => [
		index('IDX_NOTE_FAVORITE_USER_ID').on(table.userId),
		index('IDX_NOTE_FAVORITE_NOTE_ID').on(table.noteId),
		uniqueIndex('IDX_NOTE_FAVORITE_USER_ID_NOTE_ID_UNIQUE').on(table.userId, table.noteId),
	],
);

export type NoteFavoriteRow = typeof noteFavorite.$inferSelect;
export type NoteFavoriteInsert = typeof noteFavorite.$inferInsert;
