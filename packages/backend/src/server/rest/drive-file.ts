/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getDriveFilePublicUrl } from '@/core/DriveFilePublicUrl.js';
import { fetchDriveFileByIdFromDatabase, fetchDriveFileByIdOrFailFromDatabase, listDriveFilesByIdsFromDatabase } from '@/core/DriveFileStore.js';
import type { Config } from '@/config.js';
import { deepClone } from '@/misc/clone.js';
import { parseId } from '@/misc/id/parse-id.js';
import { isMimeImage } from '@/misc/is-mime-image.js';
import type { Packed } from '@/misc/json-schema.js';
import { appendQuery, query } from '@/misc/prelude/url.js';
import { uniqueByKey } from '@/misc/unique-by-key.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import { packDriveFolderForHonoApi, packDriveFoldersManyForHonoApi, type HonoApiDriveDependencies } from './drive.js';
import { packUserLiteForHonoApi, packUserLiteManyForHonoApi, type UserPackingDependencies } from './user.js';

export type HonoApiDriveFileDependencies = HonoApiDriveDependencies & UserPackingDependencies;

type DriveFilePackOptions = {
	detail?: boolean;
	self?: boolean;
	withUser?: boolean;
};

function getProxiedUrl(config: Config, url: string, mode?: 'static' | 'avatar'): string {
	return appendQuery(
		`${config.media.proxyUrl}/${mode ?? 'image'}.webp`,
		query({
			url,
			...(mode ? { [mode]: '1' } : {}),
		}),
	);
}

function getExternalVideoThumbnailUrl(config: Config, url: string): string | null {
	if (config.media.videoThumbnailGeneratorUrl == null) return null;

	return appendQuery(
		`${config.media.videoThumbnailGeneratorUrl}/thumbnail.webp`,
		query({
			thumbnail: '1',
			url,
		}),
	);
}

function getPublicProperties(file: MiDriveFile): MiDriveFile['properties'] {
	if (file.properties.orientation != null) {
		const properties = deepClone(file.properties);
		if (file.properties.orientation >= 5) {
			[properties.width, properties.height] = [properties.height, properties.width];
		}
		properties.orientation = undefined;
		return properties;
	}

	return file.properties;
}

function getThumbnailUrl(deps: HonoApiDriveFileDependencies, file: MiDriveFile): string | null {
	if (file.type.startsWith('video')) {
		if (file.thumbnailUrl) return file.thumbnailUrl;

		return getExternalVideoThumbnailUrl(deps.config, file.webpublicUrl ?? file.url);
	} else if (file.uri != null && file.userHost != null && deps.config.media.externalProxyEnabled) {
		return getProxiedUrl(deps.config, file.uri, 'static');
	}

	if (file.uri != null && file.isLink && deps.meta.proxyRemoteFiles) {
		return getProxiedUrl(deps.config, file.uri, 'static');
	}

	const url = file.webpublicUrl ?? file.url;

	return file.thumbnailUrl ?? (isMimeImage(file.type, 'sharp-convertible-image') ? url : null);
}

export async function packDriveFileForHonoApi(
	deps: HonoApiDriveFileDependencies,
	src: MiDriveFile['id'] | MiDriveFile,
	options?: DriveFilePackOptions,
	hint?: {
		packedUser?: Packed<'UserLite'>;
		packedFolder?: Packed<'DriveFolder'>;
	},
): Promise<Packed<'DriveFile'> | null> {
	const opts = Object.assign({
		detail: false,
		self: false,
	}, options);

	const file = typeof src === 'object' ? src : await fetchDriveFileByIdFromDatabase(deps.db, src);
	if (file == null) return null;

	const folder = opts.detail && file.folderId
		? (hint?.packedFolder ?? await packDriveFolderForHonoApi(deps, file.folderId, { detail: true }))
		: null;
	const user = (opts.withUser && file.userId)
		? (hint?.packedUser ?? await packUserLiteForHonoApi(deps, file.userId))
		: null;

	return {
		id: file.id,
		createdAt: parseId(file.id).date.toISOString(),
		name: file.name,
		type: file.type,
		md5: file.md5,
		size: file.size,
		isSensitive: file.isSensitive,
		blurhash: file.blurhash,
		properties: opts.self ? file.properties : getPublicProperties(file),
		url: opts.self ? file.url : getDriveFilePublicUrl(file, deps),
		thumbnailUrl: getThumbnailUrl(deps, file),
		comment: file.comment,
		folderId: file.folderId,
		folder,
		userId: file.userId,
		user,
	};
}

export async function packDriveFileOrFailForHonoApi(
	deps: HonoApiDriveFileDependencies,
	src: MiDriveFile['id'] | MiDriveFile,
	options?: DriveFilePackOptions,
): Promise<Packed<'DriveFile'>> {
	const file = typeof src === 'object' ? src : await fetchDriveFileByIdOrFailFromDatabase(deps.db, src);
	const packed = await packDriveFileForHonoApi(deps, file, options);
	if (packed == null) throw new Error(`DriveFile not found: ${typeof src === 'object' ? src.id : src}`);
	return packed;
}

export async function packDriveFileManyForHonoApi(
	deps: HonoApiDriveFileDependencies,
	files: MiDriveFile[],
	options?: DriveFilePackOptions,
): Promise<Packed<'DriveFile'>[]> {
	let userMap: Map<string, Packed<'UserLite'>> | null = null;
	let folderMap: Map<string, Packed<'DriveFolder'>> | null = null;
	if (options?.withUser) {
		const userIds = uniqueByKey(files.map(f => f.userId).filter((id): id is string => id != null), id => id);
		const packedUsers = await packUserLiteManyForHonoApi(deps, userIds);
		userMap = new Map(packedUsers.map(user => [user.id, user]));
	}
	if (options?.detail) {
		const folderIds = uniqueByKey(files.map(f => f.folderId).filter((id): id is string => id != null), id => id);
		const packedFolders = await packDriveFoldersManyForHonoApi(deps, folderIds, { detail: true });
		folderMap = new Map(packedFolders.map(folder => [folder.id, folder]));
	}

	const items = await Promise.all(files.map(file => packDriveFileForHonoApi(deps, file, options, {
		packedUser: file.userId ? (userMap?.get(file.userId) ?? undefined) : undefined,
		packedFolder: file.folderId ? (folderMap?.get(file.folderId) ?? undefined) : undefined,
	})));

	return items.filter((item): item is Packed<'DriveFile'> => item != null);
}

export async function packDriveFileManyByIdsForHonoApi(
	deps: HonoApiDriveFileDependencies,
	fileIds: MiDriveFile['id'][],
	options?: DriveFilePackOptions,
): Promise<Packed<'DriveFile'>[]> {
	if (fileIds.length === 0) return [];
	const files = await listDriveFilesByIdsFromDatabase(deps.db, fileIds);
	const packedById = new Map((await packDriveFileManyForHonoApi(deps, files, options)).map(f => [f.id, f]));
	return fileIds.map(id => packedById.get(id)).filter((f): f is Packed<'DriveFile'> => f != null);
}
