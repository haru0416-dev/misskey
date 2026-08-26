/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import sharp from 'sharp';
import type { PutObjectCommandInput } from '@aws-sdk/client-s3';
import type { Sharp } from 'sharp';
import { sharpBmp } from '@misskey-dev/sharp-read-bmp';
import { FILE_TYPE_BROWSERSAFE } from '@/const.js';
import type { Config } from '@/config.js';
import { createDriveFileInDatabase } from '@/core/drive/DriveFileStore.js';
import type { DownloadService } from '@/core/net/DownloadService.js';
import type { FileInfoService } from '@/core/drive/FileInfoService.js';
import type { IImage, ImageProcessingService } from '@/core/drive/ImageProcessingService.js';
import type { InternalStorageService } from '@/core/drive/InternalStorageService.js';
import type { S3Service } from '@/core/drive/S3Service.js';
import type { VideoProcessingService } from '@/core/drive/VideoProcessingService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
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

function validateDriveFileName(name: string): boolean {
	return (
		name.trim().length > 0 && name.length <= 200 && !name.includes('\\') && !name.includes('/') && !name.includes('..')
	);
}

async function generateDriveFileAlts(
	deps: DriveFileUploadDependencies,
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
		if (satisfyWebpublic) deps.logger?.info('web image not created (original satisfies webpublic)');
		else if (isAnimated) deps.logger?.info('web image not created (animated image)');
		else deps.logger?.info('web image not created (from remote)');
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

async function uploadObjectStorageFile(
	deps: DriveFileUploadDependencies,
	key: string,
	stream: fs.ReadStream | Buffer,
	type: string,
	ext?: string | null,
	filename?: string,
): Promise<void> {
	let uploadType = type;
	if (uploadType === 'image/apng') uploadType = 'image/png';
	if (!FILE_TYPE_BROWSERSAFE.includes(uploadType)) uploadType = 'application/octet-stream';

	const params = {
		Bucket: deps.meta.objectStorageBucket,
		Key: key,
		Body: stream,
		ContentType: uploadType,
		CacheControl: 'max-age=31536000, immutable',
	} as PutObjectCommandInput;

	if (filename) {
		params.ContentDisposition = contentDisposition('inline', ext ? correctFilename(filename, ext) : filename);
	}
	if (deps.meta.objectStorageSetPublicRead) params.ACL = 'public-read';

	await deps.s3Service
		.upload(deps.meta, params)
		.then((result) => {
			if ('Bucket' in result) {
				deps.logger?.debug(`Uploaded: ${result.Bucket}/${result.Key} => ${result.Location}`);
			} else {
				deps.logger?.error(`Upload Result Aborted: key = ${key}, filename = ${filename}`);
			}
		})
		.catch((err) => {
			deps.logger?.error(`Upload Failed: key = ${key}, filename = ${filename}`, { e: err });
		});
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

	if (deps.meta.useObjectStorage) {
		let [ext] = name.match(/\.([a-zA-Z0-9_-]+)$/) ?? [''];

		if (ext === '') {
			if (type === 'image/jpeg') ext = '.jpg';
			if (type === 'image/png') ext = '.png';
			if (type === 'image/webp') ext = '.webp';
			if (type === 'image/avif') ext = '.avif';
			if (type === 'image/apng') ext = '.apng';
			if (type === 'image/vnd.mozilla.apng') ext = '.apng';
		}

		if (!FILE_TYPE_BROWSERSAFE.includes(type)) {
			ext = '';
		}

		const baseUrl =
			deps.meta.objectStorageBaseUrl ??
			`${deps.meta.objectStorageUseSSL ? 'https' : 'http'}://${deps.meta.objectStorageEndpoint}${deps.meta.objectStoragePort ? `:${deps.meta.objectStoragePort}` : ''}/${deps.meta.objectStorageBucket}`;
		const prefix = deps.meta.objectStoragePrefix ? `${deps.meta.objectStoragePrefix}/` : '';
		const key = `${prefix}${randomUUID()}${ext}`;
		const url = `${baseUrl}/${key}`;

		let webpublicKey: string | null = null;
		let webpublicUrl: string | null = null;
		let thumbnailKey: string | null = null;
		let thumbnailUrl: string | null = null;

		deps.logger?.info(`uploading original: ${key}`);
		const uploads = [uploadObjectStorageFile(deps, key, fs.createReadStream(path), type, null, name)];

		if (alts.webpublic) {
			webpublicKey = `${prefix}webpublic-${randomUUID()}.${alts.webpublic.ext}`;
			webpublicUrl = `${baseUrl}/${webpublicKey}`;
			deps.logger?.info(`uploading webpublic: ${webpublicKey}`);
			uploads.push(
				uploadObjectStorageFile(deps, webpublicKey, alts.webpublic.data, alts.webpublic.type, alts.webpublic.ext, name),
			);
		}

		if (alts.thumbnail) {
			thumbnailKey = `${prefix}thumbnail-${randomUUID()}.${alts.thumbnail.ext}`;
			thumbnailUrl = `${baseUrl}/${thumbnailKey}`;
			deps.logger?.info(`uploading thumbnail: ${thumbnailKey}`);
			uploads.push(
				uploadObjectStorageFile(
					deps,
					thumbnailKey,
					alts.thumbnail.data,
					alts.thumbnail.type,
					alts.thumbnail.ext,
					`${name}.thumbnail`,
				),
			);
		}

		await Promise.all(uploads);

		file.url = url;
		file.thumbnailUrl = thumbnailUrl;
		file.webpublicUrl = webpublicUrl;
		file.accessKey = key;
		file.thumbnailAccessKey = thumbnailKey;
		file.webpublicAccessKey = webpublicKey;
		file.webpublicType = alts.webpublic?.type ?? null;
		file.name = name;
		file.type = type;
		file.md5 = hash;
		file.size = size;
		file.storedInternal = false;

		return await createDriveFileInDatabase(deps.db, file);
	}

	const accessKey = randomUUID();
	const thumbnailAccessKey = 'thumbnail-' + randomUUID();
	const webpublicAccessKey = 'webpublic-' + randomUUID();
	const url = deps.internalStorageService.saveFromPath(accessKey, path);

	let thumbnailUrl: string | null = null;
	let webpublicUrl: string | null = null;

	if (alts.thumbnail) {
		thumbnailUrl = deps.internalStorageService.saveFromBuffer(thumbnailAccessKey, alts.thumbnail.data);
		deps.logger?.info(`thumbnail stored: ${thumbnailAccessKey}`);
	}

	if (alts.webpublic) {
		webpublicUrl = deps.internalStorageService.saveFromBuffer(webpublicAccessKey, alts.webpublic.data);
		deps.logger?.info(`web stored: ${webpublicAccessKey}`);
	}

	file.storedInternal = true;
	file.url = url;
	file.thumbnailUrl = thumbnailUrl;
	file.webpublicUrl = webpublicUrl;
	file.accessKey = accessKey;
	file.thumbnailAccessKey = thumbnailAccessKey;
	file.webpublicAccessKey = webpublicAccessKey;
	file.webpublicType = alts.webpublic?.type ?? null;
	file.name = name;
	file.type = type;
	file.md5 = hash;
	file.size = size;

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
			sensitiveThreshold:
				deps.meta.sensitiveMediaDetectionSensitivity === 'veryHigh'
					? 0.1
					: deps.meta.sensitiveMediaDetectionSensitivity === 'high'
						? 0.3
						: deps.meta.sensitiveMediaDetectionSensitivity === 'low'
							? 0.7
							: deps.meta.sensitiveMediaDetectionSensitivity === 'veryLow'
								? 0.9
								: 0.5,
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
