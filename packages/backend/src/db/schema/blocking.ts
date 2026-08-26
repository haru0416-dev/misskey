/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

export const blocking = pgTable(
	'blocking',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		blockeeId: varchar({ length: 32 })
			.notNull()
			.$type<MiUser['id']>()
			.references(() => user.id, { onDelete: 'cascade' }),
		blockerId: varchar({ length: 32 })
			.notNull()
			.$type<MiUser['id']>()
			.references(() => user.id, { onDelete: 'cascade' }),
	},
	(table) => [
		index('IDX_BLOCKING_BLOCKEE_ID').on(table.blockeeId),
		index('IDX_BLOCKING_BLOCKER_ID').on(table.blockerId),
		uniqueIndex('IDX_BLOCKING_BLOCKER_ID_BLOCKEE_ID_UNIQUE').on(table.blockerId, table.blockeeId),
	],
);

export type BlockingRow = typeof blocking.$inferSelect;
export type BlockingInsert = typeof blocking.$inferInsert;
