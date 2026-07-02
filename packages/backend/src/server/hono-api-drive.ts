/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import { countDriveFilesByFolderIdFromDatabase, driveFileExistsByMd5AndUserIdFromDatabase } from '@/core/DriveFileStore.js';
import {
	countDriveFoldersByParentIdFromDatabase,
	fetchDriveFolderByIdAndUserIdFromDatabase,
	fetchDriveFolderByIdOrFailFromDatabase,
	listDriveFoldersByNameFromDatabase,
	listDriveFoldersByUserIdFromDatabase,
	resolveDriveFolderPagination,
} from '@/core/DriveFolderStore.js';
import type { DriveFolderRow } from '@/db/schema/drive-folder.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { MiLocalUser } from '@/models/User.js';
import { HonoApiError } from './hono-api-error.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiDriveDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
};

type HonoApiPackedDriveFolder = {
	id: string;
	createdAt: string;
	name: string;
	parentId: string | null;
	foldersCount?: number;
	filesCount?: number;
	parent?: HonoApiPackedDriveFolder;
};

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
		throw new HonoApiError({
			status: 400,
			message: 'No such folder.',
			code: 'NO_SUCH_FOLDER',
			id: 'd74ab9eb-bb09-4bba-bf24-fb58f761e1e9',
		});
	}

	return await packDriveFolderForHonoApi(deps, folder, {
		detail: true,
	});
}
