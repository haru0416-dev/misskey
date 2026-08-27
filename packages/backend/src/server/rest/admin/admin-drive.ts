/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import type { Config } from '@/config.js';
import {
	fetchDriveFileByIdFromDatabase,
	fetchDriveFileByUrlFromDatabase,
	listAllDriveFilesByUserIdFromDatabase,
	listDriveFilesForAdminFromDatabase,
	listOrphanDriveFilesFromDatabase,
} from '@/core/drive/DriveFileStore.js';
import { startDriveFileDeletion } from '@/core/drive/DriveFileDeletionLogic.js';
import type { InternalStorageService } from '@/core/drive/InternalStorageService.js';
import type { ObjectStorageQueue } from '@/core/queue/queues.js';
import { queueRetentionOptions } from '@/queue/const.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { omitUndefined } from '@/misc/clone.js';
import { isMimeImage } from '@/misc/is-mime-image.js';
import { appendQuery, query } from '@/misc/prelude/url.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiUser } from '@/models/User.js';
import { packDriveFoldersManyForApi } from '../drive/drive.js';
import { packUserLiteManyForApi } from '../user/user.js';
import type { ApiDriveStreamPublisher } from '../events.js';
import type { ApiRolePolicyDependencies } from '../role/role-policy.js';
import { isApiModerator } from '../role/role-policy.js';
import { ApiError } from '../error.js';
import { parseApiParams } from '../validation.js';

export type ApiAdminDriveDependencies = ApiRolePolicyDependencies & {
	internalStorageService: Pick<InternalStorageService, 'del'>;
	objectStorageQueue: ObjectStorageQueue;
	dbQueue: import('@/core/queue/queues.js').DbQueue;
	publishDriveStream?: ApiDriveStreamPublisher;
};

const adminDriveNoParamsDef = z.object({});

export const adminDriveUserParamDef = z.object({
	userId: misskeyId(),
});

// `fileId` または `url` を受け付ける。両方を指定してもよく、少なくとも一方は必須。
const adminDriveShowFileParamDef = z
	.object({
		fileId: misskeyId().optional(),
		url: z.string().optional(),
	})
	.superRefine((data, ctx) => {
		if (data.fileId === undefined && data.url === undefined) {
			ctx.addIssue({ code: 'custom', message: 'must match a schema in anyOf' });
		}
	});

// OpenAPI/misskey-js コード生成専用。上の superRefine は JSON Schema 化できないため、
// docs 用には「fileId 必須」または「url 必須」の anyOf として表現する。
export const adminDriveShowFileDocsParamDef = z.union([
	z.object({ fileId: misskeyId() }),
	z.object({ url: z.string() }),
]);

export const adminDriveFilesParamDef = z.object({
	limit: z.int().min(1).max(100).default(10),
	...paginationParams,
	userId: misskeyId().nullable().optional(),
	type: z
		.string()
		.regex(/^[a-zA-Z0-9\/\-*]+$/)
		.nullable()
		.optional(),
	origin: z.enum(['combined', 'local', 'remote']).default('local'),
	/** ローカルホストは null で表す。 */
	hostname: z.string().nullable().default(null),
});

type AdminDriveFileResponse = {
	id: string;
	userId: string | null;
	userHost: string | null;
	isLink: boolean;
	maybePorn: boolean;
	maybeSensitive: boolean;
	isSensitive: boolean;
	folderId: string | null;
	src: string | null;
	uri: string | null;
	webpublicAccessKey: string | null;
	thumbnailAccessKey: string | null;
	accessKey: string | null;
	webpublicType: string | null;
	webpublicUrl: string | null;
	thumbnailUrl: string | null;
	url: string;
	storedInternal: boolean;
	properties: MiDriveFile['properties'];
	blurhash: string | null;
	comment: string | null;
	size: number;
	type: string;
	name: string;
	md5: string;
	createdAt: string;
	requestIp: string | null;
	requestHeaders: Record<string, string> | null;
};

function noSuchFileError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such file.',
		code: 'NO_SUCH_FILE',
		id: 'caf3ca38-c6e5-472e-a30c-b05377dcc240',
	});
}

