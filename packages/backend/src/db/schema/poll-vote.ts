/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, integer, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { note } from './note.js';
import { user } from './user.js';

export const pollVote = pgTable('poll_vote', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	noteId: varchar({ length: 32 }).notNull().$type<MiNote['id']>().references(() => note.id, { onDelete: 'cascade' }),
	choice: integer().notNull(),
}, table => [
	index('IDX_66d2bd2ee31d14bcc23069a89f').on(table.userId),
	index('IDX_aecfbd5ef60374918e63ee95fa').on(table.noteId),
	uniqueIndex('IDX_50bd7164c5b78f1f4a42c4d21f').on(table.userId, table.noteId, table.choice),
]);

export type PollVoteRow = typeof pollVote.$inferSelect;
export type PollVoteInsert = typeof pollVote.$inferInsert;
