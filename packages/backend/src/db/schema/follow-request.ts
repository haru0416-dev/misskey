/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';
import { user } from './user.js';

export const followRequest = pgTable('follow_request', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	followeeId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	followerId: varchar({ length: 32 }).notNull().$type<MiUser['id']>().references(() => user.id, { onDelete: 'cascade' }),
	requestId: varchar({ length: 128 }),
	withReplies: boolean().default(false).notNull(),

	//#region Denormalized fields
	followerHost: varchar({ length: 128 }),
	followerInbox: varchar({ length: 512 }),
	followerSharedInbox: varchar({ length: 512 }),
	followeeHost: varchar({ length: 128 }),
	followeeInbox: varchar({ length: 512 }),
	followeeSharedInbox: varchar({ length: 512 }),
	//#endregion
}, table => [
	index('IDX_FOLLOW_REQUEST_FOLLOWEE_ID').on(table.followeeId),
	index('IDX_FOLLOW_REQUEST_FOLLOWER_ID').on(table.followerId),
	uniqueIndex('IDX_FOLLOW_REQUEST_FOLLOWER_ID_FOLLOWEE_ID_UNIQUE').on(table.followerId, table.followeeId),
]);

export type FollowRequestRow = typeof followRequest.$inferSelect;
export type FollowRequestInsert = typeof followRequest.$inferInsert;
