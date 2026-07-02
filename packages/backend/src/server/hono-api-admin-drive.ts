/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fetchDriveFileByIdFromDatabase, fetchDriveFileByUrlFromDatabase } from '@/core/DriveFileStore.js';
import type { ObjectStorageQueue } from '@/core/QueueModule.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { SchemaType } from '@/misc/json-schema.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiUser } from '@/models/User.js';
import type { HonoApiRolePolicyDependencies } from './hono-api-role-policy.js';
import { isHonoApiModerator } from './hono-api-role-policy.js';
import { HonoApiError } from './hono-api-error.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiAdminDriveDependencies = HonoApiRolePolicyDependencies & {
	objectStorageQueue: ObjectStorageQueue;
};

const adminDriveNoParamsDef = {
	type: 'object',
	properties: {},
	required: [],
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

type AdminDriveShowFileParams = SchemaType<typeof adminDriveShowFileParamDef> & (
	| { fileId: string }
	| { url: string }
);

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
