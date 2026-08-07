/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	like,
	lt,
	or,
	sql,
	sum,
	type SQL,
} from 'drizzle-orm';
import { preparedQueryFor, UNNAMED_PREPARED_STATEMENT } from '@/db/prepared.js';
import { driveFile, type DriveFileInsert, type DriveFileRow } from '@/db/schema/drive-file.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiUser } from '@/models/User.js';

function deserializeDriveFile(row: DriveFileRow): MiDriveFile {
	return {
		...row,
		user: null,
		folder: null,
	} as MiDriveFile;
}

export type DriveFileUpdate = Partial<Omit<DriveFileRow, 'id'>>;

type DriveFileListSort = '+createdAt' | '-createdAt' | '+name' | '-name' | '+size' | '-size' | null;

function driveFilePaginationCondition(options: {
	sinceId?: MiDriveFile['id'] | null;
	untilId?: MiDriveFile['id'] | null;
}): SQL {
	if (options.sinceId && options.untilId) {
		return and(gt(driveFile.id, options.sinceId), lt(driveFile.id, options.untilId)) ?? sql`TRUE`;
	}

	if (options.sinceId) {
		return gt(driveFile.id, options.sinceId);
	}

	if (options.untilId) {
		return lt(driveFile.id, options.untilId);
	}

	return sql`TRUE`;
}

function driveFilePaginationOrder(options: {
	sinceId?: MiDriveFile['id'] | null;
	untilId?: MiDriveFile['id'] | null;
	sort?: DriveFileListSort;
}): SQL {
	switch (options.sort) {
		case '+createdAt':
			return desc(driveFile.id);
		case '-createdAt':
			return asc(driveFile.id);
		case '+name':
			return desc(driveFile.name);
		case '-name':
			return asc(driveFile.name);
		case '+size':
			return desc(driveFile.size);
		case '-size':
			return asc(driveFile.size);
		default:
			return options.sinceId && !options.untilId ? asc(driveFile.id) : desc(driveFile.id);
	}
}

export async function createDriveFileInDatabase(db: MiDrizzleDatabase, data: DriveFileInsert): Promise<MiDriveFile> {
	const [row] = await db.insert(driveFile).values(data).returning();

	if (row == null) {
		throw new Error('Failed to create drive file');
	}

	return deserializeDriveFile(row);
}

export async function fetchDriveFileByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiDriveFile['id'],
): Promise<MiDriveFile | null> {
	const [row] = await db.select().from(driveFile).where(eq(driveFile.id, id)).limit(1);

	return row ? deserializeDriveFile(row) : null;
}

export async function fetchDriveFileByIdAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiDriveFile['id'],
	userId: NonNullable<MiDriveFile['userId']>,
): Promise<MiDriveFile | null> {
	const [row] = await db
		.select()
		.from(driveFile)
		.where(and(eq(driveFile.id, id), eq(driveFile.userId, userId)))
		.limit(1);

	return row ? deserializeDriveFile(row) : null;
}

export async function fetchDriveFileByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiDriveFile['id'],
): Promise<MiDriveFile> {
	const file = await fetchDriveFileByIdFromDatabase(db, id);

	if (file == null) {
		throw new EntityNotFoundError('MiDriveFile', { id });
	}

	return file;
}

export async function fetchDriveFileByAccessKeyFromDatabase(
	db: MiDrizzleDatabase,
	key: string,
): Promise<MiDriveFile | null> {
	const [row] = await db
		.select()
		.from(driveFile)
		.where(
			or(eq(driveFile.accessKey, key), eq(driveFile.thumbnailAccessKey, key), eq(driveFile.webpublicAccessKey, key)),
		)
		.limit(1);

	return row ? deserializeDriveFile(row) : null;
}

export async function listDriveFilesByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiDriveFile['id'][],
): Promise<MiDriveFile[]> {
	if (ids.length === 0) return [];

	// IN (...) は件数ぶんプレースホルダが増えて SQL の形が変わるため、
	// 形を固定できる = ANY(配列1個) にして組み立て済みを使い回す
	const statement = preparedQueryFor(db, 'driveFile:byIds', () =>
		db
			.select()
			.from(driveFile)
			.where(sql`${driveFile.id} = ANY(${sql.placeholder('ids')})`)
			.prepare(UNNAMED_PREPARED_STATEMENT),
	);
	const rows = await statement.execute({ ids });

	return rows.map((row) => deserializeDriveFile(row));
}

