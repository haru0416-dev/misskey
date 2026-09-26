/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { integer, pgTable, uniqueIndex, varchar, index } from 'drizzle-orm/pg-core';

/** 利用者を重複なく数えるための対応は hashtag_user に持つ。ここには件数だけを置く。 */
export const hashtag = pgTable(
	'hashtag',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		name: varchar({ length: 128 }).notNull(),
		mentionedUsersCount: integer().default(0).notNull(),
		mentionedLocalUsersCount: integer().default(0).notNull(),
		mentionedRemoteUsersCount: integer().default(0).notNull(),
		attachedUsersCount: integer().default(0).notNull(),
		attachedLocalUsersCount: integer().default(0).notNull(),
		attachedRemoteUsersCount: integer().default(0).notNull(),
	},
	(table) => [
		uniqueIndex('IDX_HASHTAG_NAME_UNIQUE').on(table.name),
		index('IDX_HASHTAG_MENTIONED_USERS_COUNT').on(table.mentionedUsersCount),
		index('IDX_HASHTAG_MENTIONED_LOCAL_USERS_COUNT').on(table.mentionedLocalUsersCount),
		index('IDX_HASHTAG_MENTIONED_REMOTE_USERS_COUNT').on(table.mentionedRemoteUsersCount),
		index('IDX_HASHTAG_ATTACHED_USERS_COUNT').on(table.attachedUsersCount),
		index('IDX_HASHTAG_ATTACHED_LOCAL_USERS_COUNT').on(table.attachedLocalUsersCount),
		index('IDX_HASHTAG_ATTACHED_REMOTE_USERS_COUNT').on(table.attachedRemoteUsersCount),
	],
);

export type HashtagRow = typeof hashtag.$inferSelect;
export type HashtagInsert = typeof hashtag.$inferInsert;
