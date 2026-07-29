/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, not, or, sql, type SQL } from 'drizzle-orm';
import { following, type FollowingInsert, type FollowingRow } from '@/db/schema/following.js';
import { user as userTable } from '@/db/schema/user.js';
import { userProfile } from '@/db/schema/user-profile.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import type { MiFollowing } from '@/models/Following.js';
import type { MiUser } from '@/models/User.js';
import { adjustUserFollowersCountInDatabase, adjustUserFollowingCountInDatabase, updateUserInDatabase } from './UserStore.js';

export type FollowingUpdate = Partial<Pick<FollowingRow, 'notify' | 'withReplies' | 'isFollowerHibernated' | 'followerSharedInbox'>>;
export type FollowingOrder = 'asc' | 'desc';

function deserializeFollowing(row: FollowingRow): MiFollowing {
	return {
		...row,
		followee: null,
		follower: null,
	} as MiFollowing;
}

function applyFollowingPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(following.id, sinceId));
		conditions.push(lt(following.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(following.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(following.id, untilId));
	}
}

export async function listFollowingsByFollowerIdFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
	options: {
		limit: number;
		sinceId?: MiFollowing['id'] | null;
		excludeFolloweeIds?: MiUser['id'][];
	},
): Promise<MiFollowing[]> {
	const conditions: SQL[] = [eq(following.followerId, followerId)];

	if (options.excludeFolloweeIds && options.excludeFolloweeIds.length > 0) {
		conditions.push(not(inArray(following.followeeId, options.excludeFolloweeIds))!);
	}

	if (options.sinceId) {
		conditions.push(gt(following.id, options.sinceId));
	}

	const rows = await db
		.select()
		.from(following)
		.where(and(...conditions))
		.orderBy(asc(following.id))
		.limit(options.limit);

	return rows.map(row => deserializeFollowing(row));
}

export async function listAllFollowingsByFollowerIdFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
): Promise<MiFollowing[]> {
	const rows = await db
		.select()
		.from(following)
		.where(eq(following.followerId, followerId));

	return rows.map(row => deserializeFollowing(row));
}

export async function listFollowingsByFollowerIdAndFolloweeIdsFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
	followeeIds: MiUser['id'][],
): Promise<MiFollowing[]> {
	if (followeeIds.length === 0) return [];

	const rows = await db
		.select()
		.from(following)
		.where(and(
			eq(following.followerId, followerId),
			sql`${following.followeeId} = ANY(${sql.param(followeeIds)})`,
		));

	return rows.map(row => deserializeFollowing(row));
}

/**
 * タイムライン組み立て用にフォロー先IDだけを取得する軽量版。
 * フォロー数の多いユーザーで全カラムのフェッチ+デシリアライズを避ける。
 */
export async function listFolloweeIdsByFollowerIdFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
): Promise<MiUser['id'][]> {
	const rows = await db
		.select({ followeeId: following.followeeId })
		.from(following)
		.where(eq(following.followerId, followerId));

	return rows.map(row => row.followeeId);
}

export async function listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
	followeeIds: MiUser['id'][],
): Promise<MiUser['id'][]> {
	if (followeeIds.length === 0) return [];

	const rows = await db
		.select({ followeeId: following.followeeId })
		.from(following)
		.where(and(
			eq(following.followerId, followerId),
			sql`${following.followeeId} = ANY(${sql.param(followeeIds)})`,
		));

	return rows.map(row => row.followeeId);
}

export async function listLocalFollowerFollowingsByFolloweeIdFromDatabase(
	db: MiDrizzleDatabase,
	followeeId: MiUser['id'],
	options: {
		excludeFollowerIds?: MiUser['id'][];
	} = {},
): Promise<Pick<MiFollowing, 'followerId' | 'followeeId'>[]> {
	const conditions: SQL[] = [
		eq(following.followeeId, followeeId),
		isNull(following.followerHost),
	];

	if (options.excludeFollowerIds && options.excludeFollowerIds.length > 0) {
		conditions.push(not(inArray(following.followerId, options.excludeFollowerIds))!);
	}

	return await db
		.select({
			followerId: following.followerId,
			followeeId: following.followeeId,
		})
		.from(following)
		.where(and(...conditions));
}

export async function listFollowerIdsByFolloweeIdFromDatabase(
	db: MiDrizzleDatabase,
	followeeId: MiUser['id'],
): Promise<MiUser['id'][]> {
	const rows = await db
		.select({ followerId: following.followerId })
		.from(following)
		.where(eq(following.followeeId, followeeId));

	return rows.map(row => row.followerId);
}

