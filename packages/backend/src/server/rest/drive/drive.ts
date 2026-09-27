/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { endpointMetas as driveContracts } from '@/server/api/metas/drive.js';
import type { ContractErrors } from '../endpoint-contract.js';
import type { ApiParams } from '../validation.js';
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
	moveDriveFolderInDatabase,
	updateDriveFolderInDatabase,
} from '@/core/drive/DriveFolderStore.js';
import type { DriveFolderRow } from '@/db/schema/drive-folder.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiLocalUser } from '@/models/User.js';
import type { ApiDriveStreamPublisher } from '../events.js';
import { ApiError } from '../error.js';
import { getApiRolePolicies } from '../role/role-policy.js';
import type { ApiRolePolicyDependencies } from '../role/role-policy.js';
import { parseApiParams } from '../validation.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';

export type ApiDriveDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	publishDriveStream?: ApiDriveStreamPublisher;
};

export type ApiPackedDriveFolder = Packed<'DriveFolder'>;

export const driveFilesCheckExistenceParamDef = z.object({
	md5: z.string(),
});

export const driveFoldersCreateParamDef = z.object({
	name: z.string().max(200).default('Untitled'),
	parentId: misskeyId().nullable().optional(),
});

export const driveFoldersParamDef = z.object({
	limit: z.int().min(1).max(100).default(10),
	...paginationParams,
	folderId: misskeyId().nullable().default(null),
});

export const driveFoldersFindParamDef = z.object({
	name: z.string(),
	parentId: misskeyId().nullable().default(null),
});

export const driveFoldersShowParamDef = z.object({
	folderId: misskeyId(),
});

export const driveFoldersUpdateParamDef = z.object({
	folderId: misskeyId(),
	name: z.string().max(200).optional(),
	parentId: misskeyId().nullable().optional(),
});

export const driveFoldersDeleteParamDef = z.object({
	folderId: misskeyId(),
});

function packDriveFolderBaseForApi(folder: DriveFolderRow): ApiPackedDriveFolder {
	return {
		id: folder.id,
		createdAt: parseId(folder.id).date.toISOString(),
		name: folder.name,
		parentId: folder.parentId,
	};
}

async function resolveDriveFoldersForApi(
	deps: ApiDriveDependencies,
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
			if (typeof src === 'object') {
				return src;
			}
			return folderById.get(src) ?? (await fetchDriveFolderByIdOrFailFromDatabase(deps.db, src));
		}),
	);
}

export async function packDriveFolderForApi(
	deps: ApiDriveDependencies,
	src: DriveFolderRow['id'] | DriveFolderRow,
	options?: {
		detail: boolean;
	},
	/** detail で親をたどるときに通ったフォルダ。既存の循環に行き当たったらそこで親の展開をやめる。 */
	descendantIds: ReadonlySet<DriveFolderRow['id']> = new Set(),
): Promise<ApiPackedDriveFolder> {
	const opts = {
		detail: false,
		...options,
	};
	const folder = typeof src === 'object' ? src : await fetchDriveFolderByIdOrFailFromDatabase(deps.db, src);

	const packed = packDriveFolderBaseForApi(folder);

	if (!opts.detail) {
		return packed;
	}

	const [foldersCount, filesCount, parent] = await Promise.all([
		countDriveFoldersByParentIdFromDatabase(deps.db, folder.id),
		countDriveFilesByFolderIdFromDatabase(deps.db, folder.id),
		folder.parentId == null || folder.parentId === folder.id || descendantIds.has(folder.parentId)
			? Promise.resolve(undefined)
			: packDriveFolderForApi(deps, folder.parentId, { detail: true }, new Set([...descendantIds, folder.id])),
	]);

	return {
		...packed,
		foldersCount,
		filesCount,
		...(parent == null ? {} : { parent }),
	};
}

