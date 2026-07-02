/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import { countDriveFilesByFolderIdFromDatabase, driveFileExistsByMd5AndUserIdFromDatabase } from '@/core/DriveFileStore.js';
import {
	countDriveFoldersByParentIdFromDatabase,
	createDriveFolderInDatabase,
	deleteDriveFolderByIdFromDatabase,
	fetchDriveFolderByIdAndUserIdFromDatabase,
	fetchDriveFolderByIdOrFailFromDatabase,
	listDriveFoldersByNameFromDatabase,
	listDriveFoldersByUserIdFromDatabase,
	resolveDriveFolderPagination,
	updateDriveFolderInDatabase,
} from '@/core/DriveFolderStore.js';
import type { DriveFolderRow } from '@/db/schema/drive-folder.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiLocalUser } from '@/models/User.js';
import type { HonoApiDriveStreamPublisher } from './hono-api-events.js';
import { HonoApiError } from './hono-api-error.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiDriveDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	publishDriveStream?: HonoApiDriveStreamPublisher;
};

type HonoApiPackedDriveFolder = Packed<'DriveFolder'>;

const driveFilesCheckExistenceParamDef = {
	type: 'object',
	properties: {
		md5: { type: 'string' },
	},
	required: ['md5'],
} as const;

type DriveFilesCheckExistenceParams = {
	md5: string;
};

const driveFoldersCreateParamDef = {
	type: 'object',
	properties: {
		name: { type: 'string', default: 'Untitled', maxLength: 200 },
		parentId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: [],
} as const;

type DriveFoldersCreateParams = {
	name: string;
	parentId?: string | null;
};

const driveFoldersParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		folderId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
	},
	required: [],
} as const;

type DriveFoldersParams = {
	limit: number;
	sinceId?: string | null;
	untilId?: string | null;
	sinceDate?: number | null;
	untilDate?: number | null;
	folderId: string | null;
};

const driveFoldersFindParamDef = {
	type: 'object',
	properties: {
		name: { type: 'string' },
		parentId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
	},
	required: ['name'],
} as const;

type DriveFoldersFindParams = {
	name: string;
	parentId: string | null;
};

const driveFoldersShowParamDef = {
	type: 'object',
	properties: {
		folderId: { type: 'string', format: 'misskey:id' },
	},
	required: ['folderId'],
} as const;

type DriveFoldersShowParams = {
	folderId: string;
};

const driveFoldersUpdateParamDef = {
	type: 'object',
	properties: {
		folderId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', maxLength: 200 },
		parentId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: ['folderId'],
} as const;

type DriveFoldersUpdateParams = {
	folderId: string;
	name?: string;
	parentId?: string | null;
};

const driveFoldersDeleteParamDef = {
	type: 'object',
	properties: {
		folderId: { type: 'string', format: 'misskey:id' },
	},
	required: ['folderId'],
} as const;

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

async function packDriveFolderForHonoApi(
	deps: HonoApiDriveDependencies,
	src: DriveFolderRow['id'] | DriveFolderRow,
	options?: {
		detail: boolean;
	},
): Promise<HonoApiPackedDriveFolder> {
	const opts = Object.assign({
		detail: false,
	}, options);
	const folder = typeof src === 'object'
		? src
		: await fetchDriveFolderByIdOrFailFromDatabase(deps.db, src);

	const packed: HonoApiPackedDriveFolder = {
		id: folder.id,
		createdAt: parseId(deps.config, folder.id).date.toISOString(),
		name: folder.name,
		parentId: folder.parentId,
	};

	if (!opts.detail) return packed;

	const [foldersCount, filesCount, parent] = await Promise.all([
		countDriveFoldersByParentIdFromDatabase(deps.db, folder.id),
		countDriveFilesByFolderIdFromDatabase(deps.db, folder.id),
		folder.parentId == null ? Promise.resolve(undefined) : packDriveFolderForHonoApi(deps, folder.parentId, { detail: true }),
	]);

	return {
		...packed,
		foldersCount,
		filesCount,
		...(parent == null ? {} : { parent }),
	};
}

export async function handleHonoApiDriveFilesCheckExistence(
	deps: HonoApiDriveDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<boolean> {
	const params = parseHonoApiParams(driveFilesCheckExistenceParamDef, body) as DriveFilesCheckExistenceParams;
	return await driveFileExistsByMd5AndUserIdFromDatabase(deps.db, params.md5, me.id);
}

export async function handleHonoApiDriveFoldersCreate(
	deps: HonoApiDriveDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiPackedDriveFolder> {
	const params = parseHonoApiParams(driveFoldersCreateParamDef, body) as DriveFoldersCreateParams;
	let parent: DriveFolderRow | null = null;

	if (params.parentId) {
		parent = await fetchDriveFolderByIdAndUserIdFromDatabase(deps.db, params.parentId, me.id);

		if (parent == null) {
			throw driveFoldersCreateNoSuchFolderError();
		}
	}

	const folder = await createDriveFolderInDatabase(deps.db, {
		id: genId(deps.config),
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
	const params = parseHonoApiParams(driveFoldersParamDef, body) as DriveFoldersParams;
	const pagination = resolveDriveFolderPagination({
		gen: (time?: number) => genId(deps.config, time),
	}, params);
	const folders = await listDriveFoldersByUserIdFromDatabase(deps.db, me.id, {
		limit: params.limit,
		parentId: params.folderId ?? null,
		...pagination,
	});

	return await Promise.all(folders.map(folder => packDriveFolderForHonoApi(deps, folder)));
}

export async function handleHonoApiDriveFoldersFind(
	deps: HonoApiDriveDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiPackedDriveFolder[]> {
	const params = parseHonoApiParams(driveFoldersFindParamDef, body) as DriveFoldersFindParams;
	const folders = await listDriveFoldersByNameFromDatabase(deps.db, {
		name: params.name,
		userId: me.id,
		parentId: params.parentId ?? null,
	});

	return await Promise.all(folders.map(folder => packDriveFolderForHonoApi(deps, folder)));
}

export async function handleHonoApiDriveFoldersShow(
	deps: HonoApiDriveDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<HonoApiPackedDriveFolder> {
	const params = parseHonoApiParams(driveFoldersShowParamDef, body) as DriveFoldersShowParams;
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
	for (let currentParentId = parentId; currentParentId != null;) {
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
	const params = parseHonoApiParams(driveFoldersUpdateParamDef, body) as DriveFoldersUpdateParams;
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
	const params = parseHonoApiParams(driveFoldersDeleteParamDef, body) as DriveFoldersDeleteParams;
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
