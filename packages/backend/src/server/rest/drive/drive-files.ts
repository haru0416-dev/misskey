/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import { startDriveFileDeletion, type DriveFileDeletionDependencies } from '@/core/drive/DriveFileDeletionLogic.js';
import {
	fetchDriveFileByIdFromDatabase,
	fetchDriveFileByUrlFromDatabase,
	listDriveFilesByMd5AndUserIdFromDatabase,
	listDriveFilesByNameUserIdAndFolderIdFromDatabase,
	listDriveFilesForUserFromDatabase,
	updateDriveFileInDatabase,
	updateDriveFilesFolderByIdsAndUserIdInDatabase,
	type DriveFileUpdate,
} from '@/core/drive/DriveFileStore.js';
import { fetchDriveFolderByIdAndUserIdFromDatabase } from '@/core/drive/DriveFolderStore.js';
import { listChatMessagesByFileIdFromDatabase, resolveChatMessagePagination } from '@/core/chat/ChatMessageStore.js';
import type { InternalStorageService } from '@/core/drive/InternalStorageService.js';
import {
	logModerationEventInDatabase,
	logModerationEventWithIdInDatabase,
} from '@/core/moderation/ModerationLogLogic.js';
import { listNotesByAttachedFileIdFromDatabase } from '@/core/note/NoteStore.js';
import type { DbQueue, ObjectStorageQueue } from '@/core/queue/queues.js';
import { queueRetentionOptions } from '@/queue/const.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId, uniqueItems } from '@/misc/zod-params.js';
import type { MiLocalUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import { checkChatAvailabilityForApi, packChatMessagesDetailedForApi, type ApiChatDependencies } from '../chat/chat.js';
import { packDriveFileManyForApi, packDriveFileOrFailForApi, type ApiDriveFileDependencies } from './drive-file.js';
import { packNoteManyForApi, type ApiNoteDependencies } from '../note/note.js';
import { getApiRolePolicies, isApiModerator, type ApiRolePolicyDependencies } from '../role/role-policy.js';
import type { ChartWriters } from '@/server/chart-runtime.js';
import { parseApiParams } from '../validation.js';

export type ApiDriveFilesDependencies = ApiNoteDependencies &
	ApiDriveFileDependencies &
	ApiRolePolicyDependencies &
	ApiChatDependencies & {
		objectStorageQueue: ObjectStorageQueue;
		dbQueue: DbQueue;
		internalStorageService: Pick<InternalStorageService, 'del'>;
		chartWriters: ChartWriters;
	};

function noSuchFileError(id: string): ApiError {
	return new ApiError({ status: 400, message: 'No such file.', code: 'NO_SUCH_FILE', id });
}

function accessDeniedError(id: string): ApiError {
	return new ApiError({ status: 400, message: 'Access denied.', code: 'ACCESS_DENIED', id });
}

export const driveFilesParamDef = z.object({
	limit: z.number().int().min(1).max(100).default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	folderId: misskeyId().nullable().default(null),
	type: z
		.string()
		.regex(/^[a-zA-Z/\-*]+$/)
		.nullable()
		.optional(),
	sort: z.union([z.enum(['+createdAt', '-createdAt', '+name', '-name', '+size', '-size']), z.null()]).optional(),
});

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

export async function handleApiDriveFilesList(
	deps: ApiDriveFilesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'DriveFile'>[]> {
	const params = parseApiParams(driveFilesParamDef, body);

	let sinceId = params.sinceId ?? null;
	let untilId = params.untilId ?? null;

	if (sinceId == null && untilId == null) {
		if (params.sinceDate) sinceId = genId(params.sinceDate);
		if (params.untilDate) untilId = genId(params.untilDate);
	}

	const files = await listDriveFilesForUserFromDatabase(
		deps.db,
		omitUndefined({
			userId: me.id,
			limit: params.limit,
			sinceId,
			untilId,
			folderId: params.folderId,
			type: params.type,
			sort: params.sort ?? undefined,
		}),
	);

	return await packDriveFileManyForApi(deps, files, { detail: false, self: true });
}

export const driveStreamParamDef = z.object({
	limit: z.number().int().min(1).max(100).default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	type: z
		.string()
		.regex(/^[a-zA-Z/\-*]+$/)
		.optional(),
});

type DriveStreamParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	type?: string;
};

export async function handleApiDriveStream(
	deps: ApiDriveFilesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'DriveFile'>[]> {
	const params = parseApiParams(driveStreamParamDef, body);

	let sinceId = params.sinceId ?? null;
	let untilId = params.untilId ?? null;

	if (sinceId == null && untilId == null) {
		if (params.sinceDate) sinceId = genId(params.sinceDate);
		if (params.untilDate) untilId = genId(params.untilDate);
	}

	const files = await listDriveFilesForUserFromDatabase(
		deps.db,
		omitUndefined({
			userId: me.id,
			limit: params.limit,
			sinceId,
			untilId,
			type: params.type,
		}),
	);

	return await packDriveFileManyForApi(deps, files, { detail: false, self: true });
}

export const driveFilesShowParamDef = z.union([z.object({ fileId: misskeyId() }), z.object({ url: z.string() })]);

type DriveFilesShowParams = { fileId: string } | { url: string };

export async function handleApiDriveFilesShow(
	deps: ApiDriveFilesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'DriveFile'>> {
	const params = parseApiParams(driveFilesShowParamDef, body);

	const file =
		'fileId' in params
			? await fetchDriveFileByIdFromDatabase(deps.db, params.fileId)
			: await fetchDriveFileByUrlFromDatabase(deps.db, params.url);

	if (file == null) throw noSuchFileError('067bc436-2718-4795-b0fb-ecbe43949e31');

	if (!(await isApiModerator(deps, me)) && file.userId !== me.id) {
		throw accessDeniedError('25b73c73-68b1-41d0-bad1-381cfdf6579f');
	}

	return await packDriveFileOrFailForApi(deps, file, { detail: true, withUser: true, self: true });
}

export const driveFilesFindParamDef = z.object({
	name: z.string(),
	folderId: misskeyId().nullable().default(null),
});

type DriveFilesFindParams = {
	name: string;
	folderId?: string | null;
};

export async function handleApiDriveFilesFind(
	deps: ApiDriveFilesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'DriveFile'>[]> {
	const params = parseApiParams(driveFilesFindParamDef, body);

	const files = await listDriveFilesByNameUserIdAndFolderIdFromDatabase(deps.db, {
		name: params.name,
		userId: me.id,
		folderId: params.folderId ?? null,
	});

	return await packDriveFileManyForApi(deps, files, { self: true });
}

export const driveFilesFindByHashParamDef = z.object({
	md5: z.string(),
});

type DriveFilesFindByHashParams = {
	md5: string;
};

export async function handleApiDriveFilesFindByHash(
	deps: ApiDriveFilesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'DriveFile'>[]> {
	const params = parseApiParams(driveFilesFindByHashParamDef, body);

	const files = await listDriveFilesByMd5AndUserIdFromDatabase(deps.db, params.md5, me.id);

	return await packDriveFileManyForApi(deps, files, { self: true });
}

export const driveFilesAttachedNotesParamDef = z.object({
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	limit: z.number().int().min(1).max(100).default(10),
	fileId: misskeyId(),
});

type DriveFilesAttachedNotesParams = {
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	limit: number;
	fileId: string;
};

export async function handleApiDriveFilesAttachedNotes(
	deps: ApiDriveFilesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseApiParams(driveFilesAttachedNotesParamDef, body);

	const isModerator = await isApiModerator(deps, me);
	const file = await fetchDriveFileByIdFromDatabase(deps.db, params.fileId);

	if (file == null || (!isModerator && file.userId !== me.id)) {
		throw noSuchFileError('c118ece3-2e4b-4296-99d1-51756e32d232');
	}

	let sinceId = params.sinceId ?? null;
	let untilId = params.untilId ?? null;

	if (sinceId == null && untilId == null) {
		if (params.sinceDate) sinceId = genId(params.sinceDate);
		if (params.untilDate) untilId = genId(params.untilDate);
	}

	const notes = await listNotesByAttachedFileIdFromDatabase(deps.db, file.id, {
		limit: params.limit,
		sinceId,
		untilId,
	});

	return await packNoteManyForApi(deps, notes, me, { detail: true });
}

export function buildDriveFileDeletionDependencies(deps: ApiDriveFilesDependencies): DriveFileDeletionDependencies {
	return {
		db: deps.db,
		config: deps.config,
		dbQueue: deps.dbQueue,
		meta: deps.meta,
		deleteInternalFile: (key) => deps.internalStorageService.del(key),
		enqueueDeleteObjectStorageFile: (key) =>
			deps.objectStorageQueue.add(
				'deleteFile',
				{ key },
				{
					attempts: 5,
					backoff: { type: 'exponential', delay: 10_000 },
					deduplication: { id: key },
					...queueRetentionOptions(deps.config),
				},
			),
		updateDriveChart: (file, isAdditional) => deps.chartWriters.driveChart.update(file, isAdditional),
		updatePerUserDriveChart: (file, isAdditional) => deps.chartWriters.perUserDriveChart.update(file, isAdditional),
		updateInstanceDriveChart: (file, isAdditional) => deps.chartWriters.instanceChart.updateDrive(file, isAdditional),
		publishDriveStream: (userId, type, value) => deps.publishDriveStream?.(userId, type, value),
		isModerator: (user) => isApiModerator(deps, user),
		logDriveFileDeletion: (db, deleter, logId, info) =>
			logModerationEventWithIdInDatabase({ db }, deleter, 'deleteDriveFile', info, logId),
	};
}

export const driveFilesDeleteParamDef = z.object({
	fileId: misskeyId(),
});

type DriveFilesDeleteParams = {
	fileId: string;
};

export async function handleApiDriveFilesDelete(
	deps: ApiDriveFilesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(driveFilesDeleteParamDef, body);

	const file = await fetchDriveFileByIdFromDatabase(deps.db, params.fileId);
	if (file == null) throw noSuchFileError('908939ec-e52b-4458-b395-1025195cea58');

	if (!(await isApiModerator(deps, me)) && file.userId !== me.id) {
		throw accessDeniedError('5eb8d909-2540-4970-90b8-dd6f86088121');
	}

	await startDriveFileDeletion(buildDriveFileDeletionDependencies(deps), file, false, me);
}

export const driveFilesUpdateParamDef = z.object({
	fileId: misskeyId(),
	folderId: misskeyId().nullable().optional(),
	name: z.string().optional(),
	isSensitive: z.boolean().optional(),
	comment: z.string().max(512).nullable().optional(),
});

type DriveFilesUpdateParams = {
	fileId: string;
	folderId?: string | null;
	name?: string;
	isSensitive?: boolean;
	comment?: string | null;
};

export function validateApiDriveFileName(name: string): boolean {
	return (
		name.trim().length > 0 && name.length <= 200 && !name.includes('\\') && !name.includes('/') && !name.includes('..')
	);
}

export async function handleApiDriveFilesUpdate(
	deps: ApiDriveFilesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'DriveFile'>> {
	const params = parseApiParams(driveFilesUpdateParamDef, body);

	const file = await fetchDriveFileByIdFromDatabase(deps.db, params.fileId);
	if (file == null) throw noSuchFileError('e7778c7e-3af9-49cd-9690-6dbc3e6c972d');

	if (!(await isApiModerator(deps, me)) && file.userId !== me.id) {
		throw accessDeniedError('01a53b27-82fc-445b-a0c1-b558465a8ed2');
	}

	const owner = file.userId != null ? await fetchUserByIdOrFailFromDatabase(deps.db, file.userId) : null;
	const policies = await getApiRolePolicies(deps, owner);

	if (params.name != null && !validateApiDriveFileName(params.name)) {
		throw new ApiError({
			status: 400,
			message: 'Invalid file name.',
			code: 'INVALID_FILE_NAME',
			id: '395e7156-f9f0-475e-af89-53c3c23080c2',
		});
	}

	if (
		params.isSensitive !== undefined &&
		params.isSensitive !== file.isSensitive &&
		policies.alwaysMarkNsfw &&
		!params.isSensitive
	) {
		throw new ApiError({
			status: 400,
			message: 'This feature is restricted by your role.',
			code: 'RESTRICTED_BY_ROLE',
			id: '7f59dccb-f465-75ab-5cf4-3ce44e3282f7',
		});
	}

	if (params.folderId != null) {
		const folder = await fetchDriveFolderByIdAndUserIdFromDatabase(deps.db, params.folderId, file.userId);
		if (folder == null) {
			throw new ApiError({
				status: 400,
				message: 'No such folder.',
				code: 'NO_SUCH_FOLDER',
				id: 'ea8fb7a5-af77-4a08-b608-c0218176cd73',
			});
		}
	}

	const values: DriveFileUpdate = omitUndefined({
		folderId: params.folderId,
		name: params.name,
		isSensitive: params.isSensitive,
		comment: params.comment,
	});
	await updateDriveFileInDatabase(deps.db, file.id, values);

	const packed = await packDriveFileOrFailForApi(deps, file.id, { self: true });

	if (file.userId) {
		deps.publishDriveStream?.(file.userId, 'fileUpdated', packed);
	}

	if ((await isApiModerator(deps, me)) && file.userId !== me.id) {
		if (params.isSensitive !== undefined && params.isSensitive !== file.isSensitive) {
			await logModerationEventInDatabase(
				deps,
				me,
				params.isSensitive ? 'markSensitiveDriveFile' : 'unmarkSensitiveDriveFile',
				{
					fileId: file.id,
					fileUserId: file.userId,
					fileUserUsername: owner?.username ?? null,
					fileUserHost: owner?.host ?? null,
				},
			);
		}
	}

	return packed;
}

export const driveFilesMoveBulkParamDef = z.object({
	fileIds: uniqueItems(z.array(misskeyId()).min(1).max(100)),
	folderId: misskeyId().nullable().optional(),
});

type DriveFilesMoveBulkParams = {
	fileIds: string[];
	folderId?: string | null;
};

export async function handleApiDriveFilesMoveBulk(
	deps: ApiDriveFilesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(driveFilesMoveBulkParamDef, body);

	const folder = params.folderId
		? await fetchDriveFolderByIdAndUserIdFromDatabase(deps.db, params.folderId, me.id)
		: null;
	if (params.folderId && folder == null) {
		throw new ApiError({
			status: 400,
			message: 'No such folder.',
			code: 'NO_SUCH_FOLDER',
			id: 'abdd73a9-6225-4140-a3e4-8089c77168bc',
		});
	}

	await updateDriveFilesFolderByIdsAndUserIdInDatabase(deps.db, params.fileIds, me.id, folder ? folder.id : null);
}

export const driveFilesAttachedChatMessagesParamDef = z.object({
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	limit: z.number().int().min(1).max(100).default(10),
	fileId: misskeyId(),
});

type DriveFilesAttachedChatMessagesParams = {
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	limit: number;
	fileId: string;
};

export async function handleApiDriveFilesAttachedChatMessages(
	deps: ApiDriveFilesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'ChatMessage'>[]> {
	const params = parseApiParams(driveFilesAttachedChatMessagesParamDef, body);

	const isModerator = await isApiModerator(deps, me);

	if (!isModerator) {
		await checkChatAvailabilityForApi(deps, me.id, 'read');
	}

	const file = await fetchDriveFileByIdFromDatabase(deps.db, params.fileId);

	if (file == null || (!isModerator && file.userId !== me.id)) {
		throw noSuchFileError('485ce26d-f5d2-4313-9783-e689d131eafb');
	}

	const messages = await listChatMessagesByFileIdFromDatabase(deps.db, file.id, {
		limit: params.limit,
		...resolveChatMessagePagination({ gen: (time) => genId(time) }, params),
	});

	return await packChatMessagesDetailedForApi(deps, messages, me);
}
