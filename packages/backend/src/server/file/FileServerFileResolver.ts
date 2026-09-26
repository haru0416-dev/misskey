/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiDriveFile } from '@/models/_.js';
import { createTemp } from '@/misc/create-temp.js';
import type { DownloadService } from '@/core/net/DownloadService.js';
import type { FileInfoService } from '@/core/drive/FileInfoService.js';
import type { InternalStorageService } from '@/core/drive/InternalStorageService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { fetchDriveFileByAccessKeyFromDatabase } from '@/core/drive/DriveFileStore.js';

export type DownloadedFileResult = {
	kind: 'downloaded';
	mime: string;
	ext: string | null;
	path: string;
	cleanup: () => void;
	filename: string;
};

/** メディアプロキシが取得した画像。小さいものはメモリ上に置き、一時ファイルを作らない。 */
export type DownloadedBufferResult = {
	kind: 'downloaded-memory';
	mime: string;
	ext: string | null;
	data: Buffer;
	filename: string;
};

// 並行 6 本 (ブラウザの同時接続数) がすべて上限いっぱいでも 96MiB に収まる大きさ。
// リモートの写真はほとんど数 MB (Mastodon は 8.3MP の JPEG に再圧縮する) なので、超えるものだけ一時ファイルに逃がす。
const PROXY_MEMORY_LIMIT_BYTES = 16 * 1024 * 1024;

export type FileResolveResult =
	| { kind: 'not-found' }
	| { kind: 'unavailable' }
	| {
			kind: 'stored';
			fileRole: 'thumbnail' | 'webpublic' | 'original';
			file: MiDriveFile;
			filename: string;
			mime: string;
			ext: string | null;
			path: string;
	  }
	| {
			/** 保存していないリモートのファイル。中身は必要になった呼び出し元が取得する。mime は登録時に中身から判定した値。 */
			kind: 'remote';
			fileRole: 'thumbnail' | 'webpublic' | 'original';
			file: MiDriveFile;
			filename: string;
			url: string;
			mime: string;
	  };

export class FileServerFileResolver {
	constructor(
		private db: MiDrizzleDatabase,
		private fileInfoService: FileInfoService,
		private downloadService: DownloadService,
		private internalStorageService: InternalStorageService,
	) {}

	public async downloadAndDetectTypeFromUrl(url: string): Promise<DownloadedFileResult> {
		const [path, cleanup] = await createTemp();
		try {
			const { filename } = await this.downloadService.downloadUrl(url, path);

			const { mime, ext } = await this.fileInfoService.detectType(path);

			return {
				kind: 'downloaded',
				mime,
				ext,
				path,
				cleanup,
				filename,
			};
		} catch (e) {
			cleanup();
			throw e;
		}
	}

	public openRemoteStream(url: string, forwardHeaders: Record<string, string>) {
		return this.downloadService.openRemoteStream(url, forwardHeaders);
	}

	public async downloadForProxy(url: string): Promise<DownloadedFileResult | DownloadedBufferResult> {
		const downloaded = await this.downloadService.downloadUrlToMemoryOrFile(url, PROXY_MEMORY_LIMIT_BYTES);
		if ('path' in downloaded) {
			try {
				return { kind: 'downloaded', ...(await this.fileInfoService.detectType(downloaded.path)), ...downloaded };
			} catch (e) {
				downloaded.cleanup();
				throw e;
			}
		}
		return {
			kind: 'downloaded-memory',
			...(await this.fileInfoService.detectImageTypeFromBuffer(downloaded.data)),
			data: downloaded.data,
			filename: downloaded.filename,
		};
	}

	public async resolveFileByAccessKey(key: string): Promise<FileResolveResult> {
		const file = await fetchDriveFileByAccessKeyFromDatabase(this.db, key);

		if (file == null) {
			return { kind: 'not-found' };
		}

		const isThumbnail = file.thumbnailAccessKey === key;
		const isWebpublic = file.webpublicAccessKey === key;

		if (!file.storedInternal) {
			if (!(file.isLink && file.uri)) {
				return { kind: 'unavailable' };
			}
			return {
				kind: 'remote',
				url: file.uri,
				mime: file.type,
				fileRole: isThumbnail ? 'thumbnail' : isWebpublic ? 'webpublic' : 'original',
				file,
				filename: file.name,
			};
		}

		const path = this.internalStorageService.resolvePath(key);

		if (isThumbnail || isWebpublic) {
			const { mime, ext } = await this.fileInfoService.detectType(path);
			return {
				kind: 'stored',
				fileRole: isThumbnail ? 'thumbnail' : 'webpublic',
				file,
				filename: file.name,
				mime,
				ext,
				path,
			};
		}

		return {
			kind: 'stored',
			fileRole: 'original',
			file,
			filename: file.name,
			mime: file.type,
			ext: null,
			path,
		};
	}
}
