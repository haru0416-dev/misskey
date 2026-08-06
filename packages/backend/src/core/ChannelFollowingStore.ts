/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, gt, inArray, lt, sql, type Placeholder, type SQL } from 'drizzle-orm';
import { preparedQueryFor, UNNAMED_PREPARED_STATEMENT } from '@/db/prepared.js';
import { channelFollowing, type ChannelFollowingInsert, type ChannelFollowingRow } from '@/db/schema/channel-following.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiChannel } from '@/models/Channel.js';
import type { MiUser } from '@/models/User.js';

export type ChannelFollowingOrder = 'asc' | 'desc';

function channelFollowingCondition(userId: MiUser['id'] | Placeholder, channelId: MiChannel['id'] | Placeholder) {
	return and(
		eq(channelFollowing.followerId, userId),
		eq(channelFollowing.followeeId, channelId),
	);
}

function applyChannelFollowingPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(channelFollowing.followeeId, sinceId));
		conditions.push(lt(channelFollowing.followeeId, untilId));
	} else if (sinceId) {
		conditions.push(gt(channelFollowing.followeeId, sinceId));
	} else if (untilId) {
		conditions.push(lt(channelFollowing.followeeId, untilId));
	}
}

export async function channelFollowingExistsInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	channelId: MiChannel['id'],
): Promise<boolean> {
	const statement = preparedQueryFor(db, 'channelFollowing:exists', () => db
		.select({ id: channelFollowing.id })
		.from(channelFollowing)
		.where(channelFollowingCondition(sql.placeholder('userId'), sql.placeholder('channelId')))
		.limit(1)
		.prepare(UNNAMED_PREPARED_STATEMENT));
	const [row] = await statement.execute({ userId, channelId });

	return row != null;
}

export async function createChannelFollowingInDatabase(
	db: MiDrizzleDatabase,
	data: ChannelFollowingInsert,
): Promise<void> {
	await db
		.insert(channelFollowing)
		.values(data);
}

export async function deleteChannelFollowingFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	channelId: MiChannel['id'],
): Promise<void> {
	await db
		.delete(channelFollowing)
		.where(channelFollowingCondition(userId, channelId));
}

export async function listFollowedChannelIdsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<MiChannel['id'][]> {
	const statement = preparedQueryFor(db, 'channelFollowing:followedChannelIdsByUserId', () => db
		.select({ followeeId: channelFollowing.followeeId })
		.from(channelFollowing)
		.where(eq(channelFollowing.followerId, sql.placeholder('userId')))
		.prepare(UNNAMED_PREPARED_STATEMENT));
	const rows = await statement.execute({ userId });

	return rows.map(row => row.followeeId);
}

export async function listFollowerUserIdsByChannelIdFromDatabase(
	db: MiDrizzleDatabase,
	channelId: MiChannel['id'],
): Promise<MiUser['id'][]> {
	const rows = await db
		.select({ followerId: channelFollowing.followerId })
		.from(channelFollowing)
		.where(eq(channelFollowing.followeeId, channelId));

	return rows.map(row => row.followerId);
}

export async function fetchFollowedChannelIdsByUserIdAndChannelIdsFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	channelIds: MiChannel['id'][],
): Promise<Set<MiChannel['id']>> {
	if (channelIds.length === 0) {
		return new Set();
	}

	const rows = await db
		.select({ followeeId: channelFollowing.followeeId })
		.from(channelFollowing)
		.where(and(
			eq(channelFollowing.followerId, userId),
			inArray(channelFollowing.followeeId, channelIds),
		));

	return new Set(rows.map(row => row.followeeId));
}

export async function listChannelFollowingsByFollowerIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		limit: number;
		order: ChannelFollowingOrder;
		sinceId?: string | null;
		untilId?: string | null;
	},
): Promise<ChannelFollowingRow[]> {
	const conditions: SQL[] = [
		eq(channelFollowing.followerId, userId),
	];

	applyChannelFollowingPaginationCondition(conditions, options.sinceId, options.untilId);

	return await db
		.select()
		.from(channelFollowing)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(channelFollowing.followeeId) : desc(channelFollowing.followeeId))
		.limit(options.limit);
}
