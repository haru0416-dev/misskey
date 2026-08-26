/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import type { Config } from '@/config.js';
import {
	countDriveFilesByFolderIdFromDatabase,
	countDriveFilesGroupedByFolderIdsFromDatabase,
	driveFileExistsByMd5AndUserIdFromDatabase,
	sumDriveFileSizeByUserIdFromDatabase,
} from '@/core/drive/DriveFileStore.js';
import {
	countChildDriveFoldersGroupedByParentIdsFromDatabase,
	countDriveFoldersByParentIdFromDatabase,
	createDriveFolderInDatabase,
	deleteDriveFolderByIdFromDatabase,
	fetchDriveFolderByIdAndUserIdFromDatabase,
	fetchDriveFolderByIdOrFailFromDatabase,
	listDriveFoldersByIdsFromDatabase,
	listDriveFoldersByNameFromDatabase,
	listDriveFoldersByUserIdFromDatabase,
	resolveDriveFolderPagination,
	updateDriveFolderInDatabase,
} from '@/core/drive/DriveFolderStore.js';
import type { DriveFolderRow } from '@/db/schema/drive-folder.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiLocalUser } from '@/models/User.js';
import type { HonoApiDriveStreamPublisher } from './events.js';
import { HonoApiError } from './error.js';
import { getHonoApiRolePolicies, type HonoApiRolePolicyDependencies } from './role-policy.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiDriveDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	publishDriveStream?: HonoApiDriveStreamPublisher;
};

export type HonoApiPackedDriveFolder = Packed<'DriveFolder'>;

export const driveFilesCheckExistenceParamDef = z.object({
	md5: z.string(),
});

type DriveFilesCheckExistenceParams = {
	md5: string;
};

export const driveFoldersCreateParamDef = z.object({
	name: z.string().max(200).default('Untitled'),
	parentId: misskeyId().nullable().optional(),
});

type DriveFoldersCreateParams = {
	name: string;
	parentId?: string | null;
};

export const driveFoldersParamDef = z.object({
	limit: z.number().int().min(1).max(100).default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	folderId: misskeyId().nullable().default(null),
});

type DriveFoldersParams = {
	limit: number;
	sinceId?: string | null;
	untilId?: string | null;
	sinceDate?: number | null;
	untilDate?: number | null;
	folderId: string | null;
};

export const driveFoldersFindParamDef = z.object({
	name: z.string(),
	parentId: misskeyId().nullable().default(null),
});

type DriveFoldersFindParams = {
	name: string;
	parentId: string | null;
};

export const driveFoldersShowParamDef = z.object({
	folderId: misskeyId(),
});

type DriveFoldersShowParams = {
	folderId: string;
};

export const driveFoldersUpdateParamDef = z.object({
	folderId: misskeyId(),
	name: z.string().max(200).optional(),
	parentId: misskeyId().nullable().optional(),
});

type DriveFoldersUpdateParams = {
	folderId: string;
	name?: string;
	parentId?: string | null;
};

export const driveFoldersDeleteParamDef = z.object({
	folderId: misskeyId(),
});

type DriveFoldersDeleteParams = {
	folderId: string;
};

function driveFoldersCreateNoSuchFolderError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such folder.',
		code: 'NO_SUCH_FOLDER',
		id: '53326628-a00d-40a6-a3cd-8975105c0f95',
	});
}

function driveFoldersShowNoSuchFolderError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such folder.',
		code: 'NO_SUCH_FOLDER',
		id: 'd74ab9eb-bb09-4bba-bf24-fb58f761e1e9',
	});
}

function driveFoldersUpdateNoSuchFolderError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such folder.',
		code: 'NO_SUCH_FOLDER',
		id: 'f7974dac-2c0d-4a27-926e-23583b28e98e',
	});
}

function driveFoldersUpdateNoSuchParentFolderError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such parent folder.',
		code: 'NO_SUCH_PARENT_FOLDER',
		id: 'ce104e3a-faaf-49d5-b459-10ff0cbbcaa1',
	});
}

function driveFoldersUpdateRecursiveNestingError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'It can not be structured like nesting folders recursively.',
		code: 'RECURSIVE_NESTING',
		id: 'dbeb024837894013aed44279f9199740',
	});
}

function driveFoldersDeleteNoSuchFolderError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such folder.',
		code: 'NO_SUCH_FOLDER',
		id: '1069098f-c281-440f-b085-f9932edbe091',
	});
}

function driveFoldersDeleteHasChildrenError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'This folder has child files or folders.',
		code: 'HAS_CHILD_FILES_OR_FOLDERS',
		id: 'b0fc8a17-963c-405d-bfbc-859a487295e1',
	});
}

function packDriveFolderBaseForHonoApi(folder: DriveFolderRow): HonoApiPackedDriveFolder {
	return {
		id: folder.id,
		createdAt: parseId(folder.id).date.toISOString(),
		name: folder.name,
		parentId: folder.parentId,
	};
}

