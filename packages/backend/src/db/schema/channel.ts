/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';
import { driveFile } from './drive-file.js';

const emptyVarcharArray = sql`'{}'::character varying[]`;

export const channel = pgTable(
	'channel',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		lastNotedAt: timestamp({ withTimezone: true }),
		userId: varchar({ length: 32 })
			.$type<MiUser['id'] | null>()
			.references(() => user.id, { onDelete: 'set null' }),
		name: varchar({ length: 128 }).notNull(),
		description: varchar({ length: 2048 }),
		bannerId: varchar({ length: 32 })
			.$type<MiDriveFile['id'] | null>()
			.references(() => driveFile.id, { onDelete: 'set null' }),
		pinnedNoteIds: varchar({ length: 128 }).array().default(emptyVarcharArray).notNull(),
		color: varchar({ length: 16 }).default('#86b300').notNull(),
		isArchived: boolean().default(false).notNull(),
		notesCount: integer().default(0).notNull(),
		usersCount: integer().default(0).notNull(),
		isSensitive: boolean().default(false).notNull(),
		allowRenoteToExternal: boolean().default(true).notNull(),
	},
	(table) => [
		index('IDX_CHANNEL_LAST_NOTED_AT').on(table.lastNotedAt),
		index('IDX_CHANNEL_USER_ID').on(table.userId),
		index('IDX_CHANNEL_IS_ARCHIVED').on(table.isArchived),
		index('IDX_CHANNEL_NOTES_COUNT').on(table.notesCount),
		index('IDX_CHANNEL_USERS_COUNT').on(table.usersCount),
		index('IDX_CHANNEL_BANNER_ID').on(table.bannerId),
	],
);

export type ChannelRow = typeof channel.$inferSelect;
export type ChannelInsert = typeof channel.$inferInsert;
