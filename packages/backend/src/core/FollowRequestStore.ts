/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, gt, inArray, lt, type SQL } from 'drizzle-orm';
import { followRequest, type FollowRequestInsert, type FollowRequestRow } from '@/db/schema/follow-request.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import { MiFollowRequest } from '@/models/FollowRequest.js';
import type { MiUser } from '@/models/User.js';

export type FollowRequestOrder = 'asc' | 'desc';

function followRequestCondition(followerId: MiUser['id'], followeeId: MiUser['id']) {
	return and(
		eq(followRequest.followerId, followerId),
		eq(followRequest.followeeId, followeeId),
	);
}

function applyFollowRequestPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(followRequest.id, sinceId));
		conditions.push(lt(followRequest.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(followRequest.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(followRequest.id, untilId));
	}
}

export async function fetchFollowRequestByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: FollowRequestRow['id'],
): Promise<FollowRequestRow | null> {
	const [row] = await db
		.select()
		.from(followRequest)
		.where(eq(followRequest.id, id))
		.limit(1);

	return row ?? null;
}

export async function fetchFollowRequestByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: FollowRequestRow['id'],
): Promise<FollowRequestRow> {
	const row = await fetchFollowRequestByIdFromDatabase(db, id);

	if (row == null) {
		throw new EntityNotFoundError(MiFollowRequest, { id });
	}

	return row;
}

export async function fetchFollowRequestFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
	followeeId: MiUser['id'],
): Promise<FollowRequestRow | null> {
	const [row] = await db
		.select()
		.from(followRequest)
		.where(followRequestCondition(followerId, followeeId))
		.limit(1);

	return row ?? null;
}

export async function followRequestExistsInDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
	followeeId: MiUser['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: followRequest.id })
		.from(followRequest)
		.where(followRequestCondition(followerId, followeeId))
		.limit(1);

	return row != null;
}

export async function followRequestExistsByFolloweeIdInDatabase(
	db: MiDrizzleDatabase,
	followeeId: MiUser['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: followRequest.id })
		.from(followRequest)
		.where(eq(followRequest.followeeId, followeeId))
		.limit(1);

	return row != null;
}

export async function createFollowRequestInDatabase(
	db: MiDrizzleDatabase,
	data: FollowRequestInsert,
): Promise<FollowRequestRow> {
	const [row] = await db
		.insert(followRequest)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create follow request');
	}

	return row;
}

export async function deleteFollowRequestFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
	followeeId: MiUser['id'],
): Promise<void> {
	await db
		.delete(followRequest)
		.where(followRequestCondition(followerId, followeeId));
}

export async function deleteFollowRequestsByFolloweeIdFromDatabase(
	db: MiDrizzleDatabase,
	followeeId: MiUser['id'],
): Promise<void> {
	await db
		.delete(followRequest)
		.where(eq(followRequest.followeeId, followeeId));
}

export async function deleteFollowRequestsByFollowerIdFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
): Promise<void> {
	await db
		.delete(followRequest)
		.where(eq(followRequest.followerId, followerId));
}

export async function deleteFollowRequestByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: FollowRequestRow['id'],
): Promise<void> {
	await db
		.delete(followRequest)
		.where(eq(followRequest.id, id));
}

/**
 * following/requests/accept-all 向け。特定ユーザー宛のフォローリクエストを
 * ページングせず全件取得する。
 */
export async function listAllFollowRequestsByFolloweeIdFromDatabase(
	db: MiDrizzleDatabase,
	followeeId: MiUser['id'],
): Promise<FollowRequestRow[]> {
	return await db
		.select()
		.from(followRequest)
		.where(eq(followRequest.followeeId, followeeId));
}

/**
 * 通知の「既に解決されたフォローリクエストか」判定向け。対象の followerId 群を
 * まとめて1クエリで取得し、N+1にならないようにする。
 */
export async function listFollowRequestsByFollowerIdsFromDatabase(
	db: MiDrizzleDatabase,
	followerIds: MiUser['id'][],
): Promise<FollowRequestRow[]> {
	if (followerIds.length === 0) return [];

	return await db
		.select()
		.from(followRequest)
		.where(inArray(followRequest.followerId, followerIds));
}

export async function listFollowRequestFolloweeIdsByFollowerIdFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
): Promise<MiUser['id'][]> {
	const rows = await db
		.select({ followeeId: followRequest.followeeId })
		.from(followRequest)
		.where(eq(followRequest.followerId, followerId));

	return rows.map(row => row.followeeId);
}

export async function listFollowRequestFollowerIdsByFolloweeIdFromDatabase(
	db: MiDrizzleDatabase,
	followeeId: MiUser['id'],
): Promise<MiUser['id'][]> {
	const rows = await db
		.select({ followerId: followRequest.followerId })
		.from(followRequest)
		.where(eq(followRequest.followeeId, followeeId));

	return rows.map(row => row.followerId);
}

export async function listFollowRequestsByFollowerIdFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
	options: {
		limit: number;
		order: FollowRequestOrder;
		sinceId?: string | null;
		untilId?: string | null;
	},
): Promise<FollowRequestRow[]> {
	const conditions: SQL[] = [
		eq(followRequest.followerId, followerId),
	];

	applyFollowRequestPaginationCondition(conditions, options.sinceId, options.untilId);

	return await db
		.select()
		.from(followRequest)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(followRequest.id) : desc(followRequest.id))
		.limit(options.limit);
}

export async function listFollowRequestsByFolloweeIdFromDatabase(
	db: MiDrizzleDatabase,
	followeeId: MiUser['id'],
	options: {
		limit: number;
		order: FollowRequestOrder;
		sinceId?: string | null;
		untilId?: string | null;
	},
): Promise<FollowRequestRow[]> {
	const conditions: SQL[] = [
		eq(followRequest.followeeId, followeeId),
	];

	applyFollowRequestPaginationCondition(conditions, options.sinceId, options.untilId);

	return await db
		.select()
		.from(followRequest)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(followRequest.id) : desc(followRequest.id))
		.limit(options.limit);
}
