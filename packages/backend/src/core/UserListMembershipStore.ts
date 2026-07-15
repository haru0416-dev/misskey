/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, gt, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { userListMembership, type UserListMembershipInsert, type UserListMembershipRow } from '@/db/schema/user-list-membership.js';
import { userList } from '@/db/schema/user-list.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import { UpdateValuesMissingError } from '@/misc/db-errors.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';

export type UserListMembershipOrder = 'asc' | 'desc';

function userListMembershipUserAndListCondition(userId: MiUser['id'], userListId: MiUserList['id']) {
	return and(
		eq(userListMembership.userId, userId),
		eq(userListMembership.userListId, userListId),
	);
}

function applyUserListMembershipPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(userListMembership.id, sinceId));
		conditions.push(lt(userListMembership.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(userListMembership.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(userListMembership.id, untilId));
	}
}

export function resolveUserListMembershipPagination(
	idService: { gen(time?: number): string },
	options: {
		sinceId?: string | null;
		untilId?: string | null;
		sinceDate?: number | null;
		untilDate?: number | null;
	},
): {
	sinceId: string | null;
	untilId: string | null;
	order: UserListMembershipOrder;
} {
	return resolveDateIdPagination(idService, options);
}

/**
 * リストの現在の所属人数カウント (人数上限チェック用)。
 */
export async function countUserListMembershipsByUserListIdInDatabase(
	db: MiDrizzleDatabase,
	userListId: MiUserList['id'],
): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(userListMembership)
		.where(eq(userListMembership.userListId, userListId));

	return row?.value ?? 0;
}

export async function userListMembershipExistsInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	userListId: MiUserList['id'],
): Promise<boolean> {
	const [row] = await db
		.select({ id: userListMembership.id })
		.from(userListMembership)
		.where(userListMembershipUserAndListCondition(userId, userListId))
		.limit(1);

	return row != null;
}

/**
 * 複数リストへの所属有無を1クエリで判定する (アンテナ判定でのper-antenna existsクエリ回避用)。
 * 戻り値は userId が実際に所属している userListId の Set (candidateUserListIds の部分集合)。
 */
export async function listUserListIdsContainingUserFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	candidateUserListIds: MiUserList['id'][],
): Promise<Set<MiUserList['id']>> {
	if (candidateUserListIds.length === 0) return new Set();

	const rows = await db
		.select({ userListId: userListMembership.userListId })
		.from(userListMembership)
		.where(and(
			eq(userListMembership.userId, userId),
			sql`${userListMembership.userListId} = ANY(${sql.param(candidateUserListIds)})`,
		));

	return new Set(rows.map(row => row.userListId));
}

export async function fetchUserListMembershipByUserIdAndUserListIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	userListId: MiUserList['id'],
): Promise<UserListMembershipRow | null> {
	const [row] = await db
		.select()
		.from(userListMembership)
		.where(userListMembershipUserAndListCondition(userId, userListId))
		.limit(1);

	return row ?? null;
}

/**
 * ノート投稿時のファンアウト配信先判定 (NoteCreateService) 向け。
 * userListId / userListUserId (リストオーナーの非正規化ID) / withReplies のみを取得する。
 */
export async function listUserListMembershipsForFanoutByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<Pick<UserListMembershipRow, 'userListId' | 'userListUserId' | 'withReplies'>[]> {
	return await db
		.select({
			userListId: userListMembership.userListId,
			userListUserId: userListMembership.userListUserId,
			withReplies: userListMembership.withReplies,
		})
		.from(userListMembership)
		.where(eq(userListMembership.userId, userId));
}

export async function listUserListMembershipsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<UserListMembershipRow[]> {
	return await db
		.select()
		.from(userListMembership)
		.where(eq(userListMembership.userId, userId));
}

export async function listUserListMembershipsByUserListIdFromDatabase(
	db: MiDrizzleDatabase,
	userListId: MiUserList['id'],
): Promise<UserListMembershipRow[]> {
	return await db
		.select()
		.from(userListMembership)
		.where(eq(userListMembership.userListId, userListId));
}

