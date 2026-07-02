/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiFollowing } from '@/models/Following.js';
import type { MiUser } from '@/models/User.js';

export const following = pgTable('following', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	followeeId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	followerId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	isFollowerHibernated: boolean().default(false).notNull(),
	withReplies: boolean().default(false).notNull(),
	notify: varchar({ length: 32 }).$type<MiFollowing['notify']>(),
	followerHost: varchar({ length: 128 }),
	followerInbox: varchar({ length: 512 }),
	followerSharedInbox: varchar({ length: 512 }),
	followeeHost: varchar({ length: 128 }),
	followeeInbox: varchar({ length: 512 }),
	followeeSharedInbox: varchar({ length: 512 }),
}, table => [
	index('IDX_24e0042143a18157b234df186c').on(table.followeeId),
	index('IDX_6516c5a6f3c015b4eed39978be').on(table.followerId),
	index('IDX_5108098457488634a4768e1d12').on(table.notify),
	index('IDX_4ccd2239268ebbd1b35e318754').on(table.followerHost),
	index('IDX_fcdafee716dfe9c3b5fde90f30').on(table.followeeHost),
	index('IDX_ce62b50d882d4e9dee10ad0d2f').on(table.followeeId, table.followerHost, table.isFollowerHibernated),
	uniqueIndex('IDX_307be5f1d1252e0388662acb96').on(table.followerId, table.followeeId),
]);

export type FollowingRow = typeof following.$inferSelect;
export type FollowingInsert = typeof following.$inferInsert;