export async function listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase(
	db: MiDrizzleDatabase,
	followeeId: MiUser['id'],
	followerIds: MiUser['id'][],
): Promise<MiUser['id'][]> {
	if (followerIds.length === 0) return [];

	const rows = await db
		.select({ followerId: following.followerId })
		.from(following)
		.where(and(
			eq(following.followeeId, followeeId),
			sql`${following.followerId} = ANY(${sql.param(followerIds)})`,
		));

	return rows.map(row => row.followerId);
}

export async function listFollowingsByFollowerIdsAndFolloweeIdsFromDatabase(
	db: MiDrizzleDatabase,
	followerIds: MiUser['id'][],
	followeeIds: MiUser['id'][],
): Promise<Pick<MiFollowing, 'followerId' | 'followeeId'>[]> {
	if (followerIds.length === 0 || followeeIds.length === 0) return [];

	return await db
		.select({
			followerId: following.followerId,
			followeeId: following.followeeId,
		})
		.from(following)
		.where(and(
			sql`${following.followerId} = ANY(${sql.param(followerIds)})`,
			sql`${following.followeeId} = ANY(${sql.param(followeeIds)})`,
		));
}

export async function listNotificationFollowerIdsByFolloweeIdFromDatabase(
	db: MiDrizzleDatabase,
	followeeId: MiUser['id'],
): Promise<MiUser['id'][]> {
	const rows = await db
		.select({ followerId: following.followerId })
		.from(following)
		.where(and(
			eq(following.followeeId, followeeId),
			eq(following.notify, 'normal'),
		));

	return rows.map(row => row.followerId);
}

export async function listFollowingsByFollowerIdWithPaginationFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
	options: {
		limit: number;
		sinceId?: MiFollowing['id'] | null;
		untilId?: MiFollowing['id'] | null;
		order: FollowingOrder;
		notification?: boolean;
	},
): Promise<MiFollowing[]> {
	const conditions: SQL[] = [eq(following.followerId, followerId)];

	applyFollowingPaginationCondition(conditions, options.sinceId, options.untilId);

	if (options.notification) {
		conditions.push(isNotNull(following.notify));
	}

	const rows = await db
		.select()
		.from(following)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(following.id) : desc(following.id))
		.limit(options.limit);

	return rows.map(row => deserializeFollowing(row));
}

export async function listFollowersByFolloweeIdWithPaginationFromDatabase(
	db: MiDrizzleDatabase,
	followeeId: MiUser['id'],
	options: {
		limit: number;
		sinceId?: MiFollowing['id'] | null;
		untilId?: MiFollowing['id'] | null;
		order: FollowingOrder;
	},
): Promise<MiFollowing[]> {
	const conditions: SQL[] = [eq(following.followeeId, followeeId)];

	applyFollowingPaginationCondition(conditions, options.sinceId, options.untilId);

	const rows = await db
		.select()
		.from(following)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(following.id) : desc(following.id))
		.limit(options.limit);

	return rows.map(row => deserializeFollowing(row));
}

export async function listFollowingsByFollowerIdAndBirthdayWithPaginationFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
	birthdayDate: number,
	options: {
		limit: number;
		sinceId?: MiFollowing['id'] | null;
		untilId?: MiFollowing['id'] | null;
		order: FollowingOrder;
	},
): Promise<MiFollowing[]> {
	const conditions: SQL[] = [
		eq(following.followerId, followerId),
		sql`get_birthday_date(${userProfile.birthday}) BETWEEN ${birthdayDate} AND ${birthdayDate}`,
	];

	applyFollowingPaginationCondition(conditions, options.sinceId, options.untilId);

	const rows = await db
		.select()
		.from(following)
		.innerJoin(userProfile, eq(userProfile.userId, following.followeeId))
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(following.id) : desc(following.id))
		.limit(options.limit);

	return rows.map(row => deserializeFollowing(row.following));
}

export async function listFollowingsByHostWithPaginationFromDatabase(
	db: MiDrizzleDatabase,
	hostType: 'follower' | 'followee',
	host: NonNullable<MiFollowing['followerHost'] | MiFollowing['followeeHost']>,
	options: {
		limit: number;
		sinceId?: MiFollowing['id'] | null;
		untilId?: MiFollowing['id'] | null;
		order: FollowingOrder;
	},
): Promise<MiFollowing[]> {
	const conditions: SQL[] = [
		hostType === 'follower'
			? eq(following.followerHost, host)
			: eq(following.followeeHost, host),
	];

	applyFollowingPaginationCondition(conditions, options.sinceId, options.untilId);

	const rows = await db
		.select()
		.from(following)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(following.id) : desc(following.id))
		.limit(options.limit);

	return rows.map(row => deserializeFollowing(row));
}

