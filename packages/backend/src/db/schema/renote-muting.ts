/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

export const renoteMuting = pgTable(
	'renote_muting',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		muteeId: varchar({ length: 32 })
			.notNull()
			.$type<MiUser['id']>()
			.references(() => user.id, { onDelete: 'cascade' }),
		muterId: varchar({ length: 32 })
			.notNull()
			.$type<MiUser['id']>()
			.references(() => user.id, { onDelete: 'cascade' }),
	},
	(table) => [
		index('IDX_RENOTE_MUTING_MUTEE_ID').on(table.muteeId),
		index('IDX_RENOTE_MUTING_MUTER_ID').on(table.muterId),
		uniqueIndex('IDX_RENOTE_MUTING_MUTER_ID_MUTEE_ID_UNIQUE').on(table.muterId, table.muteeId),
	],
);

export type RenoteMutingRow = typeof renoteMuting.$inferSelect;
export type RenoteMutingInsert = typeof renoteMuting.$inferInsert;
