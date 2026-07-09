/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { boolean, char, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import { driveFile } from './drive-file.js';

const emptyVarcharArray = sql`'{}'::character varying[]`;

export const user = pgTable('user', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	updatedAt: timestamp({ withTimezone: true }),
	lastFetchedAt: timestamp({ withTimezone: true }),
	lastActiveDate: timestamp({ withTimezone: true }),
	hideOnlineStatus: boolean().default(false).notNull(),
	username: varchar({ length: 128 }).notNull(),
	usernameLower: varchar({ length: 128 }).notNull(),
	name: varchar({ length: 128 }),
	followersCount: integer().default(0).notNull(),
	followingCount: integer().default(0).notNull(),
	movedToUri: varchar({ length: 512 }),
	movedAt: timestamp({ withTimezone: true }),
	alsoKnownAs: text(),
	notesCount: integer().default(0).notNull(),
	avatarId: varchar({ length: 32 }).references((): AnyPgColumn => driveFile.id, { onDelete: 'set null' }),
	bannerId: varchar({ length: 32 }).references((): AnyPgColumn => driveFile.id, { onDelete: 'set null' }),
	avatarUrl: varchar({ length: 1024 }),
	bannerUrl: varchar({ length: 512 }),
	avatarBlurhash: varchar({ length: 128 }),
	bannerBlurhash: varchar({ length: 128 }),
	avatarDecorations: jsonb().$type<MiUser['avatarDecorations']>().default([]).notNull(),
	tags: varchar({ length: 128 }).array().default(emptyVarcharArray).notNull(),
	score: integer().default(0).notNull(),
	isSuspended: boolean().default(false).notNull(),
	isLocked: boolean().default(false).notNull(),
	isBot: boolean().default(false).notNull(),
	isCat: boolean().default(false).notNull(),
	isExplorable: boolean().default(true).notNull(),
	isHibernated: boolean().default(false).notNull(),
	requireSigninToViewContents: boolean().default(false).notNull(),
	makeNotesFollowersOnlyBefore: integer(),
	makeNotesHiddenBefore: integer(),
	isDeleted: boolean().default(false).notNull(),
	emojis: varchar({ length: 128 }).array().default(emptyVarcharArray).notNull(),
	chatScope: varchar({
		length: 128,
		enum: ['everyone', 'followers', 'following', 'mutual', 'none'],
	}).default('mutual').notNull(),
	host: varchar({ length: 128 }),
	inbox: varchar({ length: 512 }),
	sharedInbox: varchar({ length: 512 }),
	featured: varchar({ length: 512 }),
	uri: varchar({ length: 512 }),
	followersUri: varchar({ length: 512 }),
	token: char({ length: 16 }),
}, table => [
	index('IDX_USER_FOLLOWERS_COUNT').on(table.followersCount),
	index('IDX_80ca6e6ef65fb9ef34ea8c90f4').on(table.updatedAt),
	index('IDX_c8cc87bd0f2f4487d17c651fbf').on(table.lastActiveDate),
	index('IDX_a27b942a0d6dcff90e3ee9b5e8').on(table.usernameLower),
	index('IDX_fa99d777623947a5b05f394cae').on(table.tags),
	index('IDX_d5a1b83c7cab66f167e6888188').on(table.isExplorable),
	index('IDX_3252a5df8d5bbd16b281f7799e').on(table.host),
	index('IDX_be623adaa4c566baf5d29ce0c8').on(table.uri),
	uniqueIndex('IDX_a854e557b1b14814750c7c7b0c').on(table.token),
	uniqueIndex('IDX_5deb01ae162d1d70b80d064c27').on(table.usernameLower, table.host),
	uniqueIndex('REL_58f5c71eaab331645112cf8cfa').on(table.avatarId),
	uniqueIndex('REL_afc64b53f8db3707ceb34eb28e').on(table.bannerId),
]);

export type UserRow = typeof user.$inferSelect;
export type UserInsert = typeof user.$inferInsert;
