/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { preparedQueryFor, UNNAMED_PREPARED_STATEMENT } from '@/db/prepared.js';
import { roleAssignment } from '@/db/schema/role-assignment.js';
import type { RoleAssignmentInsert, RoleAssignmentRow } from '@/db/schema/role-assignment.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import type { MiRole } from '@/models/Role.js';
import type { MiRoleAssignment } from '@/models/RoleAssignment.js';
import type { MiUser } from '@/models/User.js';

export type RoleAssignmentOrder = 'asc' | 'desc';

function deserializeRoleAssignment(row: RoleAssignmentRow): MiRoleAssignment {
	return {
		...row,
		user: null,
		role: null,
	} as MiRoleAssignment;
}

function activeRoleAssignmentCondition(now = new Date()): SQL {
	return or(isNull(roleAssignment.expiresAt), gt(roleAssignment.expiresAt, now))!;
}

function applyRoleAssignmentPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(roleAssignment.id, sinceId));
		conditions.push(lt(roleAssignment.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(roleAssignment.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(roleAssignment.id, untilId));
	}
}

export function resolveRoleAssignmentPagination(
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
	order: RoleAssignmentOrder;
} {
	return resolveDateIdPagination(idService, options);
}

async function fetchRoleAssignmentByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiRoleAssignment['id'],
): Promise<MiRoleAssignment> {
	const [row] = await db.select().from(roleAssignment).where(eq(roleAssignment.id, id)).limit(1);

	if (row == null) {
		throw new Error(`Role assignment ${id} not found`);
	}

	return deserializeRoleAssignment(row);
}

export async function fetchRoleAssignmentByUserIdAndRoleIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	roleId: MiRole['id'],
): Promise<MiRoleAssignment | null> {
	const [row] = await db
		.select()
		.from(roleAssignment)
		.where(and(eq(roleAssignment.userId, userId), eq(roleAssignment.roleId, roleId)))
		.limit(1);

	return row == null ? null : deserializeRoleAssignment(row);
}

const ASSIGNMENT_CACHE_MAX_USERS = 10_000;
const assignmentsByUserId = new Map<MiUser['id'], { version: number; assignments: readonly MiRoleAssignment[] }>();

/**
 * ユーザーの割り当てを世代番号付きで使い回す (世代は fetchRolesCacheVersionFromDatabase 参照)。
 * 期限切れの判定は呼び出し側が expiresAt で行うので、期限が過ぎても世代は変わらない。
 * 上限に達したら全て捨てる (ユーザー数に対する割合は小さく、次の要求で読み直せばよい)。
 */
export async function listRoleAssignmentsByUserIdFromDatabaseCachedByVersion(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	version: number,
): Promise<readonly MiRoleAssignment[]> {
	const cached = assignmentsByUserId.get(userId);
	if (cached?.version === version) {
		return cached.assignments;
	}

	const assignments = await listRoleAssignmentsByUserIdFromDatabase(db, userId);
	for (const entry of assignments) {
		Object.freeze(entry);
	}
	Object.freeze(assignments);
	if (assignmentsByUserId.size >= ASSIGNMENT_CACHE_MAX_USERS) {
		assignmentsByUserId.clear();
	}
	assignmentsByUserId.set(userId, { version, assignments });

	return assignments;
}

export async function listRoleAssignmentsByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
): Promise<MiRoleAssignment[]> {
	const statement = preparedQueryFor(db, 'roleAssignment:byUserId', () =>
		db
			.select()
			.from(roleAssignment)
			.where(eq(roleAssignment.userId, sql.placeholder('userId')))
			.prepare(UNNAMED_PREPARED_STATEMENT),
	);
	const rows = await statement.execute({ userId });

	return rows.map((row) => deserializeRoleAssignment(row));
}

