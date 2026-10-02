/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getDriveFilePublicUrl, getProxiedUrl } from '@/core/drive/drive-file-public-url.js';
import {
	fetchDriveFileByIdFromDatabase,
	fetchDriveFileByIdOrFailFromDatabase,
	listDriveFilesByIdsFromDatabase,
} from '@/core/drive/drive-file-store.js';
import type { Config } from '@/config.js';
import { deepClone, omitUndefined } from '@/misc/clone.js';
import { parseId } from '@/misc/id/parse-id.js';
import { isMimeImage } from '@/misc/is-mime-image.js';
import type { Packed } from '@/misc/json-schema.js';
import { appendQuery, query } from '@/misc/prelude/url.js';
import { uniqueByKey } from '@/misc/unique-by-key.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import { packDriveFolder, packDriveFoldersMany } from './drive-folder-packing.js';
import type { DriveDependencies } from './drive-folder-packing.js';
import { packUserLite, packUserLiteMany } from '../user/user-packing.js';
import type { UserPackingDependencies } from '../user/user-packing.js';

export type DriveFileDependencies = DriveDependencies & UserPackingDependencies;

type DriveFilePackOptions = {
	detail?: boolean;
	self?: boolean;
	withUser?: boolean;
};

function getExternalVideoThumbnailUrl(config: Config, url: string): string | null {
	if (config.media.videoThumbnailGeneratorUrl == null) {
		return null;
	}

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
			const width = properties.width;
			const height = properties.height;
			if (height === undefined) {
				delete properties.width;
			} else {
				properties.width = height;
			}
			if (width === undefined) {
				delete properties.height;
			} else {
				properties.height = width;
			}
		}
		delete properties.orientation;
		return properties;
	}

	return file.properties;
}

function getThumbnailUrl(deps: DriveFileDependencies, file: MiDriveFile): string | null {
	if (file.type.startsWith('video')) {
		if (file.thumbnailUrl) {
			return file.thumbnailUrl;
		}

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

export async function packDriveFile(
	deps: DriveFileDependencies,
	src: MiDriveFile['id'] | MiDriveFile,
	options?: DriveFilePackOptions,
	hint?: {
		packedUser?: Packed<'UserLite'>;
		packedFolder?: Packed<'DriveFolder'>;
	},
): Promise<Packed<'DriveFile'> | null> {
	const opts = {
		detail: false,
		self: false,
		...options,
	};

	const file = typeof src === 'object' ? src : await fetchDriveFileByIdFromDatabase(deps.db, src);
	if (file == null) {
		return null;
	}

	const folder =
		opts.detail && file.folderId
			? (hint?.packedFolder ?? (await packDriveFolder(deps, file.folderId, { detail: true })))
			: null;
	const user = opts.withUser && file.userId ? (hint?.packedUser ?? (await packUserLite(deps, file.userId))) : null;

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

export async function packDriveFileOrFail(
	deps: DriveFileDependencies,
	src: MiDriveFile['id'] | MiDriveFile,
	options?: DriveFilePackOptions,
): Promise<Packed<'DriveFile'>> {
	const file = typeof src === 'object' ? src : await fetchDriveFileByIdOrFailFromDatabase(deps.db, src);
	const packed = await packDriveFile(deps, file, options);
	if (packed == null) {
		throw new Error(`DriveFile not found: ${typeof src === 'object' ? src.id : src}`);
	}
	return packed;
}

export async function packDriveFileMany(
	deps: DriveFileDependencies,
	files: MiDriveFile[],
	options?: DriveFilePackOptions,
): Promise<Packed<'DriveFile'>[]> {
	let userMap: Map<string, Packed<'UserLite'>> | null = null;
	let folderMap: Map<string, Packed<'DriveFolder'>> | null = null;
	if (options?.withUser) {
		const userIds = uniqueByKey(
			files.map((f) => f.userId).filter((id): id is string => id != null),
			(id) => id,
		);
		const packedUsers = await packUserLiteMany(deps, userIds);
		userMap = new Map(packedUsers.map((user) => [user.id, user]));
	}
	if (options?.detail) {
		const folderIds = uniqueByKey(
			files.map((f) => f.folderId).filter((id): id is string => id != null),
			(id) => id,
		);
		const packedFolders = await packDriveFoldersMany(deps, folderIds, { detail: true });
		folderMap = new Map(packedFolders.map((folder) => [folder.id, folder]));
	}

	const items = await Promise.all(
		files.map((file) =>
			packDriveFile(
				deps,
				file,
				options,
				omitUndefined({
					packedUser: file.userId ? (userMap?.get(file.userId) ?? undefined) : undefined,
					packedFolder: file.folderId ? (folderMap?.get(file.folderId) ?? undefined) : undefined,
				}),
			),
		),
	);

	return items.filter((item): item is Packed<'DriveFile'> => item != null);
}

export async function packDriveFileManyByIds(
	deps: DriveFileDependencies,
	fileIds: MiDriveFile['id'][],
	options?: DriveFilePackOptions,
): Promise<Packed<'DriveFile'>[]> {
	if (fileIds.length === 0) {
		return [];
	}
	const files = await listDriveFilesByIdsFromDatabase(deps.db, fileIds);
	const packedById = new Map((await packDriveFileMany(deps, files, options)).map((f) => [f.id, f]));
	return fileIds.map((id) => packedById.get(id)).filter((f): f is Packed<'DriveFile'> => f != null);
}
