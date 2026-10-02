/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { DownloadService } from '@/core/net/download-service.js';
import type { InternalStorageService } from '@/core/drive/internal-storage-service.js';
import { createTemp } from '@/misc/create-temp.js';

export type DriveFileContentDependencies = {
	internalStorageService: Pick<InternalStorageService, 'resolvePath'>;
	downloadService: Pick<DownloadService, 'downloadUrl'>;
};

/**
 * 内部ストレージの原本が特定できる場合は直接読み、それ以外は file.url から一時ファイルへ取得する。
 * fn が完了するまで一時ファイルを保持し、成功・失敗にかかわらず削除する。
 * 公開 URL を自分で取得すると、自分の URL に自分から届かない環境 (ルーターがヘアピン接続しない自宅など) で失敗する。
 */
export async function withDriveFileContent<T>(
	deps: DriveFileContentDependencies,
	file: Pick<MiDriveFile, 'storedInternal' | 'accessKey' | 'url'>,
	fn: (path: string) => Promise<T>,
): Promise<T> {
	if (file.storedInternal && file.accessKey != null) {
		return await fn(deps.internalStorageService.resolvePath(file.accessKey));
	}
	const [path, cleanup] = await createTemp();
	try {
		await deps.downloadService.downloadUrl(file.url, path);
		return await fn(path);
	} finally {
		cleanup();
	}
}

export function readDriveFileText(
	deps: DriveFileContentDependencies,
	file: Pick<MiDriveFile, 'storedInternal' | 'accessKey' | 'url'>,
): Promise<string> {
	return withDriveFileContent(deps, file, (path) => fs.promises.readFile(path, 'utf8'));
}

export function readDriveFileBuffer(
	deps: DriveFileContentDependencies,
	file: Pick<MiDriveFile, 'storedInternal' | 'accessKey' | 'url'>,
): Promise<Buffer> {
	return withDriveFileContent(deps, file, (path) => fs.promises.readFile(path));
}
