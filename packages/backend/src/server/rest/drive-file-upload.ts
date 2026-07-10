/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { Readable } from 'node:stream';
import * as streamPromises from 'node:stream/promises';
import { z } from 'zod';
import sharp from 'sharp';
import type { Sharp } from 'sharp';
import { sharpBmp } from '@misskey-dev/sharp-read-bmp';
import type { PutObjectCommandInput } from '@aws-sdk/client-s3';
import type { Context } from 'hono';
import { DB_MAX_IMAGE_COMMENT_LENGTH, FILE_TYPE_BROWSERSAFE } from '@/const.js';
import type { Config } from '@/config.js';
import type { DownloadService } from '@/core/DownloadService.js';
import {
	createDriveFileInDatabase,
	fetchDriveFileByMd5AndUserIdFromDatabase,
	fetchDriveFileByUriAndUserIdFromDatabase,
	listDriveFileIdsExceedingUserCapacityFromDatabase,
	listDriveFilesByIdsFromDatabase,
	sumDriveFileSizeByUserIdFromDatabase,
	updateDriveFileInDatabase,
} from '@/core/DriveFileStore.js';
import { fetchDriveFolderByIdAndUserIdFromDatabase } from '@/core/DriveFolderStore.js';
import { startDriveFileDeletion } from '@/core/DriveFileDeletionLogic.js';
import type { FileInfoService } from '@/core/FileInfoService.js';
import type { IImage } from '@/core/ImageProcessingService.js';
import type { ImageProcessingService } from '@/core/ImageProcessingService.js';
import type { InternalStorageService } from '@/core/InternalStorageService.js';
import type { S3Service } from '@/core/S3Service.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { fetchUserProfileByUserIdFromDatabase } from '@/core/UserProfileStore.js';
import type { VideoProcessingService } from '@/core/VideoProcessingService.js';
import { contentDisposition } from '@/misc/content-disposition.js';
import { correctFilename } from '@/misc/correct-filename.js';
import { createTemp } from '@/misc/create-temp.js';
import { genId } from '@/misc/id/gen-id.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import { isMimeImage } from '@/misc/is-mime-image.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId } from '@/misc/zod-params.js';
import type Logger from '@/logger.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { HonoApiError } from './error.js';
import { readRequestBodyWithLimit } from '../body-limit.js';
import { packDriveFileOrFailForHonoApi, type HonoApiDriveFileDependencies } from './drive-file.js';
import { buildDriveFileDeletionDependencies, validateHonoApiDriveFileName, type HonoApiDriveFilesDependencies } from './drive-files.js';
import type { HonoApiDriveStreamPublisher, HonoApiMainStreamPublisher } from './events.js';
import { getHonoApiRolePolicies, isHonoApiModerator } from './role-policy.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiDriveFileUploadDependencies = Omit<HonoApiDriveFilesDependencies, 'internalStorageService'> & HonoApiDriveFileDependencies & {
	downloadService: Pick<DownloadService, 'downloadUrl'>;
	fileInfoService: Pick<FileInfoService, 'getFileInfo'>;
	imageProcessingService: Pick<ImageProcessingService, 'convertSharpToPng' | 'convertSharpToWebp'>;
	internalStorageService: Pick<InternalStorageService, 'del' | 'saveFromBuffer' | 'saveFromPath'>;
	s3Service: Pick<S3Service, 'upload'>;
	videoProcessingService: Pick<VideoProcessingService, 'generateVideoThumbnail'>;
	logger: Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;
	publishMainStream?: HonoApiMainStreamPublisher;
	publishDriveStream?: HonoApiDriveStreamPublisher;
};

// fastify の @fastify/multipart は truncated 判定・欠如判定のいずれもエラーボディ無しの生ステータスで返しており、
// endpoint-base.ts の FILE_REQUIRED (4267801e-...) は HTTP 経由では到達しない dead code のため、ここでも再現しない。
export type HonoApiMultipartResult =
	| { status: 'missing-file' }
	| { status: 'too-large' }
	| { status: 'ok'; file: { name: string | null; path: string }; cleanup: () => void; fields: Record<string, unknown> };

// multipart のフィールド・境界文字列ぶんの余裕。ファイル本体の上限は maxFileSize で別途判定する。
const MULTIPART_OVERHEAD = 1024 * 1024;

