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
import { sql } from 'drizzle-orm';
import type { Sharp } from 'sharp';
import { sharpBmp } from '@misskey-dev/sharp-read-bmp';
import type { PutObjectCommandInput } from '@aws-sdk/client-s3';
import type { Context } from 'hono';
import { DB_MAX_IMAGE_COMMENT_LENGTH, FILE_TYPE_BROWSERSAFE } from '@/const.js';
import type { Config } from '@/config.js';
import type { DownloadService } from '@/core/net/DownloadService.js';
import {
	createDriveFileInDatabase,
	fetchDriveFileByMd5AndUserIdFromDatabase,
	fetchDriveFileByUriAndUserIdFromDatabase,
	listDriveFileIdsExceedingUserCapacityFromDatabase,
	listDriveFilesByIdsFromDatabase,
	sumDriveFileSizeByUserIdFromDatabase,
	updateDriveFileInDatabase,
} from '@/core/drive/DriveFileStore.js';
import { fetchDriveFolderByIdAndUserIdFromDatabase } from '@/core/drive/DriveFolderStore.js';
import {
	enqueueDriveFileDeletion,
	publishEnqueuedDriveFileDeletion,
	startDriveFileDeletion,
} from '@/core/drive/DriveFileDeletionLogic.js';
import type { FileInfoService } from '@/core/drive/FileInfoService.js';
import type { IImage } from '@/core/drive/ImageProcessingService.js';
import type { ImageProcessingService } from '@/core/drive/ImageProcessingService.js';
import type { InternalStorageService } from '@/core/drive/InternalStorageService.js';
import type { S3Service } from '@/core/drive/S3Service.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import { fetchUserProfileByUserIdFromDatabase } from '@/core/user/UserProfileStore.js';
import type { VideoProcessingService } from '@/core/drive/VideoProcessingService.js';
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
import { ApiError, invalidParamError } from '../error.js';
import { castMultipartFields } from '../string-params.js';
import { readRequestBodyWithLimit } from '@/server/body-limit.js';
import { packDriveFileOrFailForApi, type ApiDriveFileDependencies } from './drive-file.js';
import {
	buildDriveFileDeletionDependencies,
	validateApiDriveFileName,
	type ApiDriveFilesDependencies,
} from './drive-files.js';
import type { ApiDriveStreamPublisher, ApiMainStreamPublisher } from '../events.js';
import { getApiRolePolicies, isApiModerator } from '../role/role-policy.js';
import { parseApiParams } from '../validation.js';

export type ApiDriveFileUploadDependencies = Omit<ApiDriveFilesDependencies, 'internalStorageService'> &
	ApiDriveFileDependencies & {
		downloadService: Pick<DownloadService, 'downloadUrl'>;
		fileInfoService: Pick<FileInfoService, 'getFileInfo'>;
		imageProcessingService: Pick<ImageProcessingService, 'convertSharpToPng' | 'convertSharpToWebp'>;
		internalStorageService: Pick<InternalStorageService, 'del' | 'saveFromBuffer' | 'saveFromPath'>;
		s3Service: Pick<S3Service, 'upload' | 'delete'>;
		videoProcessingService: Pick<VideoProcessingService, 'generateVideoThumbnail'>;
		logger: Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;
		publishMainStream?: ApiMainStreamPublisher;
		publishDriveStream?: ApiDriveStreamPublisher;
	};

// ファイル欠如・サイズ超過は、API互換性のためエラーボディ無しの生ステータスとして呼び出し元へ返す。
export type ApiMultipartResult =
	| { status: 'missing-file' }
	| { status: 'too-large' }
	| { status: 'ok'; file: { name: string | null; path: string }; cleanup: () => void; fields: Record<string, unknown> };

// multipart のフィールド・境界文字列ぶんの余裕。ファイル本体の上限は maxFileSize で別途判定する。
const MULTIPART_OVERHEAD = 1024 * 1024;

