/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { integer, pgTable, uniqueIndex, varchar, index } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';

export const hashtag = pgTable('hashtag', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	name: varchar({ length: 128 }).notNull(),
	mentionedUserIds: varchar({ length: 32 }).array().notNull().$type<MiUser['id'][]>(),
	mentionedUsersCount: integer().default(0).notNull(),
	mentionedLocalUserIds: varchar({ length: 32 }).array().notNull().$type<MiUser['id'][]>(),
	mentionedLocalUsersCount: integer().default(0).notNull(),
	mentionedRemoteUserIds: varchar({ length: 32 }).array().notNull().$type<MiUser['id'][]>(),
	mentionedRemoteUsersCount: integer().default(0).notNull(),
	attachedUserIds: varchar({ length: 32 }).array().notNull().$type<MiUser['id'][]>(),
	attachedUsersCount: integer().default(0).notNull(),
	attachedLocalUserIds: varchar({ length: 32 }).array().notNull().$type<MiUser['id'][]>(),
	attachedLocalUsersCount: integer().default(0).notNull(),
	attachedRemoteUserIds: varchar({ length: 32 }).array().notNull().$type<MiUser['id'][]>(),
	attachedRemoteUsersCount: integer().default(0).notNull(),
}, table => [
	uniqueIndex('IDX_HASHTAG_NAME_UNIQUE').on(table.name),
	index('IDX_HASHTAG_MENTIONED_USERS_COUNT').on(table.mentionedUsersCount),
	index('IDX_HASHTAG_MENTIONED_LOCAL_USERS_COUNT').on(table.mentionedLocalUsersCount),
	index('IDX_HASHTAG_MENTIONED_REMOTE_USERS_COUNT').on(table.mentionedRemoteUsersCount),
	index('IDX_HASHTAG_ATTACHED_USERS_COUNT').on(table.attachedUsersCount),
	index('IDX_HASHTAG_ATTACHED_LOCAL_USERS_COUNT').on(table.attachedLocalUsersCount),
	index('IDX_HASHTAG_ATTACHED_REMOTE_USERS_COUNT').on(table.attachedRemoteUsersCount),
]);

export type HashtagRow = typeof hashtag.$inferSelect;
export type HashtagInsert = typeof hashtag.$inferInsert;