export async function readHonoApiMultipartRequest(
	c: Context,
	config: Pick<Config, 'maxFileSize'>,
): Promise<HonoApiMultipartResult> {
	// c.req.formData() はボディ全体を上限なしでメモリに読むため、先に上限つきで読み切る。
	// upstream (Fastify @fastify/multipart) の limits.fileSize による途中打ち切り相当。
	class BodyLimitExceeded extends Error {}
	let rawBody: Uint8Array;
	try {
		rawBody = await readRequestBodyWithLimit(c, config.maxFileSize + MULTIPART_OVERHEAD, () => new BodyLimitExceeded());
	} catch (err) {
		if (err instanceof BodyLimitExceeded) return { status: 'too-large' };
		throw err;
	}

	let formData: FormData;
	try {
		formData = await new Response(rawBody, {
			headers: { 'content-type': c.req.header('content-type') ?? '' },
		}).formData();
	} catch {
		return { status: 'missing-file' };
	}

	let fileValue: File | null = null;
	const fields: Record<string, unknown> = {};

	for (const [key, value] of formData.entries()) {
		if (value instanceof File) {
			if (key === 'file' && fileValue == null) fileValue = value;
		} else {
			fields[key] = value;
		}
	}

	if (fileValue == null) return { status: 'missing-file' };
	if (fileValue.size > config.maxFileSize) return { status: 'too-large' };

	const [path] = await createTemp();
	await streamPromises.pipeline(Readable.fromWeb(fileValue.stream() as import('node:stream/web').ReadableStream), fs.createWriteStream(path));

	return {
		status: 'ok',
		file: { name: fileValue.name || null, path },
		// endpoint-base.ts の cleanup は NODE_ENV に関わらず常に unlink するため、createTemp() 自体の
		// (production 以外では no-op になる) cleanup ではなく、ここで同等の無条件 cleanup を用意する。
		cleanup: () => fs.unlink(path, () => {}),
		fields,
	};
}

export function castHonoApiMultipartFields(paramDef: { properties?: Record<string, { type?: string }> }, fields: Record<string, unknown>): void {
	const properties = paramDef.properties;
	if (properties == null) return;

	for (const key of Object.keys(properties)) {
		const type = properties[key]?.type;
		if (type != null && ['boolean', 'number', 'integer'].includes(type) && typeof fields[key] === 'string') {
			try {
				fields[key] = JSON.parse(fields[key] as string);
			} catch {
				throw new HonoApiError({
					status: 400,
					message: 'Invalid param.',
					code: 'INVALID_PARAM',
					id: '0b5f1631-7c1a-41a6-b399-cce335f34d85',
					info: { param: key, reason: `cannot cast to ${type}` },
				});
			}
		}
	}
}

function isMediaSilencedHostForHonoApi(silencedHosts: string[] | undefined, host: string | null): boolean {
	if (!silencedHosts || host == null) return false;
	return silencedHosts.some(x => host.toLowerCase() === x);
}

function driveFileInternalError(): HonoApiError {
	return new HonoApiError({
		status: 500,
		message: 'Internal error occurred. Please contact us if the error persists.',
		code: 'INTERNAL_ERROR',
		id: '5d37dbcb-891e-41ca-a3d6-e690c97775ac',
		kind: 'server',
	});
}