export async function listDriveFilesByIdsAndUserIdPreservingOrderFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiDriveFile['id'][],
	userId: NonNullable<MiDriveFile['userId']>,
): Promise<MiDriveFile[]> {
	if (ids.length === 0) return [];

	const rows = await db
		.select()
		.from(driveFile)
		.where(and(eq(driveFile.userId, userId), inArray(driveFile.id, ids)))
		.orderBy(
			sql`array_position(ARRAY[${sql.join(
				ids.map((id) => sql`${id}`),
				sql`, `,
			)}]::text[], ${driveFile.id}::text)`,
		);

	return rows.map((row) => deserializeDriveFile(row));
}

export async function fetchDriveFileByMd5AndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	md5: MiDriveFile['md5'],
	userId: NonNullable<MiDriveFile['userId']>,
): Promise<MiDriveFile | null> {
	const [row] = await db
		.select()
		.from(driveFile)
		.where(and(eq(driveFile.md5, md5), eq(driveFile.userId, userId)))
		.limit(1);

	return row ? deserializeDriveFile(row) : null;
}

export async function driveFileExistsByMd5AndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	md5: MiDriveFile['md5'],
	userId: NonNullable<MiDriveFile['userId']>,
): Promise<boolean> {
	const [row] = await db
		.select({ id: driveFile.id })
		.from(driveFile)
		.where(and(eq(driveFile.md5, md5), eq(driveFile.userId, userId)))
		.limit(1);

	return row != null;
}

export async function listDriveFilesByMd5AndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	md5: MiDriveFile['md5'],
	userId: NonNullable<MiDriveFile['userId']>,
): Promise<MiDriveFile[]> {
	const rows = await db
		.select()
		.from(driveFile)
		.where(and(eq(driveFile.md5, md5), eq(driveFile.userId, userId)));

	return rows.map((row) => deserializeDriveFile(row));
}

export async function fetchDriveFileByUrlFromDatabase(db: MiDrizzleDatabase, url: string): Promise<MiDriveFile | null> {
	const [row] = await db
		.select()
		.from(driveFile)
		.where(or(eq(driveFile.url, url), eq(driveFile.webpublicUrl, url), eq(driveFile.thumbnailUrl, url)))
		.limit(1);

	return row ? deserializeDriveFile(row) : null;
}

export async function fetchDriveFileByUriAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	uri: NonNullable<MiDriveFile['uri']>,
	userId: MiDriveFile['userId'],
): Promise<MiDriveFile | null> {
	const [row] = await db
		.select()
		.from(driveFile)
		.where(and(eq(driveFile.uri, uri), userId == null ? isNull(driveFile.userId) : eq(driveFile.userId, userId)))
		.limit(1);

	return row ? deserializeDriveFile(row) : null;
}

export async function listDriveFilesByNameUserIdAndFolderIdFromDatabase(
	db: MiDrizzleDatabase,
	params: {
		name: MiDriveFile['name'];
		userId: NonNullable<MiDriveFile['userId']>;
		folderId: MiDriveFile['folderId'];
	},
): Promise<MiDriveFile[]> {
	const rows = await db
		.select()
		.from(driveFile)
		.where(
			and(
				eq(driveFile.name, params.name),
				eq(driveFile.userId, params.userId),
				params.folderId == null ? isNull(driveFile.folderId) : eq(driveFile.folderId, params.folderId),
			),
		);

	return rows.map((row) => deserializeDriveFile(row));
}

export async function listOrphanDriveFilesFromDatabase(db: MiDrizzleDatabase): Promise<MiDriveFile[]> {
	const rows = await db.select().from(driveFile).where(isNull(driveFile.userId));

	return rows.map((row) => deserializeDriveFile(row));
}

export async function listDriveFilesForUserFromDatabase(
	db: MiDrizzleDatabase,
	params: {
		userId: NonNullable<MiDriveFile['userId']>;
		limit: number;
		sinceId?: MiDriveFile['id'] | null;
		untilId?: MiDriveFile['id'] | null;
		folderId?: MiDriveFile['folderId'] | undefined;
		type?: MiDriveFile['type'] | null;
		sort?: DriveFileListSort;
	},
): Promise<MiDriveFile[]> {
	const conditions: SQL[] = [driveFilePaginationCondition(params), eq(driveFile.userId, params.userId)];

	if (params.folderId !== undefined) {
		conditions.push(params.folderId == null ? isNull(driveFile.folderId) : eq(driveFile.folderId, params.folderId));
	}

	if (params.type) {
		if (params.type.endsWith('/*')) {
			conditions.push(like(driveFile.type, `${params.type.replace('/*', '/')}%`));
		} else {
			conditions.push(eq(driveFile.type, params.type));
		}
	}

	const rows = await db
		.select()
		.from(driveFile)
		.where(and(...conditions))
		.orderBy(driveFilePaginationOrder(params))
		.limit(params.limit);

	return rows.map((row) => deserializeDriveFile(row));
}

