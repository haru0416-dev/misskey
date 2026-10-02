/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Params } from '../validation.js';
import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import { startDriveFileDeletion } from '@/core/drive/drive-file-deletion-logic.js';
import type { DriveFileDeletionDependencies } from '@/core/drive/drive-file-deletion-logic.js';
import {
	fetchDriveFileByIdFromDatabase,
	fetchDriveFileByUrlFromDatabase,
	listDriveFilesByMd5AndUserIdFromDatabase,
	listDriveFilesByNameUserIdAndFolderIdFromDatabase,
	listDriveFilesForUserFromDatabase,
	updateDriveFileInDatabase,
	updateDriveFilesFolderByIdsAndUserIdInDatabase,
} from '@/core/drive/drive-file-store.js';
import type { DriveFileUpdate } from '@/core/drive/drive-file-store.js';
import { validateDriveFileName } from '@/core/drive/drive-file-name.js';
import { fetchDriveFolderByIdAndUserIdFromDatabase } from '@/core/drive/drive-folder-store.js';
import { listChatMessagesByFileIdFromDatabase } from '@/core/chat/chat-message-store.js';
import type { InternalStorageService } from '@/core/drive/internal-storage-service.js';
import {
	logModerationEventInDatabase,
	logModerationEventWithIdInDatabase,
} from '@/core/moderation/moderation-log-logic.js';
import { listNotesByAttachedFileIdFromDatabase } from '@/core/note/note-store.js';
import type { DbQueue, ObjectStorageQueue } from '@/core/queue/queues.js';
import { queueRetentionOptions } from '@/core/queue/const.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/user-store.js';
import { genId } from '@/misc/id/gen-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId, paginationParams, uniqueItems } from '@/misc/zod-params.js';
import type { MiLocalUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import { checkChatAvailability, packChatMessagesDetailed } from '../chat/chat.js';
import type { ChatDependencies } from '../../../core/chat/chat-packing.js';
import { packDriveFileMany, packDriveFileOrFail } from '../../../core/drive/drive-file-packing.js';
import type { DriveFileDependencies } from '../../../core/drive/drive-file-packing.js';
import { packNoteMany } from '../note/note.js';
import type { NoteDependencies } from '../../../core/note/note-packing.js';
import { fetchRolePolicies, userIsModerator } from '../../../core/role/role-policy.js';
import type { RolePolicyDependencies } from '../../../core/role/role-policy.js';
import type { ChartWriters } from '@/core/chart/chart-runtime.js';
import { resolveApiDateIdPagination } from '../date-id-pagination.js';
import { parseApiParams } from '../validation.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';

export type DriveFilesDependencies = NoteDependencies &
	DriveFileDependencies &
	RolePolicyDependencies &
	ChatDependencies & {
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
	limit: z.int().min(1).max(100).default(10),
	...paginationParams,
	folderId: misskeyId().nullable().default(null),
	type: z
		.string()
		.regex(/^[a-zA-Z/\-*]+$/)
		.nullable()
		.optional(),
	sort: z.union([z.enum(['+createdAt', '-createdAt', '+name', '-name', '+size', '-size']), z.null()]).optional(),
	// 名前・サイズ順の続きを読むときに使う (ID のカーソルはその並びの続きを表さない)。
	offset: z.int().min(0).optional(),
});

export async function handleApiDriveFilesList(
	deps: DriveFilesDependencies,
	me: MiLocalUser,
	params: Params<typeof driveFilesParamDef>,
): Promise<Packed<'DriveFile'>[]> {
	const { sinceId, untilId } = resolveApiDateIdPagination(params);

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
			offset: params.offset,
		}),
	);

	return await packDriveFileMany(deps, files, { detail: false, self: true });
}

export const driveStreamParamDef = z.object({
	limit: z.int().min(1).max(100).default(10),
	...paginationParams,
	type: z
		.string()
		.regex(/^[a-zA-Z/\-*]+$/)
		.optional(),
});

export async function handleApiDriveStream(
	deps: DriveFilesDependencies,
	me: MiLocalUser,
	params: Params<typeof driveStreamParamDef>,
): Promise<Packed<'DriveFile'>[]> {
	const { sinceId, untilId } = resolveApiDateIdPagination(params);

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

	return await packDriveFileMany(deps, files, { detail: false, self: true });
}

export const driveFilesShowParamDef = z.union([z.object({ fileId: misskeyId() }), z.object({ url: z.string() })]);

export async function handleApiDriveFilesShow(
	deps: DriveFilesDependencies,
	me: MiLocalUser,
	params: Params<typeof driveFilesShowParamDef>,
): Promise<Packed<'DriveFile'>> {
	const file =
		'fileId' in params
			? await fetchDriveFileByIdFromDatabase(deps.db, params.fileId)
			: await fetchDriveFileByUrlFromDatabase(deps.db, params.url);

	if (file == null) {
		throw noSuchFileError('067bc436-2718-4795-b0fb-ecbe43949e31');
	}

	if (!(await userIsModerator(deps, me)) && file.userId !== me.id) {
		throw accessDeniedError('25b73c73-68b1-41d0-bad1-381cfdf6579f');
	}

	return await packDriveFileOrFail(deps, file, { detail: true, withUser: true, self: true });
}

export const driveFilesFindParamDef = z.object({
	name: z.string(),
	folderId: misskeyId().nullable().default(null),
});