async function generateDriveFileAltsForHonoApi(
	deps: HonoApiDriveFileUploadDependencies,
	path: string,
	type: string,
	generateWeb: boolean,
): Promise<{ webpublic: IImage | null; thumbnail: IImage | null }> {
	if (type.startsWith('video/')) {
		if (deps.config.videoThumbnailGenerator != null) {
			return { webpublic: null, thumbnail: null };
		}

		try {
			const thumbnail = await deps.videoProcessingService.generateVideoThumbnail(path);
			return { webpublic: null, thumbnail };
		} catch (err) {
			deps.logger.warn(`GenerateVideoThumbnail failed: ${err}`);
			return { webpublic: null, thumbnail: null };
		}
	}

	if (!isMimeImage(type, 'sharp-convertible-image-with-bmp')) {
		return { webpublic: null, thumbnail: null };
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
			metadata.width && metadata.width <= 2048 &&
			metadata.height && metadata.height <= 2048
		);
	} catch (err) {
		deps.logger.warn(`sharp failed: ${err}`);
		return { webpublic: null, thumbnail: null };
	}

	let webpublic: IImage | null = null;

	if (generateWeb && !satisfyWebpublic && !isAnimated) {
		try {
			if (['image/jpeg', 'image/webp', 'image/avif'].includes(type)) {
				webpublic = await deps.imageProcessingService.convertSharpToWebp(img, 2048, 2048);
			} else if (['image/png', 'image/bmp', 'image/svg+xml'].includes(type)) {
				webpublic = await deps.imageProcessingService.convertSharpToPng(img, 2048, 2048);
			}
		} catch (err) {
			deps.logger.warn(`web image not created (an error occurred): ${err}`);
		}
	}

	let thumbnail: IImage | null = null;

	try {
		if (isAnimated) {
			thumbnail = await deps.imageProcessingService.convertSharpToWebp(sharp(path, { animated: true }), 374, 317, { alphaQuality: 70 });
		} else {
			thumbnail = await deps.imageProcessingService.convertSharpToWebp(img, 498, 422);
		}
	} catch (err) {
		deps.logger.warn(`thumbnail not created (an error occurred): ${err}`);
	}

	return { webpublic, thumbnail };
}

async function uploadDriveFileToObjectStorageForHonoApi(
	deps: HonoApiDriveFileUploadDependencies,
	key: string,
	body: fs.ReadStream | Buffer,
	type: string,
	ext: string | null | undefined,
	filename: string | undefined,
): Promise<void> {
	let contentType = type;
	if (contentType === 'image/apng') contentType = 'image/png';
	if (!FILE_TYPE_BROWSERSAFE.includes(contentType)) contentType = 'application/octet-stream';

	const params = {
		Bucket: deps.meta.objectStorageBucket,
		Key: key,
		Body: body,
		ContentType: contentType,
		CacheControl: 'max-age=31536000, immutable',
	} as PutObjectCommandInput;

	if (filename) {
		params.ContentDisposition = contentDisposition('inline', ext ? correctFilename(filename, ext) : filename);
	}
	if (deps.meta.objectStorageSetPublicRead) params.ACL = 'public-read';

	try {
		const result = await deps.s3Service.upload(deps.meta, params);
		if ('Bucket' in result) {
			deps.logger.debug(`Uploaded: ${result.Bucket}/${result.Key} => ${result.Location}`);
		} else {
			deps.logger.error(`Upload Result Aborted: key = ${key}, filename = ${filename}`);
		}
	} catch (err) {
		deps.logger.error(`Upload Failed: key = ${key}, filename = ${filename}`, err as Error);
	}
}