export async function readApiMultipartRequest(c: Context, config: Pick<Config, 'limits'>): Promise<ApiMultipartResult> {
	// c.req.formData() はボディ全体を上限なしでメモリに読むため、先に上限つきで読み切る。
	class BodyLimitExceeded extends Error {}
	let rawBody: Uint8Array;
	try {
		rawBody = await readRequestBodyWithLimit(
			c.req.raw,
			config.limits.maximumFileSizeBytes + MULTIPART_OVERHEAD,
			() => new BodyLimitExceeded(),
		);
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
	if (fileValue.size > config.limits.maximumFileSizeBytes) return { status: 'too-large' };

	const [path] = await createTemp();
	try {
		await streamPromises.pipeline(
			Readable.fromWeb(fileValue.stream() as import('node:stream/web').ReadableStream),
			fs.createWriteStream(path),
		);
	} catch (err) {
		// 書き出しに失敗するとこの関数は cleanup を返せないまま throw するので、ここで始末する
		fs.unlink(path, () => {});
		throw err;
	}

	return {
		status: 'ok',
		file: { name: fileValue.name || null, path },
		// endpoint-base.ts の cleanup は NODE_ENV に関わらず常に unlink するため、createTemp() 自体の
		// (production 以外では no-op になる) cleanup ではなく、ここで同等の無条件 cleanup を用意する。
		cleanup: () => fs.unlink(path, () => {}),
		fields,
	};
}

function isMediaSilencedHostForApi(silencedHosts: string[] | undefined, host: string | null): boolean {
	if (!silencedHosts || host == null) return false;
	return silencedHosts.includes(host.toLowerCase());
}

function driveFileInternalError(): ApiError {
	return new ApiError({
		status: 500,
		message: 'Internal error occurred. Please contact us if the error persists.',
		code: 'INTERNAL_ERROR',
		id: '5d37dbcb-891e-41ca-a3d6-e690c97775ac',
		kind: 'server',
	});
}

async function generateDriveFileAltsForApi(
	deps: ApiDriveFileUploadDependencies,
	path: string,
	type: string,
	generateWeb: boolean,
): Promise<{ webpublic: IImage | null; thumbnail: IImage | null }> {
	if (type.startsWith('video/')) {
		if (deps.config.media.videoThumbnailGeneratorUrl != null) {
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
			metadata.width &&
			metadata.width <= 2048 &&
			metadata.height &&
			metadata.height <= 2048
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
			thumbnail = await deps.imageProcessingService.convertSharpToWebp(sharp(path, { animated: true }), 374, 317, {
				alphaQuality: 70,
			});
		} else {
			thumbnail = await deps.imageProcessingService.convertSharpToWebp(img, 498, 422);
		}
	} catch (err) {
		deps.logger.warn(`thumbnail not created (an error occurred): ${err}`);
	}

	return { webpublic, thumbnail };
}

async function uploadDriveFileToObjectStorageForApi(
	deps: ApiDriveFileUploadDependencies,
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

	// 失敗をここで握り潰すと、実体の無いオブジェクトを指す DriveFile が DB に入り、
	// APIは成功を返すのにファイルURLだけ404になる。呼び出し元へ伝播させて中断させる
	const result = await deps.s3Service.upload(deps.meta, params);
	if (!('Bucket' in result)) {
		throw new Error(`Upload aborted: key = ${key}, filename = ${filename}`);
	}
	deps.logger.debug(`Uploaded: ${result.Bucket}/${result.Key} => ${result.Location}`);
}

async function deleteDriveFileObjectsForApi(deps: ApiDriveFileUploadDependencies, keys: string[]): Promise<void> {
	await Promise.all(
		keys.map(async (accessKey) => {
			try {
				await deps.s3Service.delete(deps.meta, {
					Bucket: deps.meta.objectStorageBucket ?? undefined,
					Key: accessKey,
				});
			} catch (err) {
				deps.logger.error(`Failed to clean up uploaded object: key = ${accessKey}`, err as Error);
			}
		}),
	);
}

type StoredDriveFile = {
	file: MiDriveFile;
	cleanup: () => Promise<void>;
};

async function saveDriveFileForApi(
	deps: ApiDriveFileUploadDependencies,
	file: MiDriveFile,
	path: string,
	name: string,
	type: string,
	hash: string,
	size: number,
): Promise<StoredDriveFile> {
	const alts = await generateDriveFileAltsForApi(deps, path, type, !file.uri);

	if (deps.meta.useObjectStorage) {
		const [ext] = name.match(/\.([a-zA-Z0-9_-]+)$/) ?? [''];
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

		const baseUrl =
			deps.meta.objectStorageBaseUrl ??
			`${deps.meta.objectStorageUseSSL ? 'https' : 'http'}://${deps.meta.objectStorageEndpoint}${deps.meta.objectStoragePort ? `:${deps.meta.objectStoragePort}` : ''}/${deps.meta.objectStorageBucket}`;

		const prefix = deps.meta.objectStoragePrefix ? `${deps.meta.objectStoragePrefix}/` : '';
		const key = `${prefix}${randomUUID()}${resolvedExt}`;
		const url = `${baseUrl}/${key}`;

		let webpublicKey: string | null = null;
		let webpublicUrl: string | null = null;
		let thumbnailKey: string | null = null;
		let thumbnailUrl: string | null = null;

		const uploads = [uploadDriveFileToObjectStorageForApi(deps, key, fs.createReadStream(path), type, null, name)];

		if (alts.webpublic) {
			webpublicKey = `${prefix}webpublic-${randomUUID()}.${alts.webpublic.ext}`;
			webpublicUrl = `${baseUrl}/${webpublicKey}`;
			uploads.push(
				uploadDriveFileToObjectStorageForApi(
					deps,
					webpublicKey,
					alts.webpublic.data,
					alts.webpublic.type,
					alts.webpublic.ext,
					name,
				),
			);
		}

		if (alts.thumbnail) {
			thumbnailKey = `${prefix}thumbnail-${randomUUID()}.${alts.thumbnail.ext}`;
			thumbnailUrl = `${baseUrl}/${thumbnailKey}`;
			uploads.push(
				uploadDriveFileToObjectStorageForApi(
					deps,
					thumbnailKey,
					alts.thumbnail.data,
					alts.thumbnail.type,
					alts.thumbnail.ext,
					`${name}.thumbnail`,
				),
			);
		}

		const keys = [key, thumbnailKey, webpublicKey].filter((value): value is string => value != null);

		try {
			await Promise.all(uploads);
		} catch (err) {
			// 一部だけ成功していることがあるため、DBに載らないオブジェクトを残さないよう掃除してから中断する
			await deleteDriveFileObjectsForApi(deps, keys);
			throw err;
		}

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

		return {
			file,
			cleanup: () => deleteDriveFileObjectsForApi(deps, keys),
		};
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

		const keys = [
			accessKey,
			alts.thumbnail ? thumbnailAccessKey : null,
			alts.webpublic ? webpublicAccessKey : null,
		].filter((value): value is string => value != null);
		return {
			file,
			cleanup: async () => {
				await Promise.all(
					keys.map(async (accessKey) => {
						try {
							await deps.internalStorageService.del(accessKey);
						} catch (err) {
							deps.logger.error(`Failed to clean up uploaded file: key = ${accessKey}`, err as Error);
						}
					}),
				);
			},
		};
	}
}

async function persistStoredDriveFileForApi(
	deps: ApiDriveFileUploadDependencies,
	stored: StoredDriveFile,
	user: MiUser | null,
	force: boolean,
	sensitive: boolean | null,
): Promise<{ file: MiDriveFile; inserted: boolean }> {
	if (user == null) {
		try {
			return { file: await createDriveFileInDatabase(deps.db, stored.file), inserted: true };
		} catch (err) {
			await stored.cleanup();
			throw err;
		}
	}

	try {
		const result = await deps.db.transaction(async (transaction) => {
			await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext('drive-quota'), hashtext(${user.id}))`);

			if (!force) {
				const matched = await fetchDriveFileByMd5AndUserIdFromDatabase(transaction, stored.file.md5, user.id);
				if (matched) {
					if (sensitive && !matched.isSensitive) {
						await updateDriveFileInDatabase(transaction, matched.id, { isSensitive: true });
						matched.isSensitive = true;
					}
					return { file: matched, inserted: false, expiredFileDeletions: [] };
				}
			}

			const isLocalUser = user.host == null;
			const isModerator = isLocalUser ? await isApiModerator({ ...deps, db: transaction }, user) : false;
			let expiredFiles: MiDriveFile[] = [];

			if (!stored.file.isLink && !isModerator) {
				const policies = await getApiRolePolicies({ ...deps, db: transaction }, user);
				const driveCapacity = 1024 * 1024 * policies.driveCapacityMb;
				const usage = await sumDriveFileSizeByUserIdFromDatabase(transaction, user.id);

				if (driveCapacity < usage + stored.file.size) {
					if (isLocalUser) {
						throw new IdentifiableError('c6244ed2-a39a-4e1c-bf93-f0fbd7764fa6', 'No free space.');
					}

					const latestUser = await fetchUserByIdOrFailFromDatabase(transaction, user.id);
					const exceedFileIds = await listDriveFileIdsExceedingUserCapacityFromDatabase(transaction, {
						userId: user.id,
						driveCapacity: driveCapacity - stored.file.size,
						avatarId: latestUser.avatarId,
						bannerId: latestUser.bannerId,
					});
					expiredFiles = await listDriveFilesByIdsFromDatabase(transaction, exceedFileIds);
				}
			}

			const file = await createDriveFileInDatabase(transaction, stored.file);
			const expiredFileDeletions = [];
			for (const expiredFile of expiredFiles) {
				expiredFileDeletions.push(await enqueueDriveFileDeletion(transaction, expiredFile, true));
			}
			return { file, inserted: true, expiredFileDeletions };
		});

		if (!result.inserted) await stored.cleanup();
		for (const deletion of result.expiredFileDeletions) {
			publishEnqueuedDriveFileDeletion(deps, deletion);
		}
		return { file: result.file, inserted: result.inserted };
	} catch (err) {
		await stored.cleanup();
		throw err;
	}
}

async function expireOldDriveFileForApi(
	deps: ApiDriveFileUploadDependencies,
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
		await startDriveFileDeletion(buildDriveFileDeletionDependencies(deps), file, true);
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

export async function addDriveFileForApi(
	deps: ApiDriveFileUploadDependencies,
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
	const userRoleNSFW = user != null && (await getApiRolePolicies(deps, user)).alwaysMarkNsfw;
	let skipNsfwCheck = user == null || userRoleNSFW;
	if (deps.meta.sensitiveMediaDetection === 'none') skipNsfwCheck = true;
	if (user != null && deps.meta.sensitiveMediaDetection === 'local' && user.host != null) skipNsfwCheck = true;
	if (user != null && deps.meta.sensitiveMediaDetection === 'remote' && user.host == null) skipNsfwCheck = true;

	const info = await deps.fileInfoService.getFileInfo(path, {
		fileName: name,
		skipSensitiveDetection: skipNsfwCheck,
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

	const detectedName = correctFilename(
		name != null && validateApiDriveFileName(name) ? name : 'untitled',
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
		const isModerator = isLocalUser ? await isApiModerator(deps, user) : false;
		if (!isModerator) {
			const policies = await getApiRolePolicies(deps, user);

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
				await expireOldDriveFileForApi(
					deps,
					await fetchUserByIdOrFailFromDatabase(deps.db, user.id),
					driveCapacity - info.size,
				);
			}
		}
	}

	const fetchFolder = async () => {
		if (!folderId) return null;

		const driveFolder = await fetchDriveFolderByIdAndUserIdFromDatabase(deps.db, folderId, user ? user.id : null);
		if (driveFolder == null) {
			throw new ApiError({
				status: 400,
				message: 'No such folder.',
				code: 'NO_SUCH_FOLDER',
				id: '12e7caa8-224f-471d-978a-653a81cf4c90',
			});
		}

		return driveFolder;
	};

	const properties: MiDriveFile['properties'] = {};

	if (info.width) {
		properties.width = info.width;
		if (info.height !== undefined) properties.height = info.height;
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
		isSensitive: user ? (user.host == null && profile!.alwaysMarkNsfw ? true : (sensitive ?? false)) : false,
	} as MiDriveFile;

	if (user != null && isMediaSilencedHostForApi(deps.meta.mediaSilencedHosts, user.host)) file.isSensitive = true;
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
				file = (await fetchDriveFileByUriAndUserIdFromDatabase(
					deps.db,
					file.uri!,
					user ? user.id : null,
				)) as MiDriveFile;
			} else {
				deps.logger.error(err as Error);
				throw err;
			}
		}
	} else {
		const stored = await saveDriveFileForApi(deps, file, path, detectedName, info.type.mime, info.md5, info.size);
		const persisted = await persistStoredDriveFileForApi(deps, stored, user, force, sensitive);
		if (!persisted.inserted) return persisted.file;
		file = persisted.file;
	}

	// リモートユーザーのアバター/バナーを取り込むときもここを通る (ap-person)。
	// これらのストリームを購読するのはローカルのクライアントだけなので、
	// リモート宛に流しても誰も受け取らず publish が無駄になる。
	if (user != null && user.host == null) {
		packDriveFileOrFailForApi(deps, file, { self: true }).then((packedFile) => {
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

export async function handleApiDriveFilesCreate(
	deps: ApiDriveFileUploadDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
	file: { name: string | null; path: string },
	ip: string | null,
	headers: Record<string, string> | null,
): Promise<Packed<'DriveFile'>> {
	// multipart は全フィールドを文字列で送るため、宣言された型へ戻してから検証する。
	castMultipartFields(driveFilesCreateParamDef, body);
	const params = parseApiParams(driveFilesCreateParamDef, body);

	let name = params.name ?? file.name ?? null;
	if (name != null) {
		name = name.trim();
		if (name.length === 0) {
			name = null;
		} else if (name === 'blob') {
			name = null;
		} else if (!validateApiDriveFileName(name)) {
			throw new ApiError({
				status: 400,
				message: 'Invalid file name.',
				code: 'INVALID_FILE_NAME',
				id: 'f449b209-0c60-4e51-84d5-29486263bfd4',
			});
		}
	}

	try {
		const driveFile = await addDriveFileForApi(deps, {
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
		return await packDriveFileOrFailForApi(deps, driveFile, { self: true });
	} catch (err) {
		if (err instanceof ApiError) throw err;
		if (err instanceof Error || typeof err === 'string') {
			deps.logger.error(String(err));
		}
		if (err instanceof IdentifiableError) {
			if (err.id === 'c6244ed2-a39a-4e1c-bf93-f0fbd7764fa6') {
				throw new ApiError({
					status: 400,
					message: 'Cannot upload the file because you have no free space of drive.',
					code: 'NO_FREE_SPACE',
					id: 'd08dbc37-a6a9-463a-8c47-96c32ab5f064',
				});
			}
			if (err.id === 'f9e4e5f3-4df4-40b5-b400-f236945f7073') {
				throw new ApiError({
					status: 413,
					message: 'Cannot upload the file because it exceeds the maximum file size.',
					code: 'MAX_FILE_SIZE_EXCEEDED',
					id: 'b9d8c348-33f0-4673-b9a9-5d4da058977a',
				});
			}
			if (err.id === 'bd71c601-f9b0-4808-9137-a330647ced9b') {
				throw new ApiError({
					status: 400,
					message: 'Cannot upload the file because it is an unallowed file type.',
					code: 'UNALLOWED_FILE_TYPE',
					id: '4becd248-7f2c-48c4-a9f0-75edc4f9a1ea',
				});
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

export async function uploadDriveFileFromUrlForApi(
	deps: ApiDriveFileUploadDependencies,
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

		const driveFile = await addDriveFileForApi(deps, {
			user,
			path,
			name,
			comment,
			folderId,
			force,
			isLink,
			url,
			uri,
			sensitive,
			requestIp,
			requestHeaders,
		});
		deps.logger.info(`Got: ${driveFile.id}`);
		return driveFile;
	} catch (err) {
		deps.logger.error(`Failed to create drive file: ${err}`);
		throw err;
	} finally {
		cleanup();
	}
}

export function handleApiDriveFilesUploadFromUrl(
	deps: ApiDriveFileUploadDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
	ip: string | null,
	headers: Record<string, string> | null,
): void {
	const params = parseApiParams(driveFilesUploadFromUrlParamDef, body);

	uploadDriveFileFromUrlForApi(deps, {
		url: params.url,
		user: me,
		folderId: params.folderId,
		sensitive: params.isSensitive,
		force: params.force,
		comment: params.comment,
		// URLアップロードは enableIpLogging に関係なく接続元情報を記録する。
		requestIp: ip,
		requestHeaders: headers,
	}).then((file) => {
		packDriveFileOrFailForApi(deps, file, { self: true }).then((packedFile) => {
			deps.publishMainStream?.(me.id, 'urlUploadFinished', {
				marker: params.marker,
				file: packedFile,
			});
		});
	});
}
