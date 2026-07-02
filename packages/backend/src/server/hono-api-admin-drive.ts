/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fetchDriveFileByIdFromDatabase, fetchDriveFileByUrlFromDatabase, listAllDriveFilesByUserIdFromDatabase, listDriveFilesForAdminFromDatabase, listOrphanDriveFilesFromDatabase } from '@/core/DriveFileStore.js';
import { startDriveFileDeletion } from '@/core/DriveFileDeletionLogic.js';
import type { InternalStorageService } from '@/core/InternalStorageService.js';
import type { ObjectStorageQueue } from '@/core/QueueModule.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { isMimeImage } from '@/misc/is-mime-image.js';
import { appendQuery, query } from '@/misc/prelude/url.js';
import type { Packed, SchemaType } from '@/misc/json-schema.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiUser } from '@/models/User.js';
import { packDriveFolderForHonoApi } from './hono-api-drive.js';
import { packUserLiteManyForHonoApi } from './hono-api-user.js';
import type { HonoApiDriveStreamPublisher } from './hono-api-events.js';
import type { HonoApiRolePolicyDependencies } from './hono-api-role-policy.js';
import { isHonoApiModerator } from './hono-api-role-policy.js';
import { HonoApiError } from './hono-api-error.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiAdminDriveDependencies = HonoApiRolePolicyDependencies & {
	internalStorageService: Pick<InternalStorageService, 'del'>;
	objectStorageQueue: ObjectStorageQueue;
	publishDriveStream?: HonoApiDriveStreamPublisher;
};

const adminDriveNoParamsDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

const adminDriveUserParamDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

const adminDriveShowFileParamDef = {
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

const adminDriveFilesParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		userId: { type: 'string', format: 'misskey:id', nullable: true },
		type: { type: 'string', nullable: true, pattern: /^[a-zA-Z0-9\/\-*]+$/.toString().slice(1, -1) },
		origin: { type: 'string', enum: ['combined', 'local', 'remote'], default: 'local' },
		hostname: {
			type: 'string',
			nullable: true,
			default: null,
			description: 'The local host is represented with `null`.',
		},
	},
	required: [],
} as const;

type AdminDriveShowFileParams = SchemaType<typeof adminDriveShowFileParamDef> & (
	| { fileId: string }
	| { url: string }
);
type AdminDriveFilesParams = SchemaType<typeof adminDriveFilesParamDef> & {
	origin: 'combined' | 'local' | 'remote';
	hostname: string | null;
};
type AdminDriveUserParams = SchemaType<typeof adminDriveUserParamDef>;

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

function noSuchFileError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such file.',
		code: 'NO_SUCH_FILE',
		id: 'caf3ca38-c6e5-472e-a30c-b05377dcc240',
	});
}

function getProxiedUrl(deps: HonoApiAdminDriveDependencies, url: string, mode?: 'static' | 'avatar'): string {
	return appendQuery(
		`${deps.config.mediaProxy}/${mode ?? 'image'}.webp`,
		query({
			url,
			...(mode ? { [mode]: '1' } : {}),
		}),
	);
}

function getExternalVideoThumbnailUrl(deps: HonoApiAdminDriveDependencies, url: string): string | null {
	if (deps.config.videoThumbnailGenerator == null) return null;

	return appendQuery(
		`${deps.config.videoThumbnailGenerator}/thumbnail.webp`,
		query({
			thumbnail: '1',
			url,
		}),
	);
}

function getAdminDriveFileThumbnailUrl(deps: HonoApiAdminDriveDependencies, file: MiDriveFile): string | null {
	if (file.type.startsWith('video')) {
		if (file.thumbnailUrl) return file.thumbnailUrl;

		return getExternalVideoThumbnailUrl(deps, file.webpublicUrl ?? file.url);
	} else if (file.uri != null && file.userHost != null && deps.config.externalMediaProxyEnabled) {
		return getProxiedUrl(deps, file.uri, 'static');
	}

	if (file.uri != null && file.isLink && deps.meta.proxyRemoteFiles) {
		return getProxiedUrl(deps, file.uri, 'static');
	}

	const url = file.webpublicUrl ?? file.url;

	return file.thumbnailUrl ?? (isMimeImage(file.type, 'sharp-convertible-image') ? url : null);
}

function enqueueDeleteObjectStorageFile(queue: ObjectStorageQueue, key: string): unknown {
	return queue.add('deleteFile', { key }, {
		removeOnComplete: {
			age: 3600 * 24 * 7,
			count: 30,
		},
		removeOnFail: {
			age: 3600 * 24 * 7,
			count: 100,
		},
	});
}

