/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { endpointMetas as driveContracts } from '@/server/rest/contracts/drive.js';
import type { ContractErrors } from '../endpoint-contract.js';
import type { ApiParams } from '../validation.js';
import { z } from 'zod';
import {
	countDriveFilesByFolderIdFromDatabase,
	driveFileExistsByMd5AndUserIdFromDatabase,
	sumDriveFileSizeByUserIdFromDatabase,
} from '@/core/drive/DriveFileStore.js';
import {
	countDriveFoldersByParentIdFromDatabase,
	createDriveFolderInDatabase,
	deleteDriveFolderByIdFromDatabase,
	fetchDriveFolderByIdAndUserIdFromDatabase,
	listDriveFoldersByNameFromDatabase,
	listDriveFoldersByUserIdFromDatabase,
	moveDriveFolderInDatabase,
	updateDriveFolderInDatabase,
} from '@/core/drive/DriveFolderStore.js';
import type { DriveFolderRow } from '@/db/schema/drive-folder.js';
import { genId } from '@/misc/id/gen-id.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiLocalUser } from '@/models/User.js';
import { getRolePolicies } from '../../../core/role/role-policy.js';
import type { RolePolicyDependencies } from '../../../core/role/role-policy.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import type { DriveDependencies, PackedDriveFolder } from '@/core/drive/drive-folder-packing.js';
import { packDriveFolder, packDriveFoldersMany } from '@/core/drive/drive-folder-packing.js';

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

export async function handleApiDriveFilesCheckExistence(
	deps: DriveDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof driveFilesCheckExistenceParamDef>,
): Promise<boolean> {
	return await driveFileExistsByMd5AndUserIdFromDatabase(deps.db, params.md5, me.id);
}

export async function handleApiDriveFoldersCreate(
	deps: DriveDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof driveFoldersCreateParamDef>,
	errors: ContractErrors<(typeof driveContracts)['drive/folders/create']>,
): Promise<PackedDriveFolder> {
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

	const packed = await packDriveFolder(deps, folder);
	deps.publishDriveStream?.(me.id, 'folderCreated', packed);

	return packed;
}

export async function handleApiDriveFolders(
	deps: DriveDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof driveFoldersParamDef>,
): Promise<PackedDriveFolder[]> {
	const pagination = resolveDateIdPagination({ gen: genId }, params);
	const folders = await listDriveFoldersByUserIdFromDatabase(deps.db, me.id, {
		limit: params.limit,
		parentId: params.folderId ?? null,
		...pagination,
	});

	return await packDriveFoldersMany(deps, folders);
}

export async function handleApiDriveFoldersFind(
	deps: DriveDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof driveFoldersFindParamDef>,
): Promise<PackedDriveFolder[]> {
	const folders = await listDriveFoldersByNameFromDatabase(deps.db, {
		name: params.name,
		userId: me.id,
		parentId: params.parentId ?? null,
	});

	return await packDriveFoldersMany(deps, folders);
}

export async function handleApiDriveFoldersShow(
	deps: DriveDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof driveFoldersShowParamDef>,
	errors: ContractErrors<(typeof driveContracts)['drive/folders/show']>,
): Promise<PackedDriveFolder> {
	const folder = await fetchDriveFolderByIdAndUserIdFromDatabase(deps.db, params.folderId, me.id);

	if (folder == null) {
		throw errors.noSuchFolder();
	}

	return await packDriveFolder(deps, folder, {
		detail: true,
	});
}

export async function handleApiDriveFoldersUpdate(
	deps: DriveDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof driveFoldersUpdateParamDef>,
	errors: ContractErrors<(typeof driveContracts)['drive/folders/update']>,
): Promise<PackedDriveFolder> {
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

	const packed = await packDriveFolder(deps, nextFolder);
	deps.publishDriveStream?.(me.id, 'folderUpdated', packed);

	return packed;
}

export async function handleApiDriveFoldersDelete(
	deps: DriveDependencies,
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
	deps: DriveDependencies & RolePolicyDependencies,
	me: MiLocalUser,
): Promise<{ capacity: number; usage: number }> {
	const usage = await sumDriveFileSizeByUserIdFromDatabase(deps.db, me.id);
	const policies = await getRolePolicies(deps, me);

	return {
		capacity: 1024 * 1024 * policies.driveCapacityMb,
		usage,
	};
}
