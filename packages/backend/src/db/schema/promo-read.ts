/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { note } from './note.js';
import { user } from './user.js';

export const promoRead = pgTable(
	'promo_read',
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
		index('IDX_PROMO_READ_USER_ID').on(table.userId),
		index('IDX_PROMO_READ_NOTE_ID').on(table.noteId),
		uniqueIndex('IDX_PROMO_READ_USER_ID_NOTE_ID_UNIQUE').on(table.userId, table.noteId),
	],
);

export type PromoReadRow = typeof promoRead.$inferSelect;
export type PromoReadInsert = typeof promoRead.$inferInsert;