export function startHonoApiAdminDriveFileDeletion(
	deps: HonoApiAdminDriveDependencies,
	file: MiDriveFile,
): void {
	startDriveFileDeletion({
		db: deps.db,
		meta: deps.meta,
		deleteInternalFile: key => deps.internalStorageService.del(key),
		enqueueDeleteObjectStorageFile: key => enqueueDeleteObjectStorageFile(deps.objectStorageQueue, key),
		publishDriveStream: deps.publishDriveStream,
	}, file);
}

async function packAdminDriveFilesForHonoApi(
	deps: HonoApiAdminDriveDependencies,
	files: MiDriveFile[],
): Promise<Packed<'DriveFile'>[]> {
	const userRefs = files.map(({ user, userId }) => user ?? userId).filter(x => x != null);
	const uniqueUserRefs = Array.from(new Map(userRefs.map(user => [typeof user === 'string' ? user : user.id, user])).values());
	const packedUsers = uniqueUserRefs.length > 0 ? await packUserLiteManyForHonoApi(deps, uniqueUserRefs) : [];
	const userMap = new Map(packedUsers.map(user => [user.id, user]));

	const folderRefs = files.map(({ folder, folderId }) => folder ?? folderId).filter(x => x != null);
	const uniqueFolderRefs = Array.from(new Map(folderRefs.map(folder => [typeof folder === 'string' ? folder : folder.id, folder])).values());
	const packedFolders = await Promise.all(uniqueFolderRefs.map(folder => packDriveFolderForHonoApi(deps, folder, { detail: true })));
	const folderMap = new Map(packedFolders.map(folder => [folder.id, folder]));

	return files.map(file => ({
		id: file.id,
		createdAt: parseId(deps.config, file.id).date.toISOString(),
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
		folder: file.folderId == null ? null : folderMap.get(file.folderId) ?? null,
		userId: file.userId,
		user: file.userId == null ? null : userMap.get(file.userId) ?? null,
	}));
}

export async function handleHonoApiAdminDriveCleanRemoteFiles(
	deps: HonoApiAdminDriveDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	parseHonoApiParams(adminDriveNoParamsDef, body);

	await deps.objectStorageQueue.add('cleanRemoteFiles', {}, {
		removeOnComplete: {
			age: 3600 * 24 * 7,
			count: 30,
		},
		removeOnFail: {
			age: 3600 * 24 * 7,
			count: 100,
		},
	});
}

export async function handleHonoApiAdminDriveCleanup(
	deps: HonoApiAdminDriveDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	parseHonoApiParams(adminDriveNoParamsDef, body);
	const files = await listOrphanDriveFilesFromDatabase(deps.db);

	for (const file of files) {
		startHonoApiAdminDriveFileDeletion(deps, file);
	}
}

export async function handleHonoApiAdminDeleteAllFilesOfAUser(
	deps: HonoApiAdminDriveDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminDriveUserParamDef, body) as AdminDriveUserParams;
	const files = await listAllDriveFilesByUserIdFromDatabase(deps.db, params.userId);

	for (const file of files) {
		startHonoApiAdminDriveFileDeletion(deps, file);
	}
}

export async function handleHonoApiAdminDriveFiles(
	deps: HonoApiAdminDriveDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'DriveFile'>[]> {
	const params = parseHonoApiParams(adminDriveFilesParamDef, body) as AdminDriveFilesParams;
	let sinceId = params.sinceId ?? null;
	let untilId = params.untilId ?? null;

	if (sinceId == null && untilId == null) {
		if (params.sinceDate) sinceId = genId(deps.config, params.sinceDate);
		if (params.untilDate) untilId = genId(deps.config, params.untilDate);
	}

	const files = await listDriveFilesForAdminFromDatabase(deps.db, {
		limit: params.limit,
		sinceId,
		untilId,
		userId: params.userId,
		type: params.type,
		origin: params.origin,
		hostname: params.hostname,
	});

	return await packAdminDriveFilesForHonoApi(deps, files);
}

export async function handleHonoApiAdminDriveShowFile(
	deps: HonoApiAdminDriveDependencies,
	me: MiUser,
	body: Record<string, unknown>,
): Promise<AdminDriveFileResponse> {
	const params = parseHonoApiParams(adminDriveShowFileParamDef, body) as AdminDriveShowFileParams;
	const file = 'fileId' in params
		? await fetchDriveFileByIdFromDatabase(deps.db, params.fileId)
		: await fetchDriveFileByUrlFromDatabase(deps.db, params.url);

	if (file == null) {
		throw noSuchFileError();
	}

	const owner = file.userId == null ? null : await fetchUserByIdOrFailFromDatabase(deps.db, file.userId);
	const [iAmModerator, ownerIsModerator] = await Promise.all([
		isHonoApiModerator(deps, me),
		isHonoApiModerator(deps, owner),
	]);

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
		createdAt: parseId(deps.config, file.id).date.toISOString(),
		requestIp: iAmModerator ? file.requestIp : null,
		requestHeaders: iAmModerator && !ownerIsModerator ? file.requestHeaders : null,
	};
}