function getProxiedUrl(deps: ApiAdminDriveDependencies, url: string, mode?: 'static' | 'avatar'): string {
	return appendQuery(
		`${deps.config.media.proxyUrl}/${mode ?? 'image'}.webp`,
		query({
			url,
			...(mode ? { [mode]: '1' } : {}),
		}),
	);
}

function getExternalVideoThumbnailUrl(deps: ApiAdminDriveDependencies, url: string): string | null {
	if (deps.config.media.videoThumbnailGeneratorUrl == null) return null;

	return appendQuery(
		`${deps.config.media.videoThumbnailGeneratorUrl}/thumbnail.webp`,
		query({
			thumbnail: '1',
			url,
		}),
	);
}

function getAdminDriveFileThumbnailUrl(deps: ApiAdminDriveDependencies, file: MiDriveFile): string | null {
	if (file.type.startsWith('video')) {
		if (file.thumbnailUrl) return file.thumbnailUrl;

		return getExternalVideoThumbnailUrl(deps, file.webpublicUrl ?? file.url);
	} else if (file.uri != null && file.userHost != null && deps.config.media.externalProxyEnabled) {
		return getProxiedUrl(deps, file.uri, 'static');
	}

	if (file.uri != null && file.isLink && deps.meta.proxyRemoteFiles) {
		return getProxiedUrl(deps, file.uri, 'static');
	}

	const url = file.webpublicUrl ?? file.url;

	return file.thumbnailUrl ?? (isMimeImage(file.type, 'sharp-convertible-image') ? url : null);
}

function enqueueDeleteObjectStorageFile(
	queue: ObjectStorageQueue,
	config: Pick<Config, 'queues'>,
	key: string,
): unknown {
	return queue.add(
		'deleteFile',
		{ key },
		{
			attempts: 5,
			backoff: { type: 'exponential', delay: 10_000 },
			deduplication: { id: key },
			...queueRetentionOptions(config),
		},
	);
}

export async function startApiAdminDriveFileDeletion(
	deps: ApiAdminDriveDependencies,
	file: MiDriveFile,
): Promise<void> {
	await startDriveFileDeletion(
		{
			db: deps.db,
			config: deps.config,
			dbQueue: deps.dbQueue,
			meta: deps.meta,
			deleteInternalFile: (key) => deps.internalStorageService.del(key),
			enqueueDeleteObjectStorageFile: (key) =>
				enqueueDeleteObjectStorageFile(deps.objectStorageQueue, deps.config, key),
			publishDriveStream: deps.publishDriveStream,
		},
		file,
	);
}

async function packAdminDriveFilesForApi(
	deps: ApiAdminDriveDependencies,
	files: MiDriveFile[],
): Promise<Packed<'DriveFile'>[]> {
	const userRefs = files.map(({ user, userId }) => user ?? userId).filter((x) => x != null);
	const uniqueUserRefs = Array.from(
		new Map(userRefs.map((user) => [typeof user === 'string' ? user : user.id, user])).values(),
	);
	const packedUsers = uniqueUserRefs.length > 0 ? await packUserLiteManyForApi(deps, uniqueUserRefs) : [];
	const userMap = new Map(packedUsers.map((user) => [user.id, user]));

	const folderRefs = files.map(({ folder, folderId }) => folder ?? folderId).filter((x) => x != null);
	const uniqueFolderRefs = Array.from(
		new Map(folderRefs.map((folder) => [typeof folder === 'string' ? folder : folder.id, folder])).values(),
	);
	const packedFolders = await packDriveFoldersManyForApi(deps, uniqueFolderRefs, { detail: true });
	const folderMap = new Map(packedFolders.map((folder) => [folder.id, folder]));

	return files.map((file) => ({
		id: file.id,
		createdAt: parseId(file.id).date.toISOString(),
		name: file.name,
		type: file.type,
		md5: file.md5,
		size: file.size,
		isSensitive: file.isSensitive,
		blurhash: file.blurhash,
		properties: file.properties,
		url: file.url,
		thumbnailUrl: getAdminDriveFileThumbnailUrl(deps, file),
		comment: file.comment,
		folderId: file.folderId,
		folder: file.folderId == null ? null : (folderMap.get(file.folderId) ?? null),
		userId: file.userId,
		user: file.userId == null ? null : (userMap.get(file.userId) ?? null),
	}));
}

