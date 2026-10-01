/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { driveFolder } from '@/db/schema/drive-folder.js';
import type { DriveFolderInsert, DriveFolderRow } from '@/db/schema/drive-folder.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import { MiDriveFolder } from '@/models/DriveFolder.js';
import type { MiUser } from '@/models/User.js';
import { pushIdPaginationConditions } from '@/db/id-pagination.js';

export type DriveFolderOrder = 'asc' | 'desc';

export type DriveFolderChildFolderCount = {
	parentId: string;
	count: number;
};

function driveFolderByIdAndUserIdCondition(id: DriveFolderRow['id'], userId: MiUser['id'] | null) {
	return and(eq(driveFolder.id, id), userId != null ? eq(driveFolder.userId, userId) : isNull(driveFolder.userId));
}

export async function fetchDriveFolderByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: DriveFolderRow['id'],
): Promise<DriveFolderRow | null> {
	const [row] = await db.select().from(driveFolder).where(eq(driveFolder.id, id)).limit(1);

	return row ?? null;
}

export async function fetchDriveFolderByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: DriveFolderRow['id'],
): Promise<DriveFolderRow> {
	const row = await fetchDriveFolderByIdFromDatabase(db, id);

	if (row == null) {
		throw new EntityNotFoundError(MiDriveFolder, { id });
	}

	return row;
}

export async function fetchDriveFolderByIdAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	id: DriveFolderRow['id'],
	userId: MiUser['id'] | null,
): Promise<DriveFolderRow | null> {
	const [row] = await db.select().from(driveFolder).where(driveFolderByIdAndUserIdCondition(id, userId)).limit(1);

	return row ?? null;
}

/** フォルダ一覧の pack 向け。祖先の探索は呼び出し側で行い、ここでは指定された ID の行だけを取得する。 */
export async function listDriveFoldersByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: DriveFolderRow['id'][],
): Promise<DriveFolderRow[]> {
	if (ids.length === 0) {
		return [];
	}

	return await db.select().from(driveFolder).where(inArray(driveFolder.id, ids));
}

export async function countDriveFoldersByParentIdFromDatabase(
	db: MiDrizzleDatabase,
	parentId: DriveFolderRow['id'],
): Promise<number> {
	const [row] = await db.select({ count: count() }).from(driveFolder).where(eq(driveFolder.parentId, parentId));

	return row?.count ?? 0;
}

/** フォルダ一覧の pack 向け。フォルダごとに数えると N+1 になるため、parentId 群を 1 クエリで集計する。 */
export async function countChildDriveFoldersGroupedByParentIdsFromDatabase(
	db: MiDrizzleDatabase,
	parentIds: DriveFolderRow['id'][],
): Promise<DriveFolderChildFolderCount[]> {
	if (parentIds.length === 0) {
		return [];
	}

	const rows = await db
		.select({ parentId: driveFolder.parentId, count: count() })
		.from(driveFolder)
		.where(inArray(driveFolder.parentId, parentIds))
		.groupBy(driveFolder.parentId);

	const counts: DriveFolderChildFolderCount[] = [];
	for (const row of rows) {
		if (row.parentId != null) counts.push({ parentId: row.parentId, count: row.count });
	}
	return counts;
}

export async function listDriveFoldersByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		limit: number;
		order: DriveFolderOrder;
		sinceId?: string | null;
		untilId?: string | null;
		parentId: DriveFolderRow['id'] | null;
	},
): Promise<DriveFolderRow[]> {
	const conditions: SQL[] = [
		eq(driveFolder.userId, userId),
		options.parentId != null ? eq(driveFolder.parentId, options.parentId) : isNull(driveFolder.parentId),
	];

	pushIdPaginationConditions(conditions, driveFolder.id, options.sinceId, options.untilId);

	return await db
		.select()
		.from(driveFolder)
		.where(and(...conditions))
		.orderBy(options.order === 'asc' ? asc(driveFolder.id) : desc(driveFolder.id))
		.limit(options.limit);
}

export async function listDriveFoldersByNameFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		name: DriveFolderRow['name'];
		userId: MiUser['id'];
		parentId: DriveFolderRow['id'] | null;
	},
): Promise<DriveFolderRow[]> {
	return await db
		.select()
		.from(driveFolder)
		.where(
			and(
				eq(driveFolder.name, options.name),
				eq(driveFolder.userId, options.userId),
				options.parentId != null ? eq(driveFolder.parentId, options.parentId) : isNull(driveFolder.parentId),
			),
		);
}

export async function createDriveFolderInDatabase(
	db: MiDrizzleDatabase,
	data: DriveFolderInsert,
): Promise<DriveFolderRow> {
	const [row] = await db.insert(driveFolder).values(data).returning();

	if (row == null) {
		throw new Error('Failed to create drive folder');
	}

	return row;
}

/**
 * フォルダの親を付け替える。祖先をたどる検査と更新の間に同じ利用者の別の付け替えが入ると、互いを親にした
 * 循環が両方とも検査を通って保存されるので、利用者単位の advisory lock で直列にしてから検査・更新する。
 * 既存の循環に行き当たっても止まるよう、たどった祖先を覚えておく。付け替えると循環する場合は false。
 */
export async function moveDriveFolderInDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	id: DriveFolderRow['id'],
	values: {
		name: DriveFolderRow['name'];
		parentId: DriveFolderRow['id'];
	},
): Promise<boolean> {
	return await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('drive-folder-tree'), hashtext(${userId}))`);
		const visited = new Set<string>();
		for (let current: string | null = values.parentId; current != null;) {
			if (current === id || visited.has(current)) {
				return false;
			}
			visited.add(current);
			const [row] = await tx
				.select({ parentId: driveFolder.parentId })
				.from(driveFolder)
				.where(eq(driveFolder.id, current))
				.limit(1);
			current = row?.parentId ?? null;
		}
		await tx.update(driveFolder).set(values).where(eq(driveFolder.id, id));
		return true;
	});
}

export async function updateDriveFolderInDatabase(
	db: MiDrizzleDatabase,
	id: DriveFolderRow['id'],
	values: {
		name: DriveFolderRow['name'];
		parentId: DriveFolderRow['parentId'];
	},
): Promise<void> {
	await db.update(driveFolder).set(values).where(eq(driveFolder.id, id));
}

export async function deleteDriveFolderByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: DriveFolderRow['id'],
): Promise<void> {
	await db.delete(driveFolder).where(eq(driveFolder.id, id));
}
