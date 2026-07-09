/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgEnum, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';
import { user } from './user.js';
import { userList } from './user-list.js';

const emptyVarcharArray = sql`'{}'::character varying[]`;

export const antennaSrcEnum = pgEnum('antenna_src_enum', ['home', 'all', 'users', 'list', 'users_blacklist']);

export const antenna = pgTable('antenna', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	lastUsedAt: timestamp({ withTimezone: true }).notNull(),
	userId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	name: varchar({ length: 128 }).notNull(),
	src: antennaSrcEnum().notNull().$type<'home' | 'all' | 'users' | 'list' | 'users_blacklist'>(),
	userListId: varchar({ length: 32 }).$type<MiUserList['id'] | null>().references(() => userList.id, { onDelete: 'cascade' }),
	users: varchar({ length: 1024 }).array().default(emptyVarcharArray).notNull(),
	keywords: jsonb().$type<string[][]>().default([]).notNull(),
	excludeKeywords: jsonb().$type<string[][]>().default([]).notNull(),
	caseSensitive: boolean().default(false).notNull(),
	excludeBots: boolean().default(false).notNull(),
	withReplies: boolean().default(false).notNull(),
	withFile: boolean().notNull(),
	expression: varchar({ length: 2048 }),
	isActive: boolean().default(true).notNull(),
	localOnly: boolean().default(false).notNull(),
	excludeNotesInSensitiveChannel: boolean().default(false).notNull(),
}, table => [
	index('IDX_084c2abb8948ef59a37dce6ac1').on(table.lastUsedAt),
	index('IDX_6446c571a0e8d0f05f01c78909').on(table.userId),
	index('IDX_36ef5192a1ce55ed0e40aa4db5').on(table.isActive),
	index('IDX_ANTENNA_USER_LIST_ID').on(table.userListId),
]);

export type AntennaRow = typeof antenna.$inferSelect;
export type AntennaInsert = typeof antenna.$inferInsert;
