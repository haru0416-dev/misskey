/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { boolean, char, integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';

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
	avatarId: varchar({ length: 32 }),
	bannerId: varchar({ length: 32 }),
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
});

export type UserRow = typeof user.$inferSelect;
export type UserInsert = typeof user.$inferInsert;
