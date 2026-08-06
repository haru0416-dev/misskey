/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiChannel } from '@/models/Channel.js';
import type { MiUser } from '@/models/User.js';
import { channel } from './channel.js';
import { user } from './user.js';

export const channelFollowing = pgTable(
	'channel_following',
	{
		id: varchar({ length: 32 }).primaryKey().notNull(),
		followeeId: varchar({ length: 32 })
			.notNull()
			.$type<MiChannel['id']>()
			.references(() => channel.id, { onDelete: 'cascade' }),
		followerId: varchar({ length: 32 })
			.notNull()
			.$type<MiUser['id']>()
			.references(() => user.id, { onDelete: 'cascade' }),
	},
	(table) => [
		index('IDX_CHANNEL_FOLLOWING_FOLLOWEE_ID').on(table.followeeId),
		index('IDX_CHANNEL_FOLLOWING_FOLLOWER_ID').on(table.followerId),
		uniqueIndex('IDX_CHANNEL_FOLLOWING_FOLLOWER_ID_FOLLOWEE_ID_UNIQUE').on(table.followerId, table.followeeId),
	],
);

export type ChannelFollowingRow = typeof channelFollowing.$inferSelect;
export type ChannelFollowingInsert = typeof channelFollowing.$inferInsert;