export async function listAllDriveFilesByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: NonNullable<MiDriveFile['userId']>,
): Promise<MiDriveFile[]> {
	const rows = await db.select().from(driveFile).where(eq(driveFile.userId, userId));

	return rows.map((row) => deserializeDriveFile(row));
}

export async function listAllDriveFilesByUserHostFromDatabase(
	db: MiDrizzleDatabase,
	userHost: NonNullable<MiDriveFile['userHost']>,
): Promise<MiDriveFile[]> {
	const rows = await db.select().from(driveFile).where(eq(driveFile.userHost, userHost));

	return rows.map((row) => deserializeDriveFile(row));
}

export async function listDriveFilesForAdminFromDatabase(
	db: MiDrizzleDatabase,
	params: {
		limit: number;
		sinceId?: MiDriveFile['id'] | null;
		untilId?: MiDriveFile['id'] | null;
		userId?: MiDriveFile['userId'] | null;
		type?: MiDriveFile['type'] | null;
		origin: 'combined' | 'local' | 'remote';
		hostname?: MiDriveFile['userHost'] | null;
	},
): Promise<MiDriveFile[]> {
	const conditions: SQL[] = [driveFilePaginationCondition(params)];

	if (params.userId) {
		conditions.push(eq(driveFile.userId, params.userId));
	} else {
		if (params.origin === 'local') {
			conditions.push(isNull(driveFile.userHost));
		} else if (params.origin === 'remote') {
			conditions.push(isNotNull(driveFile.userHost));
		}

		if (params.hostname) {
			conditions.push(eq(driveFile.userHost, params.hostname));
		}
	}

	if (params.type) {
		if (params.type.endsWith('/*')) {
			conditions.push(like(driveFile.type, `${params.type.replace('/*', '/')}%`));
		} else {
			conditions.push(eq(driveFile.type, params.type));
		}
	}

	const rows = await db
		.select()
		.from(driveFile)
		.where(and(...conditions))
		.orderBy(driveFilePaginationOrder(params))
		.limit(params.limit);

	return rows.map((row) => deserializeDriveFile(row));
}

export async function listDriveFileIdsExceedingUserCapacityFromDatabase(
	db: MiDrizzleDatabase,
	params: {
		userId: MiUser['id'];
		driveCapacity: number;
		avatarId: MiDriveFile['id'] | null;
		bannerId: MiDriveFile['id'] | null;
	},
): Promise<MiDriveFile['id'][]> {
	const rows = await db.execute<{ file_id: MiDriveFile['id']; acc_usage: string | number }>(sql`
		SELECT "id" AS "file_id",
			SUM("size") OVER (ORDER BY "id" DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS "acc_usage"
		FROM "drive_file"
		WHERE "userId" = ${params.userId}
			AND "isLink" = FALSE
			${params.avatarId == null ? sql`` : sql`AND "id" != ${params.avatarId}`}
			${params.bannerId == null ? sql`` : sql`AND "id" != ${params.bannerId}`}
		ORDER BY "id" ASC
	`);

	return rows.rows.filter((row) => Number(row.acc_usage) > params.driveCapacity).map((row) => row.file_id);
}

export async function updateDriveFileInDatabase(
	db: MiDrizzleDatabase,
	id: MiDriveFile['id'],
	values: DriveFileUpdate,
): Promise<void> {
	await db.update(driveFile).set(values).where(eq(driveFile.id, id));
}

export async function updateDriveFilesFolderByIdsAndUserIdInDatabase(
	db: MiDrizzleDatabase,
	ids: MiDriveFile['id'][],
	userId: NonNullable<MiDriveFile['userId']>,
	folderId: MiDriveFile['folderId'],
): Promise<void> {
	if (ids.length === 0) return;

	await db
		.update(driveFile)
		.set({ folderId })
		.where(and(inArray(driveFile.id, ids), eq(driveFile.userId, userId)));
}

export async function deleteDriveFileByIdInDatabase(db: MiDrizzleDatabase, id: MiDriveFile['id']): Promise<void> {
	await db.delete(driveFile).where(eq(driveFile.id, id));
}

