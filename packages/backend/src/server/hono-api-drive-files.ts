/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { startDriveFileDeletion, type DriveFileDeletionDependencies } from '@/core/DriveFileDeletionLogic.js';
import {
	fetchDriveFileByIdFromDatabase,
	fetchDriveFileByUrlFromDatabase,
	listDriveFilesByMd5AndUserIdFromDatabase,
	listDriveFilesByNameUserIdAndFolderIdFromDatabase,
	listDriveFilesForUserFromDatabase,
	updateDriveFileInDatabase,
	updateDriveFilesFolderByIdsAndUserIdInDatabase,
	type DriveFileUpdate,
} from '@/core/DriveFileStore.js';
import { fetchDriveFolderByIdAndUserIdFromDatabase, fetchDriveFolderByIdAndUserIdOrFailFromDatabase } from '@/core/DriveFolderStore.js';
import type { InternalStorageService } from '@/core/InternalStorageService.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import { listNotesByAttachedFileIdFromDatabase } from '@/core/NoteStore.js';
import type { ObjectStorageQueue } from '@/core/QueueModule.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiLocalUser } from '@/models/User.js';
import { HonoApiError } from './hono-api-error.js';
import { packDriveFileManyForHonoApi, packDriveFileOrFailForHonoApi, type HonoApiDriveFileDependencies } from './hono-api-drive-file.js';
import { packNoteManyForHonoApi, type HonoApiNoteDependencies } from './hono-api-note.js';
import { getHonoApiRolePolicies, isHonoApiModerator, type HonoApiRolePolicyDependencies } from './hono-api-role-policy.js';
import type { HonoChartWriters } from './hono-chart-runtime.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiDriveFilesDependencies = HonoApiNoteDependencies & HonoApiDriveFileDependencies & HonoApiRolePolicyDependencies & {
	objectStorageQueue: ObjectStorageQueue;
	internalStorageService: Pick<InternalStorageService, 'del'>;
	chartWriters: HonoChartWriters;
};

function noSuchFileError(id: string): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such file.', code: 'NO_SUCH_FILE', id });
}

function accessDeniedError(id: string): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Access denied.', code: 'ACCESS_DENIED', id });
}

const driveFilesParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		folderId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		type: { type: 'string', nullable: true, pattern: '^[a-zA-Z/\\-*]+$' },
		sort: { type: 'string', nullable: true, enum: ['+createdAt', '-createdAt', '+name', '-name', '+size', '-size', null] },
	},
	required: [],
} as const;

type DriveFilesParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	folderId?: string | null;
	type?: string | null;
	sort?: '+createdAt' | '-createdAt' | '+name' | '-name' | '+size' | '-size' | null;
};