async function resolveDriveFoldersForHonoApi(
	deps: HonoApiDriveDependencies,
	srcs: (DriveFolderRow['id'] | DriveFolderRow)[],
): Promise<DriveFolderRow[]> {
	const folderById = new Map<DriveFolderRow['id'], DriveFolderRow>();
	const ids: DriveFolderRow['id'][] = [];

	for (const src of srcs) {
		if (typeof src === 'object') {
			folderById.set(src.id, src);
		} else if (!folderById.has(src)) {
			ids.push(src);
		}
	}

	for (const folder of await listDriveFoldersByIdsFromDatabase(deps.db, [...new Set(ids)])) {
		folderById.set(folder.id, folder);
	}

	return await Promise.all(
		srcs.map(async (src) => {
			if (typeof src === 'object') return src;
			return folderById.get(src) ?? (await fetchDriveFolderByIdOrFailFromDatabase(deps.db, src));
		}),
	);
}

export async function packDriveFolderForHonoApi(
	deps: HonoApiDriveDependencies,
	src: DriveFolderRow['id'] | DriveFolderRow,
	options?: {
		detail: boolean;
	},
): Promise<HonoApiPackedDriveFolder> {
	const opts = Object.assign(
		{
			detail: false,
		},
		options,
	);
	const folder = typeof src === 'object' ? src : await fetchDriveFolderByIdOrFailFromDatabase(deps.db, src);

	const packed = packDriveFolderBaseForHonoApi(folder);

	if (!opts.detail) return packed;

	const [foldersCount, filesCount, parent] = await Promise.all([
		countDriveFoldersByParentIdFromDatabase(deps.db, folder.id),
		countDriveFilesByFolderIdFromDatabase(deps.db, folder.id),
		folder.parentId == null
			? Promise.resolve(undefined)
			: packDriveFolderForHonoApi(deps, folder.parentId, { detail: true }),
	]);

	return {
		...packed,
		foldersCount,
		filesCount,
		...(parent == null ? {} : { parent }),
	};
}

export async function packDriveFoldersManyForHonoApi(
	deps: HonoApiDriveDependencies,
	srcs: (DriveFolderRow['id'] | DriveFolderRow)[],
	options?: {
		detail: boolean;
	},
): Promise<HonoApiPackedDriveFolder[]> {
	const opts = Object.assign(
		{
			detail: false,
		},
		options,
	);
	const folders = await resolveDriveFoldersForHonoApi(deps, srcs);

	if (!opts.detail) {
		return folders.map((folder) => packDriveFolderBaseForHonoApi(folder));
	}

	const folderIds = [...new Set(folders.map((folder) => folder.id))];
	const parentIds = [
		...new Set(folders.map((folder) => folder.parentId).filter((id): id is DriveFolderRow['id'] => id != null)),
	];
	const [folderCounts, fileCounts, parents] = await Promise.all([
		countChildDriveFoldersGroupedByParentIdsFromDatabase(deps.db, folderIds),
		countDriveFilesGroupedByFolderIdsFromDatabase(deps.db, folderIds),
		parentIds.length === 0 ? Promise.resolve([]) : packDriveFoldersManyForHonoApi(deps, parentIds, { detail: true }),
	]);
	const folderCountById = new Map(folderCounts.map((row) => [row.parentId, row.count]));
	const fileCountById = new Map(fileCounts.map((row) => [row.folderId, row.count]));
	const parentById = new Map(parents.map((parent) => [parent.id, parent]));

	return folders.map((folder) => {
		const packed = packDriveFolderBaseForHonoApi(folder);
		const parent = folder.parentId == null ? null : parentById.get(folder.parentId);

		return {
			...packed,
			foldersCount: folderCountById.get(folder.id) ?? 0,
			filesCount: fileCountById.get(folder.id) ?? 0,
			...(parent == null ? {} : { parent }),
		};
	});
}