export async function listUserListMembershipUserIdsByUserListIdFromDatabase(
	db: MiDrizzleDatabase,
	userListId: MiUserList['id'],
): Promise<MiUser['id'][]> {
	const rows = await db
		.select({ userId: userListMembership.userId })
		.from(userListMembership)
		.where(eq(userListMembership.userListId, userListId));

	return rows.map(row => row.userId);
}

export async function listUserListMembershipUserIdsByUserListIdsFromDatabase(
	db: MiDrizzleDatabase,
	userListIds: MiUserList['id'][],
): Promise<Map<MiUserList['id'], MiUser['id'][]>> {
	if (userListIds.length === 0) {
		return new Map();
	}

	const rows = await db
		.select({
			userListId: userListMembership.userListId,
			userId: userListMembership.userId,
		})
		.from(userListMembership)
		.where(inArray(userListMembership.userListId, userListIds));
	const userIdsByListId = new Map<MiUserList['id'], MiUser['id'][]>();
	for (const row of rows) {
		let userIds = userIdsByListId.get(row.userListId);
		if (userIds == null) {
			userIds = [];
			userIdsByListId.set(row.userListId, userIds);
		}
		userIds.push(row.userId);
	}

	return userIdsByListId;
}

export async function listUserListMembershipsByUserListIdWithPaginationFromDatabase(
	db: MiDrizzleDatabase,
	userListId: MiUserList['id'],
	options: {
		limit: number;
		order: UserListMembershipOrder;
		sinceId?: string | null;
		untilId?: string | null;
	},
): Promise<UserListMembershipRow[]> {
	const conditions: SQL[] = [
		eq(userListMembership.userListId, userListId),
	];

	applyUserListMembershipPaginationCondition(conditions, options.sinceId, options.untilId);

	return await db
		.select()
		.from(userListMembership)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(userListMembership.id) : desc(userListMembership.id))
		.limit(options.limit);
}

export async function createUserListMembershipInDatabase(
	db: MiDrizzleDatabase,
	data: UserListMembershipInsert,
): Promise<void> {
	await db.insert(userListMembership).values(data);
}

export async function createUserListMembershipWithinLimitInDatabase(
	db: MiDrizzleDatabase,
	data: UserListMembershipInsert,
	limit: number,
): Promise<boolean> {
	return await db.transaction(async tx => {
		const [lockedList] = await tx
			.select({ id: userList.id })
			.from(userList)
			.where(eq(userList.id, data.userListId))
			.limit(1)
			.for('update');
		if (!lockedList) return false;

		const [row] = await tx
			.select({ value: count() })
			.from(userListMembership)
			.where(eq(userListMembership.userListId, data.userListId));
		if ((row?.value ?? 0) >= limit) return false;

		await tx.insert(userListMembership).values(data);
		return true;
	});
}

export async function createUserListMembershipsInDatabase(
	db: MiDrizzleDatabase,
	data: UserListMembershipInsert[],
): Promise<void> {
	if (data.length === 0) return;

	await db.insert(userListMembership).values(data);
}

export async function deleteUserListMembershipInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	userListId: MiUserList['id'],
): Promise<void> {
	await db
		.delete(userListMembership)
		.where(userListMembershipUserAndListCondition(userId, userListId));
}

export async function deleteUserListMembershipsByUserIdAndListOwnerIdInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	listOwnerId: MiUser['id'],
): Promise<void> {
	await db
		.delete(userListMembership)
		.where(and(
			eq(userListMembership.userId, userId),
			eq(userListMembership.userListUserId, listOwnerId),
		));
}

/**
 * NOTE: `withReplies` が undefined の場合は更新対象カラムが存在しないため、
 * 既存の `UpdateValuesMissingError` 挙動に揃える。
 */
export async function updateUserListMembershipWithRepliesInDatabase(
	db: MiDrizzleDatabase,
	id: UserListMembershipRow['id'],
	withReplies: boolean | undefined,
): Promise<void> {
	if (withReplies === undefined) {
		throw new UpdateValuesMissingError();
	}

	await db
		.update(userListMembership)
		.set({ withReplies })
		.where(eq(userListMembership.id, id));
}