export async function handleHonoApiDriveFilesList(
	deps: HonoApiDriveFilesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'DriveFile'>[]> {
	const params = parseHonoApiParams(driveFilesParamDef, body) as DriveFilesParams;

	let sinceId = params.sinceId ?? null;
	let untilId = params.untilId ?? null;

	if (sinceId == null && untilId == null) {
		if (params.sinceDate) sinceId = genId(deps.config, params.sinceDate);
		if (params.untilDate) untilId = genId(deps.config, params.untilDate);
	}

	const files = await listDriveFilesForUserFromDatabase(deps.db, {
		userId: me.id,
		limit: params.limit,
		sinceId,
		untilId,
		folderId: params.folderId,
		type: params.type,
		sort: params.sort ?? undefined,
	});

	return await packDriveFileManyForHonoApi(deps, files, { detail: false, self: true });
}

const driveFilesShowParamDef = {
	anyOf: [
		{
			type: 'object',
			properties: {
				fileId: { type: 'string', format: 'misskey:id' },
			},
			required: ['fileId'],
		},
		{
			type: 'object',
			properties: {
				url: { type: 'string' },
			},
			required: ['url'],
		},
	],
} as const;

type DriveFilesShowParams = { fileId: string } | { url: string };

export async function handleHonoApiDriveFilesShow(
	deps: HonoApiDriveFilesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'DriveFile'>> {
	const params = parseHonoApiParams(driveFilesShowParamDef, body) as DriveFilesShowParams;

	const file = 'fileId' in params
		? await fetchDriveFileByIdFromDatabase(deps.db, params.fileId)
		: await fetchDriveFileByUrlFromDatabase(deps.db, params.url);

	if (file == null) throw noSuchFileError('067bc436-2718-4795-b0fb-ecbe43949e31');

	if (!await isHonoApiModerator(deps, me) && file.userId !== me.id) {
		throw accessDeniedError('25b73c73-68b1-41d0-bad1-381cfdf6579f');
	}

	return await packDriveFileOrFailForHonoApi(deps, file, { detail: true, withUser: true, self: true });
}

const driveFilesFindParamDef = {
	type: 'object',
	properties: {
		name: { type: 'string' },
		folderId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
	},
	required: ['name'],
} as const;

type DriveFilesFindParams = {
	name: string;
	folderId?: string | null;
};

export async function handleHonoApiDriveFilesFind(
	deps: HonoApiDriveFilesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'DriveFile'>[]> {
	const params = parseHonoApiParams(driveFilesFindParamDef, body) as DriveFilesFindParams;

	const files = await listDriveFilesByNameUserIdAndFolderIdFromDatabase(deps.db, {
		name: params.name,
		userId: me.id,
		folderId: params.folderId ?? null,
	});

	return await packDriveFileManyForHonoApi(deps, files, { self: true });
}

const driveFilesFindByHashParamDef = {
	type: 'object',
	properties: {
		md5: { type: 'string' },
	},
	required: ['md5'],
} as const;

type DriveFilesFindByHashParams = {
	md5: string;
};

export async function handleHonoApiDriveFilesFindByHash(
	deps: HonoApiDriveFilesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'DriveFile'>[]> {
	const params = parseHonoApiParams(driveFilesFindByHashParamDef, body) as DriveFilesFindByHashParams;

	const files = await listDriveFilesByMd5AndUserIdFromDatabase(deps.db, params.md5, me.id);

	return await packDriveFileManyForHonoApi(deps, files, { self: true });
}

const driveFilesAttachedNotesParamDef = {
	type: 'object',
	properties: {
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		fileId: { type: 'string', format: 'misskey:id' },
	},
	required: ['fileId'],
} as const;

type DriveFilesAttachedNotesParams = {
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	limit: number;
	fileId: string;
};

export async function handleHonoApiDriveFilesAttachedNotes(
	deps: HonoApiDriveFilesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(driveFilesAttachedNotesParamDef, body) as DriveFilesAttachedNotesParams;

	const isModerator = await isHonoApiModerator(deps, me);
	const file = await fetchDriveFileByIdFromDatabase(deps.db, params.fileId);

	if (file == null || (!isModerator && file.userId !== me.id)) {
		throw noSuchFileError('c118ece3-2e4b-4296-99d1-51756e32d232');
	}

	let sinceId = params.sinceId ?? null;
	let untilId = params.untilId ?? null;

	if (sinceId == null && untilId == null) {
		if (params.sinceDate) sinceId = genId(deps.config, params.sinceDate);
		if (params.untilDate) untilId = genId(deps.config, params.untilDate);
	}

	const notes = await listNotesByAttachedFileIdFromDatabase(deps.db, file.id, {
		limit: params.limit,
		sinceId,
		untilId,
	});

	return await packNoteManyForHonoApi(deps, notes, me, { detail: true });
}

function buildDriveFileDeletionDependencies(deps: HonoApiDriveFilesDependencies): DriveFileDeletionDependencies {
	return {
		db: deps.db,
		meta: deps.meta,
		deleteInternalFile: key => deps.internalStorageService.del(key),
		enqueueDeleteObjectStorageFile: key => deps.objectStorageQueue.add('deleteFile', { key }, {
			removeOnComplete: { age: 3600 * 24 * 7, count: 30 },
			removeOnFail: { age: 3600 * 24 * 7, count: 100 },
		}),
		updateDriveChart: (file, isAdditional) => deps.chartWriters.driveChart.update(file, isAdditional),
		updatePerUserDriveChart: (file, isAdditional) => deps.chartWriters.perUserDriveChart.update(file, isAdditional),
		updateInstanceDriveChart: (file, isAdditional) => deps.chartWriters.instanceChart.updateDrive(file, isAdditional),
		publishDriveStream: (userId, type, value) => deps.publishDriveStream?.(userId, type, value),
		isModerator: user => isHonoApiModerator(deps, user),
		logDriveFileDeletion: (deleter, info) => logModerationEventInDatabase(deps, deleter, 'deleteDriveFile', info),
	};
}

const driveFilesDeleteParamDef = {
	type: 'object',
	properties: {
		fileId: { type: 'string', format: 'misskey:id' },
	},
	required: ['fileId'],
} as const;

type DriveFilesDeleteParams = {
	fileId: string;
};

export async function handleHonoApiDriveFilesDelete(
	deps: HonoApiDriveFilesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(driveFilesDeleteParamDef, body) as DriveFilesDeleteParams;

	const file = await fetchDriveFileByIdFromDatabase(deps.db, params.fileId);
	if (file == null) throw noSuchFileError('908939ec-e52b-4458-b395-1025195cea58');

	if (!await isHonoApiModerator(deps, me) && file.userId !== me.id) {
		throw accessDeniedError('5eb8d909-2540-4970-90b8-dd6f86088121');
	}

	startDriveFileDeletion(buildDriveFileDeletionDependencies(deps), file, false, me);
}

const driveFilesUpdateParamDef = {
	type: 'object',
	properties: {
		fileId: { type: 'string', format: 'misskey:id' },
		folderId: { type: 'string', format: 'misskey:id', nullable: true },
		name: { type: 'string' },
		isSensitive: { type: 'boolean' },
		comment: { type: 'string', nullable: true, maxLength: 512 },
	},
	required: ['fileId'],
} as const;

type DriveFilesUpdateParams = {
	fileId: string;
	folderId?: string | null;
	name?: string;
	isSensitive?: boolean;
	comment?: string | null;
};

function validateHonoApiDriveFileName(name: string): boolean {
	return (
		(name.trim().length > 0) &&
		(name.length <= 200) &&
		(name.indexOf('\\') === -1) &&
		(name.indexOf('/') === -1) &&
		(name.indexOf('..') === -1)
	);
}

export async function handleHonoApiDriveFilesUpdate(
	deps: HonoApiDriveFilesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'DriveFile'>> {
	const params = parseHonoApiParams(driveFilesUpdateParamDef, body) as DriveFilesUpdateParams;

	const file = await fetchDriveFileByIdFromDatabase(deps.db, params.fileId);
	if (file == null) throw noSuchFileError('e7778c7e-3af9-49cd-9690-6dbc3e6c972d');

	if (!await isHonoApiModerator(deps, me) && file.userId !== me.id) {
		throw accessDeniedError('01a53b27-82fc-445b-a0c1-b558465a8ed2');
	}

	const owner = file.userId != null ? await fetchUserByIdOrFailFromDatabase(deps.db, file.userId) : null;
	const policies = await getHonoApiRolePolicies(deps, owner);

	if (params.name != null && !validateHonoApiDriveFileName(params.name)) {
		throw new HonoApiError({ status: 400, message: 'Invalid file name.', code: 'INVALID_FILE_NAME', id: '395e7156-f9f0-475e-af89-53c3c23080c2' });
	}

	if (params.isSensitive !== undefined && params.isSensitive !== file.isSensitive && policies.alwaysMarkNsfw && !params.isSensitive) {
		throw new HonoApiError({ status: 400, message: 'This feature is restricted by your role.', code: 'RESTRICTED_BY_ROLE', id: '7f59dccb-f465-75ab-5cf4-3ce44e3282f7' });
	}

	if (params.folderId != null) {
		const folder = await fetchDriveFolderByIdAndUserIdFromDatabase(deps.db, params.folderId, file.userId);
		if (folder == null) {
			throw new HonoApiError({ status: 400, message: 'No such folder.', code: 'NO_SUCH_FOLDER', id: 'ea8fb7a5-af77-4a08-b608-c0218176cd73' });
		}
	}

	const values: DriveFileUpdate = {
		folderId: params.folderId,
		name: params.name,
		isSensitive: params.isSensitive,
		comment: params.comment,
	};
	await updateDriveFileInDatabase(deps.db, file.id, values);

	const packed = await packDriveFileOrFailForHonoApi(deps, file.id, { self: true });

	if (file.userId) {
		deps.publishDriveStream?.(file.userId, 'fileUpdated', packed);
	}

	if (await isHonoApiModerator(deps, me) && file.userId !== me.id) {
		if (params.isSensitive !== undefined && params.isSensitive !== file.isSensitive) {
			await logModerationEventInDatabase(deps, me, params.isSensitive ? 'markSensitiveDriveFile' : 'unmarkSensitiveDriveFile', {
				fileId: file.id,
				fileUserId: file.userId,
				fileUserUsername: owner?.username ?? null,
				fileUserHost: owner?.host ?? null,
			});
		}
	}

	return packed;
}

const driveFilesMoveBulkParamDef = {
	type: 'object',
	properties: {
		fileIds: { type: 'array', uniqueItems: true, minItems: 1, maxItems: 100, items: { type: 'string', format: 'misskey:id' } },
		folderId: { type: 'string', format: 'misskey:id', nullable: true },
	},
	required: ['fileIds'],
} as const;

type DriveFilesMoveBulkParams = {
	fileIds: string[];
	folderId?: string | null;
};

export async function handleHonoApiDriveFilesMoveBulk(
	deps: HonoApiDriveFilesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(driveFilesMoveBulkParamDef, body) as DriveFilesMoveBulkParams;

	const folder = params.folderId ? await fetchDriveFolderByIdAndUserIdOrFailFromDatabase(deps.db, params.folderId, me.id) : null;

	await updateDriveFilesFolderByIdsAndUserIdInDatabase(deps.db, params.fileIds, me.id, folder ? folder.id : null);
}
