/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { boolean, char, jsonb, pgEnum, pgTable, varchar } from 'drizzle-orm/pg-core';
import type { MiUserProfile } from '@/models/UserProfile.js';

const emptyVarcharArray = sql`'{}'::character varying[]`;

export const userProfileFollowingVisibilityEnum = pgEnum('user_profile_followingvisibility_enum', ['public', 'followers', 'private']);
export const userProfileFollowersVisibilityEnum = pgEnum('user_profile_followersvisibility_enum', ['public', 'followers', 'private']);

export const userProfile = pgTable('user_profile', {
	userId: varchar({ length: 32 }).primaryKey().notNull(),
	location: varchar({ length: 128 }),
	birthday: char({ length: 10 }),
	description: varchar({ length: 2048 }),
	followedMessage: varchar({ length: 256 }),
	fields: jsonb().$type<MiUserProfile['fields']>().default([]).notNull(),
	verifiedLinks: varchar().array().default(emptyVarcharArray).notNull(),
	lang: varchar({ length: 32 }),
	url: varchar({ length: 512 }),
	email: varchar({ length: 128 }),
	emailVerifyCode: varchar({ length: 128 }),
	emailVerified: boolean().default(false).notNull(),
	emailNotificationTypes: jsonb().$type<MiUserProfile['emailNotificationTypes']>().default(['follow', 'receiveFollowRequest']).notNull(),
	publicReactions: boolean().default(true).notNull(),
	followingVisibility: userProfileFollowingVisibilityEnum().default('public').notNull(),
	followersVisibility: userProfileFollowersVisibilityEnum().default('public').notNull(),
	twoFactorTempSecret: varchar({ length: 128 }),
	twoFactorSecret: varchar({ length: 128 }),
	twoFactorBackupSecret: varchar().array(),
	twoFactorEnabled: boolean().default(false).notNull(),
	securityKeysAvailable: boolean().default(false).notNull(),
	usePasswordLessLogin: boolean().default(false).notNull(),
	password: varchar({ length: 128 }),
	moderationNote: varchar({ length: 8192 }).default('').notNull(),
	autoAcceptFollowed: boolean().default(false).notNull(),
	noCrawle: boolean().default(false).notNull(),
	preventAiLearning: boolean().default(true).notNull(),
	alwaysMarkNsfw: boolean().default(false).notNull(),
	autoSensitive: boolean().default(false).notNull(),
	carefulBot: boolean().default(false).notNull(),
	injectFeaturedNote: boolean().default(true).notNull(),
	receiveAnnouncementEmail: boolean().default(true).notNull(),
	pinnedPageId: varchar({ length: 32 }),
	enableWordMute: boolean().default(false).notNull(),
	mutedWords: jsonb().$type<MiUserProfile['mutedWords']>().default([]).notNull(),
	hardMutedWords: jsonb().$type<MiUserProfile['hardMutedWords']>().default([]).notNull(),
	mutedInstances: jsonb().$type<MiUserProfile['mutedInstances']>().default([]).notNull(),
	notificationRecieveConfig: jsonb().$type<MiUserProfile['notificationRecieveConfig']>().default({}).notNull(),
	loggedInDates: varchar({ length: 32 }).array().default(emptyVarcharArray).notNull(),
	achievements: jsonb().$type<MiUserProfile['achievements']>().default([]).notNull(),
	userHost: varchar({ length: 128 }),
});

export type UserProfileRow = typeof userProfile.$inferSelect;
export type UserProfileInsert = typeof userProfile.$inferInsert;
