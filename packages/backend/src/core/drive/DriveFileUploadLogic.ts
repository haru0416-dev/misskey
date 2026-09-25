/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Sharp } from 'sharp';
import { sharpBmp } from '@misskey-dev/sharp-read-bmp';
import { FILE_TYPE_BROWSERSAFE } from '@/const.js';
import type { Config } from '@/config.js';
import { createDriveFileInDatabase } from '@/core/drive/DriveFileStore.js';
import type { DownloadService } from '@/core/net/DownloadService.js';
import type { FileInfoService } from '@/core/drive/FileInfoService.js';
import type { IImage, ImageProcessingService } from '@/core/drive/ImageProcessingService.js';
import type { InternalStorageService } from '@/core/drive/InternalStorageService.js';
import type { S3PutObject, S3Service } from '@/core/drive/S3Service.js';
import type { VideoProcessingService } from '@/core/drive/VideoProcessingService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { validateDriveFileName } from '@/core/drive/drive-file-name.js';
import { contentDisposition } from '@/misc/content-disposition.js';
import { correctFilename } from '@/misc/correct-filename.js';
import { createTemp } from '@/misc/create-temp.js';
import { genId } from '@/misc/id/gen-id.js';
import { isMimeImage } from '@/misc/is-mime-image.js';
import type Logger from '@/logger.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import type { MiMeta } from '@/models/_.js';

export type DriveFileUploadDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	downloadService: Pick<DownloadService, 'downloadUrl'>;
	fileInfoService: Pick<FileInfoService, 'getFileInfo'>;
	imageProcessingService: Pick<ImageProcessingService, 'convertSharpToPng' | 'convertSharpToWebp'>;
	internalStorageService: Pick<InternalStorageService, 'saveFromBuffer' | 'saveFromPath'>;
	s3Service: Pick<S3Service, 'upload'>;
	videoProcessingService: Pick<VideoProcessingService, 'generateVideoThumbnail'>;
	logger?: Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;
};

type DriveFileAltsDependencies = Pick<
	DriveFileUploadDependencies,
	'config' | 'imageProcessingService' | 'videoProcessingService' | 'logger'
>;

export function driveSensitiveMediaThreshold(meta: Pick<MiMeta, 'sensitiveMediaDetectionSensitivity'>): number {
	return meta.sensitiveMediaDetectionSensitivity === 'veryHigh'
		? 0.1
		: meta.sensitiveMediaDetectionSensitivity === 'high'
			? 0.3
			: meta.sensitiveMediaDetectionSensitivity === 'low'
				? 0.7
				: meta.sensitiveMediaDetectionSensitivity === 'veryLow'
					? 0.9
					: 0.5;
}