/** ユーザー一覧のpack用: 複数ユーザーのロールアサインを1クエリで取得する。 */
export async function listRoleAssignmentsByUserIdsFromDatabase(
	db: MiDrizzleDatabase,
	userIds: MiUser['id'][],
): Promise<MiRoleAssignment[]> {
	if (userIds.length === 0) {
		return [];
	}

	const statement = preparedQueryFor(db, 'roleAssignment:byUserIds', () =>
		db
			.select()
			.from(roleAssignment)
			.where(sql`${roleAssignment.userId} = ANY(${sql.placeholder('userIds')})`)
			.prepare(UNNAMED_PREPARED_STATEMENT),
	);
	const rows = await statement.execute({ userIds });

	return rows.map((row) => deserializeRoleAssignment(row));
}

export async function listRoleAssignmentsByRoleIdsFromDatabase(
	db: MiDrizzleDatabase,
	roleIds: MiRole['id'][],
): Promise<MiRoleAssignment[]> {
	if (roleIds.length === 0) {
		return [];
	}

	const rows = await db.select().from(roleAssignment).where(inArray(roleAssignment.roleId, roleIds));

	return rows.map((row) => deserializeRoleAssignment(row));
}

export async function countActiveRoleAssignmentsByRoleIdFromDatabase(
	db: MiDrizzleDatabase,
	roleId: MiRole['id'],
): Promise<number> {
	const [row] = await db
		.select({ count: count() })
		.from(roleAssignment)
		.where(and(eq(roleAssignment.roleId, roleId), activeRoleAssignmentCondition()));

	return row?.count ?? 0;
}

export async function countActiveRoleAssignmentsByRoleIdsFromDatabase(
	db: MiDrizzleDatabase,
	roleIds: MiRole['id'][],
): Promise<Map<MiRole['id'], number>> {
	if (roleIds.length === 0) {
		return new Map();
	}

	const rows = await db
		.select({
			roleId: roleAssignment.roleId,
			count: count(),
		})
		.from(roleAssignment)
		.where(and(inArray(roleAssignment.roleId, roleIds), activeRoleAssignmentCondition()))
		.groupBy(roleAssignment.roleId);

	return new Map(rows.map((row) => [row.roleId, row.count]));
}

export async function listActiveRoleAssignmentsByRoleIdFromDatabase(
	db: MiDrizzleDatabase,
	roleId: MiRole['id'],
	options: {
		limit: number;
		order: RoleAssignmentOrder;
		sinceId?: string | null;
		untilId?: string | null;
	},
): Promise<MiRoleAssignment[]> {
	const conditions: SQL[] = [eq(roleAssignment.roleId, roleId), activeRoleAssignmentCondition()];
	applyRoleAssignmentPaginationCondition(conditions, options.sinceId, options.untilId);

	const rows = await db
		.select()
		.from(roleAssignment)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(roleAssignment.id) : desc(roleAssignment.id))
		.limit(options.limit);

	return rows.map((row) => deserializeRoleAssignment(row));
}

export async function createRoleAssignmentInDatabase(
	db: MiDrizzleDatabase,
	data: RoleAssignmentInsert,
): Promise<MiRoleAssignment> {
	const [row] = await db.insert(roleAssignment).values(data).returning();

	if (row == null) {
		throw new Error('Failed to create role assignment');
	}

	return deserializeRoleAssignment(row);
}

export async function deleteRoleAssignmentByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiRoleAssignment['id'],
): Promise<void> {
	await db.delete(roleAssignment).where(eq(roleAssignment.id, id));
}

export async function deleteRoleAssignmentByUserIdAndRoleIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	roleId: MiRole['id'],
): Promise<void> {
	await db.delete(roleAssignment).where(and(eq(roleAssignment.userId, userId), eq(roleAssignment.roleId, roleId)));
}

export async function deleteExpiredRoleAssignmentsFromDatabase(db: MiDrizzleDatabase, now: Date): Promise<void> {
	await db.delete(roleAssignment).where(and(isNotNull(roleAssignment.expiresAt), lt(roleAssignment.expiresAt, now)));
}

async function deleteAllRoleAssignmentsFromDatabase(db: MiDrizzleDatabase): Promise<void> {
	await db.delete(roleAssignment);
}