export async function listFolloweeIdsWithRepliesByFollowerIdFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
): Promise<{ followeeId: MiUser['id']; withReplies: boolean }[]> {
	return await db
		.select({
			followeeId: following.followeeId,
			withReplies: following.withReplies,
		})
		.from(following)
		.where(eq(following.followerId, followerId));
}

export async function listActiveLocalFollowerFollowingsByFolloweeIdFromDatabase(
	db: MiDrizzleDatabase,
	followeeId: MiUser['id'],
): Promise<Pick<MiFollowing, 'followerId' | 'withReplies'>[]> {
	return await db
		.select({
			followerId: following.followerId,
			withReplies: following.withReplies,
		})
		.from(following)
		.where(and(
			eq(following.followeeId, followeeId),
			isNull(following.followerHost),
			eq(following.isFollowerHibernated, false),
		));
}

export async function listSharedInboxesFromFollowingsInDatabase(
	db: MiDrizzleDatabase,
): Promise<string[]> {
	const rows = await db
		.select({
			followerSharedInbox: following.followerSharedInbox,
			followeeSharedInbox: following.followeeSharedInbox,
		})
		.from(following)
		.where(or(
			isNotNull(following.followerSharedInbox),
			isNotNull(following.followeeSharedInbox),
		));

	return [...new Set(rows.flatMap(row => [
		row.followerSharedInbox,
		row.followeeSharedInbox,
	]).filter((inbox): inbox is string => inbox != null))];
}

export async function listFollowerInboxesByFolloweeIdFromDatabase(
	db: MiDrizzleDatabase,
	followeeId: MiUser['id'],
): Promise<{ followerSharedInbox: MiFollowing['followerSharedInbox']; followerInbox: MiFollowing['followerInbox'] }[]> {
	return await db
		.select({
			followerSharedInbox: following.followerSharedInbox,
			followerInbox: following.followerInbox,
		})
		.from(following)
		.where(and(
			eq(following.followeeId, followeeId),
			isNotNull(following.followerHost),
		));
}

export async function listFollowingsForUnfollowByFollowerIdFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
): Promise<Pick<MiFollowing, 'followerId' | 'followeeId'>[]> {
	return await db
		.select({
			followerId: following.followerId,
			followeeId: following.followeeId,
		})
		.from(following)
		.where(eq(following.followerId, followerId));
}

export async function fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
	followeeId: MiUser['id'],
): Promise<MiFollowing | null> {
	const [row] = await db
		.select()
		.from(following)
		.where(and(
			eq(following.followerId, followerId),
			eq(following.followeeId, followeeId),
		))
		.limit(1);

	return row ? deserializeFollowing(row) : null;
}

export async function createFollowingInDatabase(
	db: MiDrizzleDatabase,
	data: FollowingInsert,
): Promise<MiFollowing> {
	const [row] = await db
		.insert(following)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create following');
	}

	return deserializeFollowing(row);
}

export async function deleteFollowingAndUpdateUserCountsByIdInDatabase(
	db: MiDrizzleDatabase,
	id: MiFollowing['id'],
	followerId: MiUser['id'],
	followeeId: MiUser['id'],
): Promise<boolean> {
	return await db.transaction(async transaction => {
		const tx = transaction as typeof db;
		const users = await tx
			.select({ id: userTable.id, movedToUri: userTable.movedToUri })
			.from(userTable)
			.where(inArray(userTable.id, [followerId, followeeId]))
			.orderBy(asc(userTable.id))
			.for('update');
		const movedToUriByUserId = new Map(users.map(user => [user.id, user.movedToUri]));

		const deleted = await tx
			.delete(following)
			.where(and(
				eq(following.id, id),
				eq(following.followerId, followerId),
				eq(following.followeeId, followeeId),
			))
			.returning({ id: following.id });
		if (deleted.length === 0) return false;

		if (!movedToUriByUserId.get(followerId) && !movedToUriByUserId.get(followeeId)) {
			await Promise.all([
				adjustUserFollowingCountInDatabase(tx, followerId, -1),
				adjustUserFollowersCountInDatabase(tx, followeeId, -1),
			]);
			return true;
		}

		for (const userId of [followerId, followeeId]) {
			if (movedToUriByUserId.get(userId)) continue;

			const [nonMovedFollowees, nonMovedFollowers] = await Promise.all([
				countNonMovedFolloweesByFollowerIdFromDatabase(tx, userId),
				countNonMovedFollowersByFolloweeIdFromDatabase(tx, userId),
			]);
			await updateUserInDatabase(tx, userId, {
				followingCount: nonMovedFollowees,
				followersCount: nonMovedFollowers,
			});
		}

		return true;
	});
}

export async function fetchFollowingByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiFollowing['id'],
): Promise<MiFollowing> {
	const [row] = await db
		.select()
		.from(following)
		.where(eq(following.id, id))
		.limit(1);

	if (row == null) {
		throw new EntityNotFoundError('MiFollowing', { id });
	}

	return deserializeFollowing(row);
}

