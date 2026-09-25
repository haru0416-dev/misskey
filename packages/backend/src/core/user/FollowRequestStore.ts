/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, desc, eq, inArray, sql, getTableName } from 'drizzle-orm';
import type { Placeholder, SQL } from 'drizzle-orm';
import { defineQueryPlan } from '@/db/prepared.js';
import { followRequest } from '@/db/schema/follow-request.js';
import type { FollowRequestInsert, FollowRequestRow } from '@/db/schema/follow-request.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';
import { pushIdPaginationConditions } from '@/db/id-pagination.js';

export type FollowRequestOrder = 'asc' | 'desc';

function followRequestCondition(followerId: MiUser['id'] | Placeholder, followeeId: MiUser['id'] | Placeholder) {
	return and(eq(followRequest.followerId, followerId), eq(followRequest.followeeId, followeeId));
}

export async function fetchFollowRequestByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: FollowRequestRow['id'],
): Promise<FollowRequestRow | null> {
	const [row] = await db.select().from(followRequest).where(eq(followRequest.id, id)).limit(1);

	return row ?? null;
}

export async function fetchFollowRequestFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
	followeeId: MiUser['id'],
): Promise<FollowRequestRow | null> {
	const [row] = await db.select().from(followRequest).where(followRequestCondition(followerId, followeeId)).limit(1);

	return row ?? null;
}

const followRequestExistsPlan = defineQueryPlan((db) => {
	const selection = { id: followRequest.id };
	return {
		query: db
			.select(selection)
			.from(followRequest)
			.where(followRequestCondition(sql.placeholder('followerId'), sql.placeholder('followeeId')))
			.limit(1),
		selection,
		metadata: { type: 'select', tables: [getTableName(followRequest)] },
	};
});

export async function followRequestExistsInDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
	followeeId: MiUser['id'],
): Promise<boolean> {
	const [row] = await followRequestExistsPlan.execute(db, { followerId, followeeId });

	return row != null;
}

export async function createFollowRequestInDatabase(
	db: MiDrizzleDatabase,
	data: FollowRequestInsert,
): Promise<FollowRequestRow> {
	const [row] = await db.insert(followRequest).values(data).returning();

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
	await db.delete(followRequest).where(followRequestCondition(followerId, followeeId));
}

export async function deleteFollowRequestsByFolloweeIdFromDatabase(
	db: MiDrizzleDatabase,
	followeeId: MiUser['id'],
): Promise<void> {
	await db.delete(followRequest).where(eq(followRequest.followeeId, followeeId));
}

export async function deleteFollowRequestsByFollowerIdFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
): Promise<void> {
	await db.delete(followRequest).where(eq(followRequest.followerId, followerId));
}

export async function deleteFollowRequestByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: FollowRequestRow['id'],
): Promise<void> {
	await db.delete(followRequest).where(eq(followRequest.id, id));
}

/**
 * following/requests/accept-all 向け。特定ユーザー宛のフォローリクエストを
 * ページングせず全件取得する。
 */
export async function listAllFollowRequestsByFolloweeIdFromDatabase(
	db: MiDrizzleDatabase,
	followeeId: MiUser['id'],
): Promise<FollowRequestRow[]> {
	return await db.select().from(followRequest).where(eq(followRequest.followeeId, followeeId));
}

/**
 * 通知の「既に解決されたフォローリクエストか」判定向け。対象の followerId 群を
 * まとめて1クエリで取得し、N+1にならないようにする。
 */
export async function listFollowRequestsByFollowerIdsFromDatabase(
	db: MiDrizzleDatabase,
	followerIds: MiUser['id'][],
): Promise<FollowRequestRow[]> {
	if (followerIds.length === 0) {
		return [];
	}

	return await db.select().from(followRequest).where(inArray(followRequest.followerId, followerIds));
}

export async function listFollowRequestFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase(
	db: MiDrizzleDatabase,
	followerId: MiUser['id'],
	followeeIds: MiUser['id'][],
): Promise<MiUser['id'][]> {
	if (followeeIds.length === 0) {
		return [];
	}

	const rows = await db
		.select({ followeeId: followRequest.followeeId })
		.from(followRequest)
		.where(
			and(eq(followRequest.followerId, followerId), sql`${followRequest.followeeId} = ANY(${sql.param(followeeIds)})`),
		);

	return rows.map((row) => row.followeeId);
}

export async function listFollowRequestFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase(
	db: MiDrizzleDatabase,
	followeeId: MiUser['id'],
	followerIds: MiUser['id'][],
): Promise<MiUser['id'][]> {
	if (followerIds.length === 0) {
		return [];
	}

	const rows = await db
		.select({ followerId: followRequest.followerId })
		.from(followRequest)
		.where(
			and(eq(followRequest.followeeId, followeeId), sql`${followRequest.followerId} = ANY(${sql.param(followerIds)})`),
		);

	return rows.map((row) => row.followerId);
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
	const conditions: SQL[] = [eq(followRequest.followerId, followerId)];

	pushIdPaginationConditions(conditions, followRequest.id, options.sinceId, options.untilId);

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
	const conditions: SQL[] = [eq(followRequest.followeeId, followeeId)];

	pushIdPaginationConditions(conditions, followRequest.id, options.sinceId, options.untilId);

	return await db
		.select()
		.from(followRequest)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(followRequest.id) : desc(followRequest.id))
		.limit(options.limit);
}
