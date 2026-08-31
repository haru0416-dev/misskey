/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

const emptyVarcharArray = sql`'{}'::character varying[]`;

export const emoji = pgTable(
	'emoji',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		updatedAt: timestamp({ withTimezone: true }),
		name: varchar({ length: 128 }).notNull(),
		host: varchar({ length: 128 }),
		category: varchar({ length: 128 }),
		originalUrl: varchar({ length: 512 }).notNull(),
		publicUrl: varchar({ length: 512 }).default('').notNull(),
		uri: varchar({ length: 512 }),
		// type は originalUrl ではなく publicUrl の MIME type。
		type: varchar({ length: 64 }),
		aliases: varchar({ length: 128 }).array().default(emptyVarcharArray).notNull(),
		license: varchar({ length: 1024 }),
		localOnly: boolean().default(false).notNull(),
		isSensitive: boolean().default(false).notNull(),
		// 削除済みロールの ID が残る場合がある。
		roleIdsThatCanBeUsedThisEmojiAsReaction: varchar({ length: 128 }).array().default(emptyVarcharArray).notNull(),
	},
	(table) => [
		index('IDX_EMOJI_NAME').on(table.name),
		index('IDX_EMOJI_HOST').on(table.host),
		index('IDX_EMOJI_CATEGORY').on(table.category),
		uniqueIndex('IDX_EMOJI_NAME_HOST_UNIQUE').on(table.name, table.host),
		index('IDX_EMOJI_ROLE_IDS').using('gin', table.roleIdsThatCanBeUsedThisEmojiAsReaction),
	],
);

export type EmojiRow = typeof emoji.$inferSelect;
export type EmojiInsert = typeof emoji.$inferInsert;
