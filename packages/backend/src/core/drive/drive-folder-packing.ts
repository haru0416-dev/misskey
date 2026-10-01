/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import {
	countDriveFilesByFolderIdFromDatabase,
	countDriveFilesGroupedByFolderIdsFromDatabase,
} from '@/core/drive/DriveFileStore.js';
import {
	countChildDriveFoldersGroupedByParentIdsFromDatabase,
	countDriveFoldersByParentIdFromDatabase,
	fetchDriveFolderByIdOrFailFromDatabase,
	listDriveFoldersByIdsFromDatabase,
} from '@/core/drive/DriveFolderStore.js';
import type { DriveFolderRow } from '@/db/schema/drive-folder.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import type { DriveStreamPublisher } from '../events.js';

export type DriveDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	publishDriveStream?: DriveStreamPublisher;
};

export type PackedDriveFolder = Packed<'DriveFolder'>;

function packDriveFolderBase(folder: DriveFolderRow): PackedDriveFolder {
	return {
		id: folder.id,
		createdAt: parseId(folder.id).date.toISOString(),
		name: folder.name,
		parentId: folder.parentId,
	};
}

async function resolveDriveFolders(
	deps: DriveDependencies,
	srcs: (DriveFolderRow['id'] | DriveFolderRow)[],
): Promise<DriveFolderRow[]> {
	const folderById = new Map<DriveFolderRow['id'], DriveFolderRow>();
	const ids: DriveFolderRow['id'][] = [];

	for (const src of srcs) {
		if (typeof src === 'object') {
			folderById.set(src.id, src);
		} else if (!folderById.has(src)) {
			ids.push(src);
		}
	}

	for (const folder of await listDriveFoldersByIdsFromDatabase(deps.db, [...new Set(ids)])) {
		folderById.set(folder.id, folder);
	}

	return await Promise.all(
		srcs.map(async (src) => {
			if (typeof src === 'object') {
				return src;
			}
			return folderById.get(src) ?? (await fetchDriveFolderByIdOrFailFromDatabase(deps.db, src));
		}),
	);
}

export async function packDriveFolder(
	deps: DriveDependencies,
	src: DriveFolderRow['id'] | DriveFolderRow,
	options?: {
		detail: boolean;
	},
	/** detail で親をたどるときに通ったフォルダ。既存の循環に行き当たったらそこで親の展開をやめる。 */
	descendantIds: ReadonlySet<DriveFolderRow['id']> = new Set(),
): Promise<PackedDriveFolder> {
	const opts = {
		detail: false,
		...options,
	};
	const folder = typeof src === 'object' ? src : await fetchDriveFolderByIdOrFailFromDatabase(deps.db, src);

	const packed = packDriveFolderBase(folder);

	if (!opts.detail) {
		return packed;
	}

	const [foldersCount, filesCount, parent] = await Promise.all([
		countDriveFoldersByParentIdFromDatabase(deps.db, folder.id),
		countDriveFilesByFolderIdFromDatabase(deps.db, folder.id),
		folder.parentId == null || folder.parentId === folder.id || descendantIds.has(folder.parentId)
			? Promise.resolve(undefined)
			: packDriveFolder(deps, folder.parentId, { detail: true }, new Set([...descendantIds, folder.id])),
	]);

	return {
		...packed,
		foldersCount,
		filesCount,
		...(parent == null ? {} : { parent }),
	};
}

export async function packDriveFoldersMany(
	deps: DriveDependencies,
	srcs: (DriveFolderRow['id'] | DriveFolderRow)[],
	options?: {
		detail: boolean;
	},
): Promise<PackedDriveFolder[]> {
	const opts = {
		detail: false,
		...options,
	};
	const folders = await resolveDriveFolders(deps, srcs);

	if (!opts.detail) {
		return folders.map((folder) => packDriveFolderBase(folder));
	}

	// 祖先を階層ごとにまとめて読む。読んだ行は覚えておくので、既存の循環があっても読み込みは終わる。
	const folderById = new Map(folders.map((folder) => [folder.id, folder]));
	for (
		let missing = [...new Set(folders.map((folder) => folder.parentId))].filter(
			(id): id is DriveFolderRow['id'] => id != null && !folderById.has(id),
		);
		missing.length > 0;
	) {
		const parents = await listDriveFoldersByIdsFromDatabase(deps.db, missing);
		for (const parent of parents) {
			folderById.set(parent.id, parent);
		}
		missing = [...new Set(parents.map((parent) => parent.parentId))].filter(
			(id): id is DriveFolderRow['id'] => id != null && !folderById.has(id),
		);
	}

	const folderIds = [...folderById.keys()];
	const [folderCounts, fileCounts] = await Promise.all([
		countChildDriveFoldersGroupedByParentIdsFromDatabase(deps.db, folderIds),
		countDriveFilesGroupedByFolderIdsFromDatabase(deps.db, folderIds),
	]);
	const folderCountById = new Map(folderCounts.map((row) => [row.parentId, row.count]));
	const fileCountById = new Map(fileCounts.map((row) => [row.folderId, row.count]));

	// descendantIds はそのフォルダから下へたどってきた経路。親がその中にあれば循環なので、そこで展開をやめる。
	const build = (folder: DriveFolderRow, descendantIds: ReadonlySet<DriveFolderRow['id']>): PackedDriveFolder => {
		const parentRow =
			folder.parentId == null || folder.parentId === folder.id || descendantIds.has(folder.parentId)
				? undefined
				: folderById.get(folder.parentId);
		const parent = parentRow == null ? undefined : build(parentRow, new Set([...descendantIds, folder.id]));

		return {
			...packDriveFolderBase(folder),
			foldersCount: folderCountById.get(folder.id) ?? 0,
			filesCount: fileCountById.get(folder.id) ?? 0,
			...(parent == null ? {} : { parent }),
		};
	};

	return folders.map((folder) => build(folder, new Set()));
}