export async function handleApiAdminDriveCleanRemoteFiles(
	deps: ApiAdminDriveDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	parseApiParams(adminDriveNoParamsDef, body);

	await deps.objectStorageQueue.add(
		'cleanRemoteFiles',
		{},
		{
			attempts: 2,
			backoff: { type: 'exponential', delay: 60_000 },
			deduplication: { id: 'cleanRemoteFiles' },
			...queueRetentionOptions(deps.config),
		},
	);
}

export async function handleApiAdminDriveCleanup(
	deps: ApiAdminDriveDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	parseApiParams(adminDriveNoParamsDef, body);
	const files = await listOrphanDriveFilesFromDatabase(deps.db);

	for (const file of files) {
		await startApiAdminDriveFileDeletion(deps, file);
	}
}

export async function handleApiAdminDeleteAllFilesOfAUser(
	deps: ApiAdminDriveDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminDriveUserParamDef, body);
	const files = await listAllDriveFilesByUserIdFromDatabase(deps.db, params.userId);

	for (const file of files) {
		await startApiAdminDriveFileDeletion(deps, file);
	}
}

export async function handleApiAdminDriveFiles(
	deps: ApiAdminDriveDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'DriveFile'>[]> {
	const params = parseApiParams(adminDriveFilesParamDef, body);
	let sinceId = params.sinceId ?? null;
	let untilId = params.untilId ?? null;

	if (sinceId == null && untilId == null) {
		if (params.sinceDate) sinceId = genId(params.sinceDate);
		if (params.untilDate) untilId = genId(params.untilDate);
	}

	const files = await listDriveFilesForAdminFromDatabase(
		deps.db,
		omitUndefined({
			limit: params.limit,
			sinceId,
			untilId,
			userId: params.userId,
			type: params.type,
			origin: params.origin,
			hostname: params.hostname,
		}),
	);

	return await packAdminDriveFilesForApi(deps, files);
}

export async function handleApiAdminDriveShowFile(
	deps: ApiAdminDriveDependencies,
	me: MiUser,
	body: Record<string, unknown>,
): Promise<AdminDriveFileResponse> {
	const params = parseApiParams(adminDriveShowFileParamDef, body);
	const file =
		params.fileId !== undefined
			? await fetchDriveFileByIdFromDatabase(deps.db, params.fileId)
			: await fetchDriveFileByUrlFromDatabase(deps.db, params.url!);

	if (file == null) {
		throw noSuchFileError();
	}

	const owner = file.userId == null ? null : await fetchUserByIdOrFailFromDatabase(deps.db, file.userId);
	const [iAmModerator, ownerIsModerator] = await Promise.all([isApiModerator(deps, me), isApiModerator(deps, owner)]);

	return {
		id: file.id,
		userId: file.userId,
		userHost: file.userHost,
		isLink: file.isLink,
		maybePorn: file.maybePorn,
		maybeSensitive: file.maybeSensitive,
		isSensitive: file.isSensitive,
		folderId: file.folderId,
		src: file.src,
		uri: file.uri,
		webpublicAccessKey: file.webpublicAccessKey,
		thumbnailAccessKey: file.thumbnailAccessKey,
		accessKey: file.accessKey,
		webpublicType: file.webpublicType,
		webpublicUrl: file.webpublicUrl,
		thumbnailUrl: file.thumbnailUrl,
		url: file.url,
		storedInternal: file.storedInternal,
		properties: file.properties,
		blurhash: file.blurhash,
		comment: file.comment,
		size: file.size,
		type: file.type,
		name: file.name,
		md5: file.md5,
		createdAt: parseId(file.id).date.toISOString(),
		requestIp: iAmModerator ? file.requestIp : null,
		requestHeaders: iAmModerator && !ownerIsModerator ? file.requestHeaders : null,
	};
}
