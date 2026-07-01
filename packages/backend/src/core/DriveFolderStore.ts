/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, gt, inArray, isNull, lt, type SQL } from 'drizzle-orm';
import { EntityNotFoundError } from 'typeorm';
import { driveFolder, type DriveFolderInsert, type DriveFolderRow } from '@/db/schema/drive-folder.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { MiDriveFolder } from '@/models/DriveFolder.js';
import type { MiUser } from '@/models/User.js';

export type DriveFolderOrder = 'asc' | 'desc';

export type DriveFolderChildFolderCount = {
	parentId: string;
	count: number;
};

function driveFolderByIdAndUserIdCondition(id: DriveFolderRow['id'], userId: MiUser['id'] | null) {
	return and(
		eq(driveFolder.id, id),
		userId != null ? eq(driveFolder.userId, userId) : isNull(driveFolder.userId),
	);
}

function applyDriveFolderPaginationCondition(
	conditions: SQL[],
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId && untilId) {
		conditions.push(gt(driveFolder.id, sinceId));
		conditions.push(lt(driveFolder.id, untilId));
	} else if (sinceId) {
		conditions.push(gt(driveFolder.id, sinceId));
	} else if (untilId) {
		conditions.push(lt(driveFolder.id, untilId));
	}
}

export function resolveDriveFolderPagination(
	idService: { gen(time?: number): string },
	options: {
		sinceId?: string | null;
		untilId?: string | null;
		sinceDate?: number | null;
		untilDate?: number | null;
	},
): {
	sinceId?: string | null;
	untilId?: string | null;
	order: DriveFolderOrder;
} {
	if (options.sinceId && options.untilId) {
		return { sinceId: options.sinceId, untilId: options.untilId, order: 'desc' };
	} else if (options.sinceId) {
		return { sinceId: options.sinceId, untilId: null, order: 'asc' };
	} else if (options.untilId) {
		return { sinceId: null, untilId: options.untilId, order: 'desc' };
	} else if (options.sinceDate && options.untilDate) {
		return { sinceId: idService.gen(options.sinceDate), untilId: idService.gen(options.untilDate), order: 'desc' };
	} else if (options.sinceDate) {
		return { sinceId: idService.gen(options.sinceDate), untilId: null, order: 'asc' };
	} else if (options.untilDate) {
		return { sinceId: null, untilId: idService.gen(options.untilDate), order: 'desc' };
	} else {
		return { sinceId: null, untilId: null, order: 'desc' };
	}
}

export async function fetchDriveFolderByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: DriveFolderRow['id'],
): Promise<DriveFolderRow | null> {
	const [row] = await db
		.select()
		.from(driveFolder)
		.where(eq(driveFolder.id, id))
		.limit(1);

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
	const [row] = await db
		.select()
		.from(driveFolder)
		.where(driveFolderByIdAndUserIdCondition(id, userId))
		.limit(1);

	return row ?? null;
}

export async function fetchDriveFolderByIdAndUserIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: DriveFolderRow['id'],
	userId: MiUser['id'],
): Promise<DriveFolderRow> {
	const row = await fetchDriveFolderByIdAndUserIdFromDatabase(db, id, userId);

	if (row == null) {
		throw new EntityNotFoundError(MiDriveFolder, { id, userId });
	}

	return row;
}

/**
 * DriveFolderEntityService の packMany 向け。フォルダ本体・先祖フォルダをまとめてバッチ取得する。
 */
export async function listDriveFoldersByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: DriveFolderRow['id'][],
): Promise<DriveFolderRow[]> {
	if (ids.length === 0) return [];

	return await db
		.select()
		.from(driveFolder)
		.where(inArray(driveFolder.id, ids));
}

export async function countDriveFoldersByParentIdFromDatabase(
	db: MiDrizzleDatabase,
	parentId: DriveFolderRow['id'],
): Promise<number> {
	const [row] = await db
		.select({ count: count() })
		.from(driveFolder)
		.where(eq(driveFolder.parentId, parentId));

	return row?.count ?? 0;
}

/**
 * DriveFolderEntityService の packMany 向け。フォルダごとに個別カウントクエリを飛ばすと N+1 になるため、
 * 対象の parentId 群をまとめて1クエリで集計する。
 */
export async function countChildDriveFoldersGroupedByParentIdsFromDatabase(
	db: MiDrizzleDatabase,
	parentIds: DriveFolderRow['id'][],
): Promise<DriveFolderChildFolderCount[]> {
	if (parentIds.length === 0) return [];

	const rows = await db
		.select({ parentId: driveFolder.parentId, count: count() })
		.from(driveFolder)
		.where(inArray(driveFolder.parentId, parentIds))
		.groupBy(driveFolder.parentId);

	return rows
		.filter((row): row is { parentId: string; count: number } => row.parentId != null)
		.map(row => ({ parentId: row.parentId, count: row.count }));
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

	applyDriveFolderPaginationCondition(conditions, options.sinceId, options.untilId);

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
		.where(and(
			eq(driveFolder.name, options.name),
			eq(driveFolder.userId, options.userId),
			options.parentId != null ? eq(driveFolder.parentId, options.parentId) : isNull(driveFolder.parentId),
		));
}

export async function createDriveFolderInDatabase(
	db: MiDrizzleDatabase,
	data: DriveFolderInsert,
): Promise<DriveFolderRow> {
	const [row] = await db
		.insert(driveFolder)
		.values(data)
		.returning();

	if (row == null) {
		throw new Error('Failed to create drive folder');
	}

	return row;
}

export async function updateDriveFolderInDatabase(
	db: MiDrizzleDatabase,
	id: DriveFolderRow['id'],
	values: {
		name: DriveFolderRow['name'];
		parentId: DriveFolderRow['parentId'];
	},
): Promise<void> {
	await db
		.update(driveFolder)
		.set(values)
		.where(eq(driveFolder.id, id));
}

export async function deleteDriveFolderByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: DriveFolderRow['id'],
): Promise<void> {
	await db
		.delete(driveFolder)
		.where(eq(driveFolder.id, id));
}
