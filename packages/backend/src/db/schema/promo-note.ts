/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { note } from './note.js';

export const promoNote = pgTable('promo_note', {
	noteId: varchar({ length: 32 }).primaryKey().notNull().$type<MiNote['id']>().references(() => note.id, { onDelete: 'cascade' }),
	expiresAt: timestamp({ withTimezone: true }).notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
}, table => [
	index('IDX_PROMO_NOTE_USER_ID').on(table.userId),
]);

export type PromoNoteRow = typeof promoNote.$inferSelect;
export type PromoNoteInsert = typeof promoNote.$inferInsert;
