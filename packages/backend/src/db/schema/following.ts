/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiFollowing } from '@/models/Following.js';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

export const following = pgTable('following', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	followeeId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	followerId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
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
	index('IDX_FOLLOWING_FOLLOWEE_ID').on(table.followeeId),
	index('IDX_FOLLOWING_FOLLOWER_ID').on(table.followerId),
	index('IDX_FOLLOWING_NOTIFY').on(table.notify),
	index('IDX_FOLLOWING_FOLLOWER_HOST').on(table.followerHost),
	index('IDX_FOLLOWING_FOLLOWEE_HOST').on(table.followeeHost),
	index('IDX_FOLLOWING_FOLLOWEE_ID_FOLLOWER_HOST_IS_FOLLOWER_HIBERNATED').on(table.followeeId, table.followerHost, table.isFollowerHibernated),
	uniqueIndex('IDX_FOLLOWING_FOLLOWER_ID_FOLLOWEE_ID_UNIQUE').on(table.followerId, table.followeeId),
	index('IDX_FOLLOWING_FOLLOWEE_ID_ID').on(table.followeeId, table.id),
	index('IDX_FOLLOWING_FOLLOWER_ID_ID').on(table.followerId, table.id),
]);

export type FollowingRow = typeof following.$inferSelect;
export type FollowingInsert = typeof following.$inferInsert;