export async function packDriveFoldersManyForApi(
	deps: ApiDriveDependencies,
	srcs: (DriveFolderRow['id'] | DriveFolderRow)[],
	options?: {
		detail: boolean;
	},
): Promise<ApiPackedDriveFolder[]> {
	const opts = {
		detail: false,
		...options,
	};
	const folders = await resolveDriveFoldersForApi(deps, srcs);

	if (!opts.detail) {
		return folders.map((folder) => packDriveFolderBaseForApi(folder));
	}

	// 祖先を階層ごとにまとめて読む。読んだ行は覚えておくので、既存の循環があっても読み込みは終わる。
	const folderById = new Map(folders.map((folder) => [folder.id, folder]));
	for (
		let missing = [...new Set(folders.map((folder) => folder.parentId))].filter(
			(id): id is DriveFolderRow['id'] => id != null && !folderById.has(id),
		);
		missing.length > 0;
	) {
		const parents = await listDriveFoldersByIdsFromDatabase(deps.db, missing);
		for (const parent of parents) {
			folderById.set(parent.id, parent);
		}
		missing = [...new Set(parents.map((parent) => parent.parentId))].filter(
			(id): id is DriveFolderRow['id'] => id != null && !folderById.has(id),
		);
	}

	const folderIds = [...folderById.keys()];
	const [folderCounts, fileCounts] = await Promise.all([
		countChildDriveFoldersGroupedByParentIdsFromDatabase(deps.db, folderIds),
		countDriveFilesGroupedByFolderIdsFromDatabase(deps.db, folderIds),
	]);
	const folderCountById = new Map(folderCounts.map((row) => [row.parentId, row.count]));
	const fileCountById = new Map(fileCounts.map((row) => [row.folderId, row.count]));

	// descendantIds はそのフォルダから下へたどってきた経路。親がその中にあれば循環なので、そこで展開をやめる。
	const build = (folder: DriveFolderRow, descendantIds: ReadonlySet<DriveFolderRow['id']>): ApiPackedDriveFolder => {
		const parentRow =
			folder.parentId == null || folder.parentId === folder.id || descendantIds.has(folder.parentId)
				? undefined
				: folderById.get(folder.parentId);
		const parent = parentRow == null ? undefined : build(parentRow, new Set([...descendantIds, folder.id]));

		return {
			...packDriveFolderBaseForApi(folder),
			foldersCount: folderCountById.get(folder.id) ?? 0,
			filesCount: fileCountById.get(folder.id) ?? 0,
			...(parent == null ? {} : { parent }),
		};
	};

	return folders.map((folder) => build(folder, new Set()));
}

export async function handleApiDriveFilesCheckExistence(
	deps: ApiDriveDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof driveFilesCheckExistenceParamDef>,
): Promise<boolean> {
	return await driveFileExistsByMd5AndUserIdFromDatabase(deps.db, params.md5, me.id);
}

export async function handleApiDriveFoldersCreate(
	deps: ApiDriveDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof driveFoldersCreateParamDef>,
	errors: ContractErrors<(typeof driveContracts)['drive/folders/create']>,
): Promise<ApiPackedDriveFolder> {
	let parent: DriveFolderRow | null = null;

	if (params.parentId) {
		parent = await fetchDriveFolderByIdAndUserIdFromDatabase(deps.db, params.parentId, me.id);

		if (parent == null) {
			throw errors.noSuchFolder();
		}
	}

	const folder = await createDriveFolderInDatabase(deps.db, {
		id: genId(),
		name: params.name,
		parentId: parent?.id ?? null,
		userId: me.id,
	});

	const packed = await packDriveFolderForApi(deps, folder);
	deps.publishDriveStream?.(me.id, 'folderCreated', packed);

	return packed;
}

export async function handleApiDriveFolders(
	deps: ApiDriveDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof driveFoldersParamDef>,
): Promise<ApiPackedDriveFolder[]> {
	const pagination = resolveDateIdPagination({ gen: genId }, params);
	const folders = await listDriveFoldersByUserIdFromDatabase(deps.db, me.id, {
		limit: params.limit,
		parentId: params.folderId ?? null,
		...pagination,
	});

	return await packDriveFoldersManyForApi(deps, folders);
}