export async function handleApiDriveFilesFind(
	deps: DriveFilesDependencies,
	me: MiLocalUser,
	params: Params<typeof driveFilesFindParamDef>,
): Promise<Packed<'DriveFile'>[]> {
	const files = await listDriveFilesByNameUserIdAndFolderIdFromDatabase(deps.db, {
		name: params.name,
		userId: me.id,
		folderId: params.folderId ?? null,
	});

	return await packDriveFileMany(deps, files, { self: true });
}

export const driveFilesFindByHashParamDef = z.object({
	md5: z.string(),
});

export async function handleApiDriveFilesFindByHash(
	deps: DriveFilesDependencies,
	me: MiLocalUser,
	params: Params<typeof driveFilesFindByHashParamDef>,
): Promise<Packed<'DriveFile'>[]> {
	const files = await listDriveFilesByMd5AndUserIdFromDatabase(deps.db, params.md5, me.id);

	return await packDriveFileMany(deps, files, { self: true });
}

export const driveFilesAttachedNotesParamDef = z.object({
	...paginationParams,
	limit: z.int().min(1).max(100).default(10),
	fileId: misskeyId(),
});

export async function handleApiDriveFilesAttachedNotes(
	deps: DriveFilesDependencies,
	me: MiLocalUser,
	params: Params<typeof driveFilesAttachedNotesParamDef>,
): Promise<Packed<'Note'>[]> {
	const isModerator = await userIsModerator(deps, me);
	const file = await fetchDriveFileByIdFromDatabase(deps.db, params.fileId);

	if (file == null || (!isModerator && file.userId !== me.id)) {
		throw noSuchFileError('c118ece3-2e4b-4296-99d1-51756e32d232');
	}

	const { sinceId, untilId } = resolveApiDateIdPagination(params);

	const notes = await listNotesByAttachedFileIdFromDatabase(deps.db, file.id, {
		limit: params.limit,
		sinceId,
		untilId,
	});

	return await packNoteMany(deps, notes, me, { detail: true });
}

export function buildDriveFileDeletionDependencies(deps: DriveFilesDependencies): DriveFileDeletionDependencies {
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
		isModerator: (user) => userIsModerator(deps, user),
		logDriveFileDeletion: (db, deleter, logId, info) =>
			logModerationEventWithIdInDatabase({ db }, deleter, 'deleteDriveFile', info, logId),
	};
}

export const driveFilesDeleteParamDef = z.object({
	fileId: misskeyId(),
});

export async function handleApiDriveFilesDelete(
	deps: DriveFilesDependencies,
	me: MiLocalUser,
	params: Params<typeof driveFilesDeleteParamDef>,
): Promise<void> {
	const file = await fetchDriveFileByIdFromDatabase(deps.db, params.fileId);
	if (file == null) {
		throw noSuchFileError('908939ec-e52b-4458-b395-1025195cea58');
	}

	if (!(await userIsModerator(deps, me)) && file.userId !== me.id) {
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

export async function handleApiDriveFilesUpdate(
	deps: DriveFilesDependencies,
	me: MiLocalUser,
	params: Params<typeof driveFilesUpdateParamDef>,
): Promise<Packed<'DriveFile'>> {
	const file = await fetchDriveFileByIdFromDatabase(deps.db, params.fileId);
	if (file == null) {
		throw noSuchFileError('e7778c7e-3af9-49cd-9690-6dbc3e6c972d');
	}

	if (!(await userIsModerator(deps, me)) && file.userId !== me.id) {
		throw accessDeniedError('01a53b27-82fc-445b-a0c1-b558465a8ed2');
	}

	const owner = file.userId != null ? await fetchUserByIdOrFailFromDatabase(deps.db, file.userId) : null;
	const policies = await fetchRolePolicies(deps, owner);

	if (params.name != null && !validateDriveFileName(params.name)) {
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

	const packed = await packDriveFileOrFail(deps, file.id, { self: true });

	if (file.userId) {
		deps.publishDriveStream?.(file.userId, 'fileUpdated', packed);
	}

	if ((await userIsModerator(deps, me)) && file.userId !== me.id) {
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

export async function handleApiDriveFilesMoveBulk(
	deps: DriveFilesDependencies,
	me: MiLocalUser,
	params: Params<typeof driveFilesMoveBulkParamDef>,
): Promise<void> {
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
	...paginationParams,
	limit: z.int().min(1).max(100).default(10),
	fileId: misskeyId(),
});

export async function handleApiDriveFilesAttachedChatMessages(
	deps: DriveFilesDependencies,
	me: MiLocalUser,
	params: Params<typeof driveFilesAttachedChatMessagesParamDef>,
): Promise<Packed<'ChatMessage'>[]> {
	const isModerator = await userIsModerator(deps, me);

	if (!isModerator) {
		await checkChatAvailability(deps, me.id, 'read');
	}

	const file = await fetchDriveFileByIdFromDatabase(deps.db, params.fileId);

	if (file == null || (!isModerator && file.userId !== me.id)) {
		throw noSuchFileError('485ce26d-f5d2-4313-9783-e689d131eafb');
	}

	const messages = await listChatMessagesByFileIdFromDatabase(deps.db, file.id, {
		limit: params.limit,
		...resolveDateIdPagination({ gen: genId }, params),
	});

	return await packChatMessagesDetailed(deps, messages, me);
}