export async function generateDriveFileAlts(
	deps: DriveFileAltsDependencies,
	path: string,
	type: string,
	generateWeb: boolean,
): Promise<{
	webpublic: IImage | null;
	thumbnail: IImage | null;
}> {
	if (type.startsWith('video/')) {
		if (deps.config.media.videoThumbnailGeneratorUrl != null) {
			return {
				webpublic: null,
				thumbnail: null,
			};
		}

		try {
			const thumbnail = await deps.videoProcessingService.generateVideoThumbnail(path);
			return {
				webpublic: null,
				thumbnail,
			};
		} catch (err) {
			deps.logger?.warn(`GenerateVideoThumbnail failed: ${err}`);
			return {
				webpublic: null,
				thumbnail: null,
			};
		}
	}

	if (!isMimeImage(type, 'sharp-convertible-image-with-bmp')) {
		deps.logger?.debug('web image and thumbnail not created (cannot convert by sharp)');
		return {
			webpublic: null,
			thumbnail: null,
		};
	}

	let img: Sharp | null = null;
	let satisfyWebpublic: boolean;
	let isAnimated: boolean;

	try {
		img = await sharpBmp(path, type);
		const metadata = await img.metadata();
		isAnimated = !!(metadata.pages && metadata.pages > 1);

		satisfyWebpublic = !!(
			type !== 'image/svg+xml' &&
			type !== 'image/avif' &&
			!(metadata.exif ?? metadata.iptc ?? metadata.xmp ?? metadata.tifftagPhotoshop) &&
			metadata.width &&
			metadata.width <= 2048 &&
			metadata.height &&
			metadata.height <= 2048
		);
	} catch (err) {
		deps.logger?.warn(`sharp failed: ${err}`);
		return {
			webpublic: null,
			thumbnail: null,
		};
	}

	let webpublic: IImage | null = null;

	if (generateWeb && !satisfyWebpublic && !isAnimated) {
		deps.logger?.info('creating web image');

		try {
			if (['image/jpeg', 'image/webp', 'image/avif'].includes(type)) {
				webpublic = await deps.imageProcessingService.convertSharpToWebp(img, 2048, 2048);
			} else if (['image/png', 'image/bmp', 'image/svg+xml'].includes(type)) {
				webpublic = await deps.imageProcessingService.convertSharpToPng(img, 2048, 2048);
			} else {
				deps.logger?.debug('web image not created (not an required image)');
			}
		} catch (err) {
			deps.logger?.warn('web image not created (an error occurred)', { e: err });
		}
	} else {
		if (satisfyWebpublic) {
			deps.logger?.info('web image not created (original satisfies webpublic)');
		} else if (isAnimated) {
			deps.logger?.info('web image not created (animated image)');
		} else {
			deps.logger?.info('web image not created (from remote)');
		}
	}

	let thumbnail: IImage | null = null;

	try {
		if (isAnimated) {
			thumbnail = await deps.imageProcessingService.convertSharpToWebp(sharp(path, { animated: true }), 374, 317, {
				alphaQuality: 70,
			});
		} else {
			thumbnail = await deps.imageProcessingService.convertSharpToWebp(img, 498, 422);
		}
	} catch (err) {
		deps.logger?.warn('thumbnail not created (an error occurred)', { e: err });
	}

	return {
		webpublic,
		thumbnail,
	};
}

type ObjectStorageMeta = Pick<
	MiMeta,
	| 'objectStorageBaseUrl'
	| 'objectStorageUseSSL'
	| 'objectStorageEndpoint'
	| 'objectStoragePort'
	| 'objectStorageBucket'
	| 'objectStoragePrefix'
>;

// 拡張子はブラウザで安全に開ける型のときだけ付ける。それ以外はオブジェクトストレージ上で拡張子なしにする。
function resolveObjectStorageLocation(
	meta: ObjectStorageMeta,
	name: string,
	type: string,
): { baseUrl: string; prefix: string; key: string; url: string } {
	let [ext] = name.match(/\.([a-zA-Z0-9_-]+)$/) ?? [''];

	if (ext === '') {
		if (type === 'image/jpeg') {
			ext = '.jpg';
		}
		if (type === 'image/png') {
			ext = '.png';
		}
		if (type === 'image/webp') {
			ext = '.webp';
		}
		if (type === 'image/avif') {
			ext = '.avif';
		}
		if (type === 'image/apng') {
			ext = '.apng';
		}
		if (type === 'image/vnd.mozilla.apng') {
			ext = '.apng';
		}
	}

	if (!FILE_TYPE_BROWSERSAFE.includes(type)) {
		ext = '';
	}

	const baseUrl =
		meta.objectStorageBaseUrl ??
		`${meta.objectStorageUseSSL ? 'https' : 'http'}://${meta.objectStorageEndpoint}${meta.objectStoragePort ? `:${meta.objectStoragePort}` : ''}/${meta.objectStorageBucket}`;
	const prefix = meta.objectStoragePrefix ? `${meta.objectStoragePrefix}/` : '';
	const key = `${prefix}${randomUUID()}${ext}`;
	return { baseUrl, prefix, key, url: `${baseUrl}/${key}` };
}

export function buildObjectStoragePutObject(
	meta: Pick<MiMeta, 'objectStorageSetPublicRead'>,
	key: string,
	body: Blob | Uint8Array,
	type: string,
	ext: string | null | undefined,
	filename: string | undefined,
): S3PutObject {
	let contentType = type;
	if (contentType === 'image/apng') {
		contentType = 'image/png';
	}
	if (!FILE_TYPE_BROWSERSAFE.includes(contentType)) {
		contentType = 'application/octet-stream';
	}

	return {
		key,
		body,
		contentType,
		...(filename == null
			? {}
			: { contentDisposition: contentDisposition('inline', ext ? correctFilename(filename, ext) : filename) }),
		publicRead: meta.objectStorageSetPublicRead,
	};
}

