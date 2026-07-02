/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';

export const userNotePining = pgTable('user_note_pining', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	noteId: varchar({ length: 32 }).notNull().$type<MiNote['id']>(),
}, table => [
	index('IDX_bfbc6f79ba4007b4ce5097f08d').on(table.userId),
	index('IDX_68881008f7c3588ad7ecae471c').on(table.noteId),
	uniqueIndex('IDX_410cd649884b501c02d6e72738').on(table.userId, table.noteId),
]);

export type UserNotePiningRow = typeof userNotePining.$inferSelect;
export type UserNotePiningInsert = typeof userNotePining.$inferInsert;