async function countDriveFilesByUserHostFromDatabase(
	db: MiDrizzleDatabase,
	userHost: NonNullable<MiDriveFile['userHost']>,
): Promise<number> {
	const [row] = await db.select({ value: count() }).from(driveFile).where(eq(driveFile.userHost, userHost));

	return row?.value ?? 0;
}

export async function countDriveFilesByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiDriveFile['userId'],
): Promise<number> {
	const [row] = await db.select({ value: count() }).from(driveFile).where(eq(driveFile.userId, userId));

	return row?.value ?? 0;
}

export async function countDriveFilesByFolderIdFromDatabase(
	db: MiDrizzleDatabase,
	folderId: NonNullable<MiDriveFile['folderId']>,
): Promise<number> {
	const [row] = await db.select({ value: count() }).from(driveFile).where(eq(driveFile.folderId, folderId));

	return row?.value ?? 0;
}

export async function countDriveFilesGroupedByFolderIdsFromDatabase(
	db: MiDrizzleDatabase,
	folderIds: NonNullable<MiDriveFile['folderId']>[],
): Promise<{ folderId: NonNullable<MiDriveFile['folderId']>; count: number }[]> {
	if (folderIds.length === 0) return [];

	const rows = await db
		.select({
			folderId: driveFile.folderId,
			count: count(),
		})
		.from(driveFile)
		.where(inArray(driveFile.folderId, folderIds))
		.groupBy(driveFile.folderId);

	return rows
		.filter((row): row is { folderId: NonNullable<MiDriveFile['folderId']>; count: number } => row.folderId != null)
		.map((row) => ({ folderId: row.folderId, count: row.count }));
}

export async function countRemoteCachedDriveFilesFromDatabase(db: MiDrizzleDatabase): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(driveFile)
		.where(and(isNotNull(driveFile.userHost), eq(driveFile.isLink, false)));

	return row?.value ?? 0;
}

export async function listDriveFilesByUserIdWithPaginationFromDatabase(
	db: MiDrizzleDatabase,
	userId: NonNullable<MiDriveFile['userId']>,
	options: {
		limit: number;
		sinceId?: MiDriveFile['id'] | null;
	},
): Promise<MiDriveFile[]> {
	const conditions: SQL[] = [eq(driveFile.userId, userId)];

	if (options.sinceId) {
		conditions.push(gt(driveFile.id, options.sinceId));
	}

	const rows = await db
		.select()
		.from(driveFile)
		.where(and(...conditions))
		.orderBy(asc(driveFile.id))
		.limit(options.limit);

	return rows.map((row) => deserializeDriveFile(row));
}

export async function listRemoteCachedDriveFilesWithPaginationFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		limit: number;
		sinceId?: MiDriveFile['id'] | null;
	},
): Promise<MiDriveFile[]> {
	const conditions: SQL[] = [isNotNull(driveFile.userHost), eq(driveFile.isLink, false)];

	if (options.sinceId) {
		conditions.push(gt(driveFile.id, options.sinceId));
	}

	const rows = await db
		.select()
		.from(driveFile)
		.where(and(...conditions))
		.orderBy(asc(driveFile.id))
		.limit(options.limit);

	return rows.map((row) => deserializeDriveFile(row));
}

export async function sumDriveFileSizeByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiDriveFile['userId'],
): Promise<number> {
	const [row] = await db
		.select({ value: sum(driveFile.size) })
		.from(driveFile)
		.where(and(eq(driveFile.userId, userId), eq(driveFile.isLink, false)));

	return Number(row?.value ?? 0);
}

async function sumDriveFileSizeByUserHostFromDatabase(
	db: MiDrizzleDatabase,
	userHost: NonNullable<MiDriveFile['userHost']>,
): Promise<number> {
	const [row] = await db
		.select({ value: sum(driveFile.size) })
		.from(driveFile)
		.where(and(eq(driveFile.userHost, userHost), eq(driveFile.isLink, false)));

	return Number(row?.value ?? 0);
}

async function sumLocalDriveFileSizeFromDatabase(db: MiDrizzleDatabase): Promise<number> {
	const [row] = await db
		.select({ value: sum(driveFile.size) })
		.from(driveFile)
		.where(and(isNull(driveFile.userHost), eq(driveFile.isLink, false)));

	return Number(row?.value ?? 0);
}

async function sumRemoteDriveFileSizeFromDatabase(db: MiDrizzleDatabase): Promise<number> {
	const [row] = await db
		.select({ value: sum(driveFile.size) })
		.from(driveFile)
		.where(and(isNotNull(driveFile.userHost), eq(driveFile.isLink, false)));

	return Number(row?.value ?? 0);
}