async function uploadObjectStorageFile(
	deps: DriveFileUploadDependencies,
	key: string,
	stream: Blob | Uint8Array,
	type: string,
	ext?: string | null,
	filename?: string,
): Promise<void> {
	const object = buildObjectStoragePutObject(deps.meta, key, stream, type, ext, filename);

	try {
		await deps.s3Service.upload(deps.meta, object);
		deps.logger?.debug(`Uploaded: ${deps.meta.objectStorageBucket}/${key}`);
	} catch (err) {
		deps.logger?.error(`Upload Failed: key = ${key}, filename = ${filename}`, { e: err as Error });
	}
}

type DriveFileStorageLocation = {
	storedInternal: boolean;
	url: string;
	thumbnailUrl: string | null;
	webpublicUrl: string | null;
	accessKey: string;
	thumbnailAccessKey: string | null;
	webpublicAccessKey: string | null;
};

type ObjectStorageUpload = {
	label: 'original' | 'webpublic' | 'thumbnail';
	key: string;
	body: Blob | Uint8Array;
	type: string;
	ext: string | null;
	filename: string;
};

type DriveFileAlts = { webpublic: IImage | null; thumbnail: IImage | null };

// キーと URL を決めるだけで送信はしない。送信失敗の扱いは呼び出し側で異なる。
export function planObjectStorageUploads(
	meta: ObjectStorageMeta,
	path: string,
	name: string,
	type: string,
	alts: DriveFileAlts,
): { location: DriveFileStorageLocation; uploads: ObjectStorageUpload[] } {
	const { baseUrl, prefix, key, url } = resolveObjectStorageLocation(meta, name, type);
	const location: DriveFileStorageLocation = {
		storedInternal: false,
		url,
		thumbnailUrl: null,
		webpublicUrl: null,
		accessKey: key,
		thumbnailAccessKey: null,
		webpublicAccessKey: null,
	};
	const uploads: ObjectStorageUpload[] = [
		{ label: 'original', key, body: Bun!.file(path), type, ext: null, filename: name },
	];

	if (alts.webpublic) {
		const webpublicKey = `${prefix}webpublic-${randomUUID()}.${alts.webpublic.ext}`;
		location.webpublicAccessKey = webpublicKey;
		location.webpublicUrl = `${baseUrl}/${webpublicKey}`;
		uploads.push({
			label: 'webpublic',
			key: webpublicKey,
			body: alts.webpublic.data,
			type: alts.webpublic.type,
			ext: alts.webpublic.ext,
			filename: name,
		});
	}

	if (alts.thumbnail) {
		const thumbnailKey = `${prefix}thumbnail-${randomUUID()}.${alts.thumbnail.ext}`;
		location.thumbnailAccessKey = thumbnailKey;
		location.thumbnailUrl = `${baseUrl}/${thumbnailKey}`;
		uploads.push({
			label: 'thumbnail',
			key: thumbnailKey,
			body: alts.thumbnail.data,
			type: alts.thumbnail.type,
			ext: alts.thumbnail.ext,
			filename: `${name}.thumbnail`,
		});
	}

	return { location, uploads };
}

// 生成されなかった派生画像のアクセスキーも DriveFile には記録する (既存行と同じ形)。
// savedKeys は実際に書き込んだキーだけを持ち、失敗時の後始末に使う。
export function saveDriveFileToInternalStorage(
	deps: Pick<DriveFileUploadDependencies, 'internalStorageService' | 'logger'>,
	path: string,
	alts: DriveFileAlts,
): { location: DriveFileStorageLocation; savedKeys: string[] } {
	const accessKey = randomUUID();
	const thumbnailAccessKey = 'thumbnail-' + randomUUID();
	const webpublicAccessKey = 'webpublic-' + randomUUID();
	const url = deps.internalStorageService.saveFromPath(accessKey, path);
	const savedKeys: string[] = [accessKey];

	let thumbnailUrl: string | null = null;
	let webpublicUrl: string | null = null;

	if (alts.thumbnail) {
		thumbnailUrl = deps.internalStorageService.saveFromBuffer(thumbnailAccessKey, alts.thumbnail.data);
		savedKeys.push(thumbnailAccessKey);
		deps.logger?.info(`thumbnail stored: ${thumbnailAccessKey}`);
	}

	if (alts.webpublic) {
		webpublicUrl = deps.internalStorageService.saveFromBuffer(webpublicAccessKey, alts.webpublic.data);
		savedKeys.push(webpublicAccessKey);
		deps.logger?.info(`web stored: ${webpublicAccessKey}`);
	}

	return {
		location: {
			storedInternal: true,
			url,
			thumbnailUrl,
			webpublicUrl,
			accessKey,
			thumbnailAccessKey,
			webpublicAccessKey,
		},
		savedKeys,
	};
}

