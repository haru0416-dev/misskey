/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { MiChannel } from '@/models/Channel.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiUser } from '@/models/User.js';

const emptyVarcharArray = sql`'{}'::character varying[]`;

export const channel = pgTable('channel', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	lastNotedAt: timestamp({ withTimezone: true }),
	userId: varchar({ length: 32 }).$type<MiUser['id'] | null>(),
	name: varchar({ length: 128 }).notNull(),
	description: varchar({ length: 2048 }),
	bannerId: varchar({ length: 32 }).$type<MiDriveFile['id'] | null>(),
	pinnedNoteIds: varchar({ length: 128 }).array().default(emptyVarcharArray).notNull(),
	color: varchar({ length: 16 }).default('#86b300').notNull(),
	isArchived: boolean().default(false).notNull(),
	notesCount: integer().default(0).notNull(),
	usersCount: integer().default(0).notNull(),
	isSensitive: boolean().default(false).notNull(),
	allowRenoteToExternal: boolean().default(true).notNull(),
}, table => [
	index('IDX_29ef80c6f13bcea998447fce43').on(table.lastNotedAt),
	index('IDX_823bae55bd81b3be6e05cff438').on(table.userId),
	index('IDX_cc7c72974f1b2f385a8921f094').on(table.isArchived),
	index('IDX_0f58c11241e649d2a638a8de94').on(table.notesCount),
	index('IDX_094b86cd36bb805d1aa1e8cc9a').on(table.usersCount),
	index('IDX_CHANNEL_BANNER_ID').on(table.bannerId),
]);

export type ChannelRow = typeof channel.$inferSelect;
export type ChannelInsert = typeof channel.$inferInsert;