export async function handleHonoApiDriveFilesCheckExistence(
	deps: HonoApiDriveDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<boolean> {
	const params = parseHonoApiParams(driveFilesCheckExistenceParamDef, body);
	return await driveFileExistsByMd5AndUserIdFromDatabase(deps.db, params.md5, me.id);
}

export async function handleHonoApiDriveFoldersCreate(
	deps: HonoApiDriveDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiPackedDriveFolder> {
	const params = parseHonoApiParams(driveFoldersCreateParamDef, body);
	let parent: DriveFolderRow | null = null;

	if (params.parentId) {
		parent = await fetchDriveFolderByIdAndUserIdFromDatabase(deps.db, params.parentId, me.id);

		if (parent == null) {
			throw driveFoldersCreateNoSuchFolderError();
		}
	}

	const folder = await createDriveFolderInDatabase(deps.db, {
		id: genId(),
		name: params.name,
		parentId: parent?.id ?? null,
		userId: me.id,
	});

	const packed = await packDriveFolderForHonoApi(deps, folder);
	deps.publishDriveStream?.(me.id, 'folderCreated', packed);

	return packed;
}

export async function handleHonoApiDriveFolders(
	deps: HonoApiDriveDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiPackedDriveFolder[]> {
	const params = parseHonoApiParams(driveFoldersParamDef, body);
	const pagination = resolveDriveFolderPagination(
		{
			gen: (time?: number) => genId(time),
		},
		params,
	);
	const folders = await listDriveFoldersByUserIdFromDatabase(deps.db, me.id, {
		limit: params.limit,
		parentId: params.folderId ?? null,
		...pagination,
	});

	return await packDriveFoldersManyForHonoApi(deps, folders);
}

export async function handleHonoApiDriveFoldersFind(
	deps: HonoApiDriveDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiPackedDriveFolder[]> {
	const params = parseHonoApiParams(driveFoldersFindParamDef, body);
	const folders = await listDriveFoldersByNameFromDatabase(deps.db, {
		name: params.name,
		userId: me.id,
		parentId: params.parentId ?? null,
	});

	return await packDriveFoldersManyForHonoApi(deps, folders);
}

export async function handleHonoApiDriveFoldersShow(
	deps: HonoApiDriveDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiPackedDriveFolder> {
	const params = parseHonoApiParams(driveFoldersShowParamDef, body);
	const folder = await fetchDriveFolderByIdAndUserIdFromDatabase(deps.db, params.folderId, me.id);

	if (folder == null) {
		throw driveFoldersShowNoSuchFolderError();
	}

	return await packDriveFolderForHonoApi(deps, folder, {
		detail: true,
	});
}

async function driveFolderWillNestRecursively(
	deps: HonoApiDriveDependencies,
	targetFolderId: string,
	parentId: string | null,
): Promise<boolean> {
	for (let currentParentId = parentId; currentParentId != null; ) {
		const parent = await fetchDriveFolderByIdOrFailFromDatabase(deps.db, currentParentId);

		if (parent.id === targetFolderId) {
			return true;
		}

		currentParentId = parent.parentId;
	}

	return false;
}

export async function handleHonoApiDriveFoldersUpdate(
	deps: HonoApiDriveDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiPackedDriveFolder> {
	const params = parseHonoApiParams(driveFoldersUpdateParamDef, body);
	const folder = await fetchDriveFolderByIdAndUserIdFromDatabase(deps.db, params.folderId, me.id);

	if (folder == null) {
		throw driveFoldersUpdateNoSuchFolderError();
	}

	const nextFolder = {
		...folder,
	};

	if (params.name) {
		nextFolder.name = params.name;
	}

	if (params.parentId !== undefined) {
		if (params.parentId === folder.id) {
			throw driveFoldersUpdateRecursiveNestingError();
		} else if (params.parentId === null) {
			nextFolder.parentId = null;
		} else {
			const parent = await fetchDriveFolderByIdAndUserIdFromDatabase(deps.db, params.parentId, me.id);

			if (parent == null) {
				throw driveFoldersUpdateNoSuchParentFolderError();
			}

			if (await driveFolderWillNestRecursively(deps, folder.id, parent.parentId)) {
				throw driveFoldersUpdateRecursiveNestingError();
			}

			nextFolder.parentId = parent.id;
		}
	}

	await updateDriveFolderInDatabase(deps.db, nextFolder.id, {
		name: nextFolder.name,
		parentId: nextFolder.parentId,
	});

	const packed = await packDriveFolderForHonoApi(deps, nextFolder);
	deps.publishDriveStream?.(me.id, 'folderUpdated', packed);

	return packed;
}

export async function handleHonoApiDriveFoldersDelete(
	deps: HonoApiDriveDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(driveFoldersDeleteParamDef, body);
	const folder = await fetchDriveFolderByIdAndUserIdFromDatabase(deps.db, params.folderId, me.id);

	if (folder == null) {
		throw driveFoldersDeleteNoSuchFolderError();
	}

	const [childFoldersCount, childFilesCount] = await Promise.all([
		countDriveFoldersByParentIdFromDatabase(deps.db, folder.id),
		countDriveFilesByFolderIdFromDatabase(deps.db, folder.id),
	]);

	if (childFoldersCount !== 0 || childFilesCount !== 0) {
		throw driveFoldersDeleteHasChildrenError();
	}

	await deleteDriveFolderByIdFromDatabase(deps.db, folder.id);
	deps.publishDriveStream?.(me.id, 'folderDeleted', folder.id);
}

export async function handleHonoApiDrive(
	deps: HonoApiDriveDependencies & HonoApiRolePolicyDependencies,
	me: MiLocalUser,
): Promise<{ capacity: number; usage: number }> {
	const usage = await sumDriveFileSizeByUserIdFromDatabase(deps.db, me.id);
	const policies = await getHonoApiRolePolicies(deps, me);

	return {
		capacity: 1024 * 1024 * policies.driveCapacityMb,
		usage,
	};
}
