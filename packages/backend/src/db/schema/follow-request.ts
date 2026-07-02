/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { boolean, index, pgTable, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { MiUser } from '@/models/User.js';

export const followRequest = pgTable('follow_request', {
	id: varchar({ length: 32 }).primaryKey().notNull(),
	followeeId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
	followerId: varchar({ length: 32 }).notNull().$type<MiUser['id']>(),
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
	index('IDX_12c01c0d1a79f77d9f6c15fadd').on(table.followeeId),
	index('IDX_a7fd92dd6dc519e6fb435dd108').on(table.followerId),
	uniqueIndex('IDX_d54a512b822fac7ed52800f6b4').on(table.followerId, table.followeeId),
]);

export type FollowRequestRow = typeof followRequest.$inferSelect;
export type FollowRequestInsert = typeof followRequest.$inferInsert;