export async function handleApiDriveFoldersFind(
	deps: ApiDriveDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof driveFoldersFindParamDef>,
): Promise<ApiPackedDriveFolder[]> {
	const folders = await listDriveFoldersByNameFromDatabase(deps.db, {
		name: params.name,
		userId: me.id,
		parentId: params.parentId ?? null,
	});

	return await packDriveFoldersManyForApi(deps, folders);
}

export async function handleApiDriveFoldersShow(
	deps: ApiDriveDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof driveFoldersShowParamDef>,
	errors: ContractErrors<(typeof driveContracts)['drive/folders/show']>,
): Promise<ApiPackedDriveFolder> {
	const folder = await fetchDriveFolderByIdAndUserIdFromDatabase(deps.db, params.folderId, me.id);

	if (folder == null) {
		throw errors.noSuchFolder();
	}

	return await packDriveFolderForApi(deps, folder, {
		detail: true,
	});
}

export async function handleApiDriveFoldersUpdate(
	deps: ApiDriveDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof driveFoldersUpdateParamDef>,
	errors: ContractErrors<(typeof driveContracts)['drive/folders/update']>,
): Promise<ApiPackedDriveFolder> {
	const folder = await fetchDriveFolderByIdAndUserIdFromDatabase(deps.db, params.folderId, me.id);

	if (folder == null) {
		throw errors.noSuchFolder();
	}

	const nextFolder = {
		...folder,
	};

	if (params.name) {
		nextFolder.name = params.name;
	}

	if (params.parentId != null) {
		const parent = await fetchDriveFolderByIdAndUserIdFromDatabase(deps.db, params.parentId, me.id);

		if (parent == null) {
			throw errors.noSuchParentFolder();
		}

		nextFolder.parentId = parent.id;
		if (!(await moveDriveFolderInDatabase(deps.db, me.id, folder.id, { name: nextFolder.name, parentId: parent.id }))) {
			throw errors.recursiveNesting();
		}
	} else {
		if (params.parentId === null) {
			nextFolder.parentId = null;
		}

		await updateDriveFolderInDatabase(deps.db, nextFolder.id, {
			name: nextFolder.name,
			parentId: nextFolder.parentId,
		});
	}

	const packed = await packDriveFolderForApi(deps, nextFolder);
	deps.publishDriveStream?.(me.id, 'folderUpdated', packed);

	return packed;
}

export async function handleApiDriveFoldersDelete(
	deps: ApiDriveDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof driveFoldersDeleteParamDef>,
	errors: ContractErrors<(typeof driveContracts)['drive/folders/delete']>,
): Promise<void> {
	const folder = await fetchDriveFolderByIdAndUserIdFromDatabase(deps.db, params.folderId, me.id);

	if (folder == null) {
		throw errors.noSuchFolder();
	}

	const [childFoldersCount, childFilesCount] = await Promise.all([
		countDriveFoldersByParentIdFromDatabase(deps.db, folder.id),
		countDriveFilesByFolderIdFromDatabase(deps.db, folder.id),
	]);

	if (childFoldersCount !== 0 || childFilesCount !== 0) {
		throw errors.hasChildFilesOrFolders();
	}

	await deleteDriveFolderByIdFromDatabase(deps.db, folder.id);
	deps.publishDriveStream?.(me.id, 'folderDeleted', folder.id);
}

export async function handleApiDrive(
	deps: ApiDriveDependencies & ApiRolePolicyDependencies,
	me: MiLocalUser,
): Promise<{ capacity: number; usage: number }> {
	const usage = await sumDriveFileSizeByUserIdFromDatabase(deps.db, me.id);
	const policies = await getApiRolePolicies(deps, me);

	return {
		capacity: 1024 * 1024 * policies.driveCapacityMb,
		usage,
	};
}
