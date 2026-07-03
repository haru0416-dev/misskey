/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	fetchDriveFileByIdFromDatabase,
	fetchDriveFileByUrlFromDatabase,
	listDriveFilesByMd5AndUserIdFromDatabase,
	listDriveFilesByNameUserIdAndFolderIdFromDatabase,
	listDriveFilesForUserFromDatabase,
} from '@/core/DriveFileStore.js';
import { listNotesByAttachedFileIdFromDatabase } from '@/core/NoteStore.js';
import { genId } from '@/misc/id/gen-id.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiLocalUser } from '@/models/User.js';
import { HonoApiError } from './hono-api-error.js';
import { packDriveFileManyForHonoApi, packDriveFileOrFailForHonoApi, type HonoApiDriveFileDependencies } from './hono-api-drive-file.js';
import { packNoteManyForHonoApi, type HonoApiNoteDependencies } from './hono-api-note.js';
import { isHonoApiModerator, type HonoApiRolePolicyDependencies } from './hono-api-role-policy.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiDriveFilesDependencies = HonoApiNoteDependencies & HonoApiDriveFileDependencies & HonoApiRolePolicyDependencies;

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