export async function followingExistsInDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
	followeeId: MiUser['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: following.id })
		.from(following)
		.where(and(
			eq(following.followerId, followerId),
			eq(following.followeeId, followeeId),
		))
		.limit(1);

	return row != null;
}

export async function updateFollowingByIdInDatabase(
	db: MiDrizzleDatabase,
	id: MiFollowing['id'],
	values: FollowingUpdate,
): Promise<void> {
	await db
		.update(following)
		.set(values)
		.where(eq(following.id, id));
}

export async function updateFollowingsByFollowerIdInDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
	values: FollowingUpdate,
): Promise<void> {
	await db
		.update(following)
		.set(values)
		.where(eq(following.followerId, followerId));
}

export async function listFollowingsByFollowerHostFromDatabase(
	db: MiDrizzleDatabase,
	followerHost: NonNullable<MiFollowing['followerHost']>,
): Promise<Pick<MiFollowing, 'followerId' | 'followeeId'>[]> {
	return await db
		.select({
			followerId: following.followerId,
			followeeId: following.followeeId,
		})
		.from(following)
		.where(eq(following.followerHost, followerHost));
}

export async function countFollowingsWithRemoteFolloweeHostFromDatabase(db: MiDrizzleDatabase): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(following)
		.where(isNotNull(following.followeeHost));

	return row?.value ?? 0;
}

export async function countFollowingsWithRemoteFollowerHostFromDatabase(db: MiDrizzleDatabase): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(following)
		.where(isNotNull(following.followerHost));

	return row?.value ?? 0;
}

export async function countNonMovedFolloweesByFollowerIdFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(following)
		.innerJoin(userTable, eq(userTable.id, following.followeeId))
		.where(and(
			eq(following.followerId, followerId),
			isNull(userTable.movedToUri),
		));

	return row?.value ?? 0;
}

export async function countNonMovedFollowersByFolloweeIdFromDatabase(
	db: MiDrizzleDatabase,
	followeeId: MiUser['id'],
): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(following)
		.innerJoin(userTable, eq(userTable.id, following.followerId))
		.where(and(
			eq(following.followeeId, followeeId),
			isNull(userTable.movedToUri),
		));

	return row?.value ?? 0;
}

export async function countMutualFollowingsBetweenUsersFromDatabase(
	db: MiDrizzleDatabase,
	aUserId: MiUser['id'],
	bUserId: MiUser['id'],
): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(following)
		.where(or(
			and(
				eq(following.followerId, aUserId),
				eq(following.followeeId, bUserId),
			),
			and(
				eq(following.followerId, bUserId),
				eq(following.followeeId, aUserId),
			),
		));

	return row?.value ?? 0;
}

export async function countFollowingsByFollowerIdAndFolloweeHostStateFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
	isRemoteFollowee: boolean,
): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(following)
		.where(and(
			eq(following.followerId, followerId),
			isRemoteFollowee ? isNotNull(following.followeeHost) : isNull(following.followeeHost),
		));

	return row?.value ?? 0;
}

export async function countFollowingsByFolloweeIdAndFollowerHostStateFromDatabase(
	db: MiDrizzleDatabase,
	followeeId: MiUser['id'],
	isRemoteFollower: boolean,
): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(following)
		.where(and(
			eq(following.followeeId, followeeId),
			isRemoteFollower ? isNotNull(following.followerHost) : isNull(following.followerHost),
		));

	return row?.value ?? 0;
}

export async function countFollowingsByFollowerHostFromDatabase(
	db: MiDrizzleDatabase,
	followerHost: NonNullable<MiFollowing['followerHost']>,
): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(following)
		.where(eq(following.followerHost, followerHost));

	return row?.value ?? 0;
}

export async function countFollowingsByFolloweeHostFromDatabase(
	db: MiDrizzleDatabase,
	followeeHost: NonNullable<MiFollowing['followeeHost']>,
): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(following)
		.where(eq(following.followeeHost, followeeHost));

	return row?.value ?? 0;
}

export async function updateFollowerHibernatedStateByFollowerIdInDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
	isFollowerHibernated: boolean,
): Promise<void> {
	await db
		.update(following)
		.set({ isFollowerHibernated })
		.where(eq(following.followerId, followerId));
}

export async function updateFollowerHibernatedStateByFollowerIdsInDatabase(
	db: MiDrizzleDatabase,
	followerIds: MiUser['id'][],
	isFollowerHibernated: boolean,
): Promise<void> {
	if (followerIds.length === 0) return;

	await db
		.update(following)
		.set({ isFollowerHibernated })
		.where(inArray(following.followerId, followerIds));
}
