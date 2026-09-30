/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { user } from './user.js';

// 関係解除後も受信済み Follow を再承認しないため、following 行の削除には連動させない。
export const followAcceptance = pgTable(
	'follow_acceptance',
	{
		id: varchar({ length: 64 }).primaryKey().notNull(),
		actorUri: text().notNull(),
		followeeId: varchar({ length: 32 })
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		requestId: text(),
		followingId: varchar({ length: 32 }).notNull(),
	},
	(table) => [index('IDX_FOLLOW_ACCEPTANCE_FOLLOWEE_ID').on(table.followeeId)],
);