async function saveDriveFileForHonoApi(
	deps: HonoApiDriveFileUploadDependencies,
	file: MiDriveFile,
	path: string,
	name: string,
	type: string,
	hash: string,
	size: number,
): Promise<MiDriveFile> {
	const alts = await generateDriveFileAltsForHonoApi(deps, path, type, !file.uri);

	if (deps.meta.useObjectStorage) {
		const [ext] = (name.match(/\.([a-zA-Z0-9_-]+)$/) ?? ['']);
		let resolvedExt = ext;

		if (resolvedExt === '') {
			if (type === 'image/jpeg') resolvedExt = '.jpg';
			if (type === 'image/png') resolvedExt = '.png';
			if (type === 'image/webp') resolvedExt = '.webp';
			if (type === 'image/avif') resolvedExt = '.avif';
			if (type === 'image/apng') resolvedExt = '.apng';
			if (type === 'image/vnd.mozilla.apng') resolvedExt = '.apng';
		}

		if (!FILE_TYPE_BROWSERSAFE.includes(type)) {
			resolvedExt = '';
		}

		const baseUrl = deps.meta.objectStorageBaseUrl
			?? `${deps.meta.objectStorageUseSSL ? 'https' : 'http'}://${deps.meta.objectStorageEndpoint}${deps.meta.objectStoragePort ? `:${deps.meta.objectStoragePort}` : ''}/${deps.meta.objectStorageBucket}`;

		const prefix = deps.meta.objectStoragePrefix ? `${deps.meta.objectStoragePrefix}/` : '';
		const key = `${prefix}${randomUUID()}${resolvedExt}`;
		const url = `${baseUrl}/${key}`;

		let webpublicKey: string | null = null;
		let webpublicUrl: string | null = null;
		let thumbnailKey: string | null = null;
		let thumbnailUrl: string | null = null;

		const uploads = [
			uploadDriveFileToObjectStorageForHonoApi(deps, key, fs.createReadStream(path), type, null, name),
		];

		if (alts.webpublic) {
			webpublicKey = `${prefix}webpublic-${randomUUID()}.${alts.webpublic.ext}`;
			webpublicUrl = `${baseUrl}/${webpublicKey}`;
			uploads.push(uploadDriveFileToObjectStorageForHonoApi(deps, webpublicKey, alts.webpublic.data, alts.webpublic.type, alts.webpublic.ext, name));
		}

		if (alts.thumbnail) {
			thumbnailKey = `${prefix}thumbnail-${randomUUID()}.${alts.thumbnail.ext}`;
			thumbnailUrl = `${baseUrl}/${thumbnailKey}`;
			uploads.push(uploadDriveFileToObjectStorageForHonoApi(deps, thumbnailKey, alts.thumbnail.data, alts.thumbnail.type, alts.thumbnail.ext, `${name}.thumbnail`));
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
	} else {
		const accessKey = randomUUID();
		const thumbnailAccessKey = 'thumbnail-' + randomUUID();
		const webpublicAccessKey = 'webpublic-' + randomUUID();

		const url = deps.internalStorageService.saveFromPath(accessKey, path);

		let thumbnailUrl: string | null = null;
		let webpublicUrl: string | null = null;

		if (alts.thumbnail) {
			thumbnailUrl = deps.internalStorageService.saveFromBuffer(thumbnailAccessKey, alts.thumbnail.data);
		}

		if (alts.webpublic) {
			webpublicUrl = deps.internalStorageService.saveFromBuffer(webpublicAccessKey, alts.webpublic.data);
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
}

async function expireOldDriveFileForHonoApi(
	deps: HonoApiDriveFileUploadDependencies,
	user: MiUser,
	driveCapacity: number,
): Promise<void> {
	const exceedFileIds = await listDriveFileIdsExceedingUserCapacityFromDatabase(deps.db, {
		userId: user.id,
		driveCapacity,
		avatarId: user.avatarId,
		bannerId: user.bannerId,
	});

	const files = await listDriveFilesByIdsFromDatabase(deps.db, exceedFileIds);
	for (const file of files) {
		startDriveFileDeletion(buildDriveFileDeletionDependencies(deps), file, true);
	}
}

export type AddDriveFileArgs = {
	user: MiUser | null;
	path: string;
	name?: string | null;
	comment?: string | null;
	folderId?: string | null;
	force?: boolean;
	isLink?: boolean;
	url?: string | null;
	uri?: string | null;
	sensitive?: boolean | null;
	ext?: string | null;
	requestIp?: string | null;
	requestHeaders?: Record<string, string> | null;
};

export async function addDriveFileForHonoApi(
	deps: HonoApiDriveFileUploadDependencies,
	{
		user,
		path,
		name = null,
		comment = null,
		folderId = null,
		force = false,
		isLink = false,
		url = null,
		uri = null,
		sensitive = null,
		requestIp = null,
		requestHeaders = null,
		ext = null,
	}: AddDriveFileArgs,
): Promise<MiDriveFile> {
	let skipNsfwCheck = false;
	const userRoleNSFW = user != null && (await getHonoApiRolePolicies(deps, user)).alwaysMarkNsfw;
	if (user == null) {
		skipNsfwCheck = true;
	} else if (userRoleNSFW) {
		skipNsfwCheck = true;
	}
	if (deps.meta.sensitiveMediaDetection === 'none') skipNsfwCheck = true;
	if (user != null && deps.meta.sensitiveMediaDetection === 'local' && user.host != null) skipNsfwCheck = true;
	if (user != null && deps.meta.sensitiveMediaDetection === 'remote' && user.host == null) skipNsfwCheck = true;

	const info = await deps.fileInfoService.getFileInfo(path, {
		fileName: name,
		skipSensitiveDetection: skipNsfwCheck,
		sensitiveThreshold:
			deps.meta.sensitiveMediaDetectionSensitivity === 'veryHigh' ? 0.1 :
			deps.meta.sensitiveMediaDetectionSensitivity === 'high' ? 0.3 :
			deps.meta.sensitiveMediaDetectionSensitivity === 'low' ? 0.7 :
			deps.meta.sensitiveMediaDetectionSensitivity === 'veryLow' ? 0.9 :
			0.5,
		sensitiveThresholdForPorn: 0.75,
		enableSensitiveMediaDetectionForVideos: deps.meta.enableSensitiveMediaDetectionForVideos,
	});

	const detectedName = correctFilename(
		(name != null && validateHonoApiDriveFileName(name)) ? name : 'untitled',
		ext ?? info.type.ext,
	);

	if (user != null && !force) {
		const matched = await fetchDriveFileByMd5AndUserIdFromDatabase(deps.db, info.md5, user.id);

		if (matched) {
			if (sensitive && !matched.isSensitive) {
				await updateDriveFileInDatabase(deps.db, matched.id, { isSensitive: true });
				matched.isSensitive = true;
			}
			return matched;
		}
	}

	if (user != null && !isLink) {
		const isLocalUser = user.host == null;
		const isModerator = isLocalUser ? await isHonoApiModerator(deps, user) : false;
		if (!isModerator) {
			const policies = await getHonoApiRolePolicies(deps, user);

			const allowedMimeTypes = policies.uploadableFileTypes;
			const isAllowed = allowedMimeTypes.some((mimeType) => {
				if (mimeType === '*' || mimeType === '*/*') return true;
				if (mimeType.endsWith('/*')) return info.type.mime.startsWith(mimeType.slice(0, -1));
				return info.type.mime === mimeType;
			});
			if (!isAllowed) {
				throw new IdentifiableError('bd71c601-f9b0-4808-9137-a330647ced9b', `Unallowed file type: ${info.type.mime}`);
			}

			const driveCapacity = 1024 * 1024 * policies.driveCapacityMb;
			const maxFileSize = 1024 * 1024 * policies.maxFileSizeMb;

			if (maxFileSize < info.size) {
				if (isLocalUser) {
					throw new IdentifiableError('f9e4e5f3-4df4-40b5-b400-f236945f7073', 'Max file size exceeded.');
				}
			}

			const usage = await sumDriveFileSizeByUserIdFromDatabase(deps.db, user.id);

			if (driveCapacity < usage + info.size) {
				if (isLocalUser) {
					throw new IdentifiableError('c6244ed2-a39a-4e1c-bf93-f0fbd7764fa6', 'No free space.');
				}
				await expireOldDriveFileForHonoApi(deps, await fetchUserByIdOrFailFromDatabase(deps.db, user.id), driveCapacity - info.size);
			}
		}
	}

	const fetchFolder = async () => {
		if (!folderId) return null;

		const driveFolder = await fetchDriveFolderByIdAndUserIdFromDatabase(deps.db, folderId, user ? user.id : null);
		if (driveFolder == null) throw new Error('folder-not-found');

		return driveFolder;
	};

	const properties: MiDriveFile['properties'] = {};

	if (info.width) {
		properties.width = info.width;
		properties.height = info.height;
	}
	if (info.orientation != null) {
		properties.orientation = info.orientation;
	}

	const profile = user != null ? await fetchUserProfileByUserIdFromDatabase(deps.db, user.id) : null;
	const folder = await fetchFolder();

	let file = {
		id: genId(),
		userId: user ? user.id : null,
		user: null,
		userHost: user ? user.host : null,
		folderId: folder != null ? folder.id : null,
		folder: null,
		comment,
		properties,
		blurhash: info.blurhash ?? null,
		isLink,
		requestIp,
		requestHeaders,
		maybeSensitive: info.sensitive,
		maybePorn: info.porn,
		isSensitive: user
			? (user.host == null && profile!.alwaysMarkNsfw) ? true : (sensitive ?? false)
			: false,
	} as MiDriveFile;

	if (user != null && isMediaSilencedHostForHonoApi(deps.meta.mediaSilencedHosts, user.host)) file.isSensitive = true;
	if (info.sensitive && profile!.autoSensitive) file.isSensitive = true;
	if (info.sensitive && deps.meta.setSensitiveFlagAutomatically) file.isSensitive = true;
	if (userRoleNSFW) file.isSensitive = true;

	if (url !== null) {
		file.src = url;

		if (isLink) {
			file.url = url;
			file.accessKey = randomUUID();
			file.thumbnailAccessKey = 'thumbnail-' + randomUUID();
			file.webpublicAccessKey = 'webpublic-' + randomUUID();
		}
	}

	if (uri !== null) {
		file.uri = uri;
	}

	if (isLink) {
		try {
			file.size = 0;
			file.md5 = info.md5;
			file.name = detectedName;
			file.type = info.type.mime;
			file.storedInternal = false;

			file = await createDriveFileInDatabase(deps.db, file);
		} catch (err) {
			if (isDuplicateKeyValueError(err)) {
				file = await fetchDriveFileByUriAndUserIdFromDatabase(deps.db, file.uri!, user ? user.id : null) as MiDriveFile;
			} else {
				deps.logger.error(err as Error);
				throw err;
			}
		}
	} else {
		file = await saveDriveFileForHonoApi(deps, file, path, detectedName, info.type.mime, info.md5, info.size);
	}

	if (user != null) {
		packDriveFileOrFailForHonoApi(deps, file, { self: true }).then(packedFile => {
			deps.publishMainStream?.(user.id, 'driveFileCreated', packedFile);
			deps.publishDriveStream?.(user.id, 'fileCreated', packedFile);
		});
	}

	deps.chartWriters.driveChart.update(file, true);
	if (file.userHost == null) {
		deps.chartWriters.perUserDriveChart.update(file, true);
	} else {
		if (deps.meta.enableChartsForFederatedInstances) {
			deps.chartWriters.instanceChart.updateDrive(file, true);
		}
	}

	return file;
}

export const driveFilesCreateParamDef = z.object({
	folderId: misskeyId().nullable().optional().default(null),
	name: z.string().nullable().optional().default(null),
	comment: z.string().max(DB_MAX_IMAGE_COMMENT_LENGTH).nullable().optional().default(null),
	isSensitive: z.boolean().optional().default(false),
	force: z.boolean().optional().default(false),
});

// multipart フォームは全フィールドを文字列で送るため、castHonoApiMultipartFields で
// boolean/number/integer 型のフィールドのみ JSON.parse して型を戻す。driveFilesCreateParamDef の
// 対象プロパティのうち boolean 型なのは isSensitive/force のみ (他は string 系)。
const driveFilesCreateMultipartCastFields = {
	properties: {
		isSensitive: { type: 'boolean' },
		force: { type: 'boolean' },
	},
} as const;

type DriveFilesCreateParams = {
	folderId: string | null;
	name: string | null;
	comment: string | null;
	isSensitive: boolean;
	force: boolean;
};

export async function handleHonoApiDriveFilesCreate(
	deps: HonoApiDriveFileUploadDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
	file: { name: string | null; path: string },
	ip: string | null,
	headers: Record<string, string> | null,
): Promise<Packed<'DriveFile'>> {
	castHonoApiMultipartFields(driveFilesCreateMultipartCastFields, body);
	const params = parseHonoApiParams(driveFilesCreateParamDef, body);

	let name = params.name ?? file.name ?? null;
	if (name != null) {
		name = name.trim();
		if (name.length === 0) {
			name = null;
		} else if (name === 'blob') {
			name = null;
		} else if (!validateHonoApiDriveFileName(name)) {
			throw new HonoApiError({ status: 400, message: 'Invalid file name.', code: 'INVALID_FILE_NAME', id: 'f449b209-0c60-4e51-84d5-29486263bfd4' });
		}
	}

	try {
		const driveFile = await addDriveFileForHonoApi(deps, {
			user: me,
			path: file.path,
			name,
			comment: params.comment,
			folderId: params.folderId,
			force: params.force,
			sensitive: params.isSensitive,
			requestIp: deps.meta.enableIpLogging ? ip : null,
			requestHeaders: deps.meta.enableIpLogging ? headers : null,
		});
		return await packDriveFileOrFailForHonoApi(deps, driveFile, { self: true });
	} catch (err) {
		if (err instanceof Error || typeof err === 'string') {
			deps.logger.error(String(err));
		}
		if (err instanceof IdentifiableError) {
			// 元の DriveService#addFile では inappropriate (282f77bf-...) の throw 箇所自体がコメントアウトされており
			// 到達不能だが、create.ts のエラーマッピング自体はそのまま残っているため、ここでも同様に到達不能なまま残す。
			if (err.id === '282f77bf-5816-4f72-9264-aa14d8261a21') {
				throw new HonoApiError({ status: 400, message: 'Cannot upload the file because it has been determined that it possibly contains inappropriate content.', code: 'INAPPROPRIATE', id: 'bec5bd69-fba3-43c9-b4fb-2894b66ad5d2' });
			}
			if (err.id === 'c6244ed2-a39a-4e1c-bf93-f0fbd7764fa6') {
				throw new HonoApiError({ status: 400, message: 'Cannot upload the file because you have no free space of drive.', code: 'NO_FREE_SPACE', id: 'd08dbc37-a6a9-463a-8c47-96c32ab5f064' });
			}
			if (err.id === 'f9e4e5f3-4df4-40b5-b400-f236945f7073') {
				throw new HonoApiError({ status: 413, message: 'Cannot upload the file because it exceeds the maximum file size.', code: 'MAX_FILE_SIZE_EXCEEDED', id: 'b9d8c348-33f0-4673-b9a9-5d4da058977a' });
			}
			if (err.id === 'bd71c601-f9b0-4808-9137-a330647ced9b') {
				throw new HonoApiError({ status: 400, message: 'Cannot upload the file because it is an unallowed file type.', code: 'UNALLOWED_FILE_TYPE', id: '4becd248-7f2c-48c4-a9f0-75edc4f9a1ea' });
			}
		}
		throw driveFileInternalError();
	}
}

export const driveFilesUploadFromUrlParamDef = z.object({
	url: z.string(),
	folderId: misskeyId().nullable().optional().default(null),
	isSensitive: z.boolean().optional().default(false),
	comment: z.string().max(512).nullable().optional().default(null),
	marker: z.string().nullable().optional().default(null),
	force: z.boolean().optional().default(false),
});

type DriveFilesUploadFromUrlParams = {
	url: string;
	folderId: string | null;
	isSensitive: boolean;
	comment: string | null;
	marker: string | null;
	force: boolean;
};

export async function uploadDriveFileFromUrlForHonoApi(
	deps: HonoApiDriveFileUploadDependencies,
	{
		url,
		user,
		folderId = null,
		uri = null,
		sensitive = false,
		force = false,
		isLink = false,
		comment = null,
		requestIp = null,
		requestHeaders = null,
	}: {
		url: string;
		user: MiUser | null;
		folderId?: string | null;
		uri?: string | null;
		sensitive?: boolean;
		force?: boolean;
		isLink?: boolean;
		comment?: string | null;
		requestIp?: string | null;
		requestHeaders?: Record<string, string> | null;
	},
): Promise<MiDriveFile> {
	const [path, cleanup] = await createTemp();

	try {
		const { filename: name } = await deps.downloadService.downloadUrl(url, path);

		if (comment !== null && name === comment) {
			comment = null;
		}

		const driveFile = await addDriveFileForHonoApi(deps, { user, path, name, comment, folderId, force, isLink, url, uri, sensitive, requestIp, requestHeaders });
		deps.logger.info(`Got: ${driveFile.id}`);
		return driveFile;
	} catch (err) {
		deps.logger.error(`Failed to create drive file: ${err}`);
		throw err;
	} finally {
		cleanup();
	}
}

export function handleHonoApiDriveFilesUploadFromUrl(
	deps: HonoApiDriveFileUploadDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
	ip: string | null,
	headers: Record<string, string> | null,
): void {
	const params = parseHonoApiParams(driveFilesUploadFromUrlParamDef, body);

	// 元の NestJS ハンドラも await/catch せず fire-and-forget しているため、同様に呼び出し元へは即座に返す。
	uploadDriveFileFromUrlForHonoApi(deps, {
		url: params.url,
		user: me,
		folderId: params.folderId,
		sensitive: params.isSensitive,
		force: params.force,
		comment: params.comment,
		// 元の upload-from-url.ts は create.ts と異なり enableIpLogging によるゲートを行わず、常に ip/headers を渡す。
		requestIp: ip,
		requestHeaders: headers,
	}).then(file => {
		packDriveFileOrFailForHonoApi(deps, file, { self: true }).then(packedFile => {
			deps.publishMainStream?.(me.id, 'urlUploadFinished', {
				marker: params.marker,
				file: packedFile,
			});
		});
	});
}