export function applyDriveFileStorage(
	file: MiDriveFile,
	location: DriveFileStorageLocation,
	alts: DriveFileAlts,
	content: { name: string; type: string; md5: string; size: number },
): void {
	file.storedInternal = location.storedInternal;
	file.url = location.url;
	file.thumbnailUrl = location.thumbnailUrl;
	file.webpublicUrl = location.webpublicUrl;
	file.accessKey = location.accessKey;
	file.thumbnailAccessKey = location.thumbnailAccessKey;
	file.webpublicAccessKey = location.webpublicAccessKey;
	file.webpublicType = alts.webpublic?.type ?? null;
	file.name = content.name;
	file.type = content.type;
	file.md5 = content.md5;
	file.size = content.size;
}

async function saveSystemDriveFile(
	deps: DriveFileUploadDependencies,
	file: MiDriveFile,
	path: string,
	name: string,
	type: string,
	hash: string,
	size: number,
): Promise<MiDriveFile> {
	const alts = await generateDriveFileAlts(deps, path, type, !file.uri);

	const content = { name, type, md5: hash, size };

	if (deps.meta.useObjectStorage) {
		const { location, uploads } = planObjectStorageUploads(deps.meta, path, name, type, alts);
		await Promise.all(
			uploads.map((upload) => {
				deps.logger?.info(`uploading ${upload.label}: ${upload.key}`);
				return uploadObjectStorageFile(deps, upload.key, upload.body, upload.type, upload.ext, upload.filename);
			}),
		);
		applyDriveFileStorage(file, location, alts, content);
		return await createDriveFileInDatabase(deps.db, file);
	}

	const { location } = saveDriveFileToInternalStorage(deps, path, alts);
	applyDriveFileStorage(file, location, alts, content);
	return await createDriveFileInDatabase(deps.db, file);
}

export async function uploadSystemDriveFileFromUrl(
	deps: DriveFileUploadDependencies,
	url: string,
): Promise<MiDriveFile> {
	const [path, cleanup] = await createTemp();

	try {
		const { filename: name } = await deps.downloadService.downloadUrl(url, path);
		const info = await deps.fileInfoService.getFileInfo(path, {
			fileName: name,
			skipSensitiveDetection: true,
			sensitiveThreshold: driveSensitiveMediaThreshold(deps.meta),
			sensitiveThresholdForPorn: 0.75,
			enableSensitiveMediaDetectionForVideos: deps.meta.enableSensitiveMediaDetectionForVideos,
		});
		deps.logger?.info(`${JSON.stringify(info)}`);

		const detectedName = correctFilename(name && validateDriveFileName(name) ? name : 'untitled', info.type.ext);

		const properties: MiDriveFile['properties'] = {};
		if (info.width != null && info.height != null) {
			properties.width = info.width;
			properties.height = info.height;
		}
		if (info.orientation != null) {
			properties.orientation = info.orientation;
		}

		const file = new MiDriveFile();
		file.id = genId();
		file.userId = null;
		file.userHost = null;
		file.folderId = null;
		file.comment = null;
		file.properties = properties;
		file.blurhash = info.blurhash ?? null;
		file.isLink = false;
		file.requestIp = null;
		file.requestHeaders = null;
		file.maybeSensitive = info.sensitive;
		file.maybePorn = info.porn;
		file.isSensitive = false;
		file.src = url;
		file.uri = null;

		const driveFile = await saveSystemDriveFile(deps, file, path, detectedName, info.type.mime, info.md5, info.size);
		deps.logger?.info(`drive file has been created ${driveFile.id}`);
		return driveFile;
	} catch (err) {
		deps.logger?.error(`Failed to create drive file: ${err}`, { url, e: err });
		throw err;
	} finally {
		cleanup();
	}
}
