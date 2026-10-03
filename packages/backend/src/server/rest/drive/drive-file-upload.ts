/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { Readable } from 'node:stream';
import * as streamPromises from 'node:stream/promises';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { DB_MAX_IMAGE_COMMENT_LENGTH } from '@/const.js';
import type { Config } from '@/config.js';
import type { DownloadService } from '@/core/net/download-service.js';
import {
	buildObjectStoragePutObject,
	driveSensitiveMediaThreshold,
	applyDriveFileStorage,
	generateDriveFileAlts,
	planObjectStorageUploads,
	saveDriveFileToInternalStorage,
} from '@/core/drive/drive-file-upload-logic.js';
import { validateDriveFileName } from '@/core/drive/drive-file-name.js';
import {
	createDriveFileInDatabase,
	fetchDriveFileByMd5AndUserIdFromDatabase,
	fetchDriveFileByUriAndUserIdFromDatabase,
	listDriveFileIdsExceedingUserCapacityFromDatabase,
	listDriveFilesByIdsFromDatabase,
	sumDriveFileSizeByUserIdFromDatabase,
	updateDriveFileInDatabase,
} from '@/core/drive/drive-file-store.js';
import { fetchDriveFolderByIdAndUserIdFromDatabase } from '@/core/drive/drive-folder-store.js';
import {
	enqueueDriveFileDeletion,
	publishEnqueuedDriveFileDeletion,
	startDriveFileDeletion,
} from '@/core/drive/drive-file-deletion-logic.js';
import type { FileInfo, FileInfoService } from '@/core/drive/file-info-service.js';
import mime from 'mime-types';
import type { ImageProcessingService } from '@/core/drive/image-processing-service.js';
import type { InternalStorageService } from '@/core/drive/internal-storage-service.js';
import type { S3Service } from '@/core/drive/s3-service.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/user-store.js';
import { fetchUserProfileByUserIdFromDatabase } from '@/core/user/user-profile-store.js';
import type { VideoProcessingService } from '@/core/drive/video-processing-service.js';
import { correctFilename } from '@/misc/correct-filename.js';
import { createTemp } from '@/misc/create-temp.js';
import { genId } from '@/misc/id/gen-id.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { Logger } from '@/logger.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiMeta } from '@/models/Meta.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import { castMultipartFields } from '../string-params.js';
import { readRequestBodyWithLimit } from '@/server/body-limit.js';
import { packDriveFileOrFail } from '../../../core/drive/drive-file-packing.js';
import type { DriveFileDependencies } from '../../../core/drive/drive-file-packing.js';
import { buildDriveFileDeletionDependencies } from './drive-files.js';
import type { DriveFilesDependencies } from './drive-files.js';
import type { DriveStreamPublisher, MainStreamPublisher } from '../../../core/events.js';
import { fetchRolePolicies, userIsModerator } from '../../../core/role/role-policy.js';
import { parseApiParams } from '../validation.js';

export type DriveFileUploadDependencies = Omit<DriveFilesDependencies, 'internalStorageService'> &
	DriveFileDependencies & {
		downloadService: Pick<DownloadService, 'downloadUrl' | 'fetchFileName'>;
		fileInfoService: Pick<FileInfoService, 'fetchFileInfo'>;
		imageProcessingService: Pick<ImageProcessingService, 'convertSharpToPng' | 'convertSharpToWebp'>;
		internalStorageService: Pick<InternalStorageService, 'del' | 'saveFromBuffer' | 'saveFromPath'>;
		s3Service: Pick<S3Service, 'upload' | 'delete'>;
		videoProcessingService: Pick<VideoProcessingService, 'generateVideoThumbnail'>;
		logger: Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;
		publishMainStream?: MainStreamPublisher;
		publishDriveStream?: DriveStreamPublisher;
	};

// ファイル欠如・サイズ超過は、API互換性のためエラーボディ無しの生ステータスとして呼び出し元へ返す。
export type MultipartResult =
	| { status: 'missing-file' }
	| { status: 'too-large' }
	| { status: 'ok'; file: { name: string | null; path: string }; cleanup: () => void; fields: Record<string, unknown> };

// multipart のフィールド・境界文字列ぶんの余裕。ファイル本体の上限は maxFileSize で別途判定する。
const MULTIPART_OVERHEAD = 1024 * 1024;

export async function readApiMultipartRequest(c: Context, config: Pick<Config, 'limits'>): Promise<MultipartResult> {
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
		if (err instanceof BodyLimitExceeded) {
			return { status: 'too-large' };
		}
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
			if (key === 'file' && fileValue == null) {
				fileValue = value;
			}
		} else {
			fields[key] = value;
		}
	}

	if (fileValue == null) {
		return { status: 'missing-file' };
	}
	if (fileValue.size > config.limits.maximumFileSizeBytes) {
		return { status: 'too-large' };
	}

	const [path] = await createTemp();
	try {
		await streamPromises.pipeline(
			Readable.fromWeb(fileValue.stream() as import('node:stream/web').ReadableStream),
			fs.createWriteStream(path),
		);
	} catch (err) {
		// 書き出し失敗時は cleanup を返せないため、ここで一時ファイルを削除する。
		fs.unlink(path, () => {});
		throw err;
	}

	return {
		status: 'ok',
		file: { name: fileValue.name || null, path },
		// createTemp() の cleanup は production 以外で一時ファイルを残すため、環境によらず消すものを渡す。
		cleanup: () => fs.unlink(path, () => {}),
		fields,
	};
}

function isMediaSilencedHost(silencedHosts: string[] | undefined, host: string | null): boolean {
	if (!silencedHosts || host == null) {
		return false;
	}
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

async function uploadDriveFileToObjectStorage(
	deps: DriveFileUploadDependencies,
	key: string,
	body: Blob | Uint8Array,
	type: string,
	ext: string | null | undefined,
	filename: string | undefined,
): Promise<void> {
	const object = buildObjectStoragePutObject(deps.meta, key, body, type, ext, filename);

	// 失敗を無視すると実体の無いオブジェクトを指す DriveFile が DB に入り、API は成功したのに
	// ファイル URL が 404 になる。
	await deps.s3Service.upload(deps.meta, object);
	deps.logger.debug(`Uploaded: ${deps.meta.objectStorageBucket}/${key}`);
}

async function deleteDriveFileObjects(deps: DriveFileUploadDependencies, keys: string[]): Promise<void> {
	await Promise.all(
		keys.map(async (accessKey) => {
			try {
				await deps.s3Service.delete(deps.meta, { key: accessKey });
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

async function saveDriveFile(
	deps: DriveFileUploadDependencies,
	file: MiDriveFile,
	path: string,
	name: string,
	type: string,
	hash: string,
	size: number,
): Promise<StoredDriveFile> {
	const alts = await generateDriveFileAlts(deps, path, type, !file.uri);

	const content = { name, type, md5: hash, size };

	if (deps.meta.useObjectStorage) {
		const { location, uploads } = planObjectStorageUploads(deps.meta, path, name, type, alts);
		const keys = [location.accessKey, location.thumbnailAccessKey, location.webpublicAccessKey].filter(
			(value): value is string => value != null,
		);

		try {
			await Promise.all(
				uploads.map((upload) =>
					uploadDriveFileToObjectStorage(deps, upload.key, upload.body, upload.type, upload.ext, upload.filename),
				),
			);
		} catch (err) {
			// 一部成功時も DB に紐付かないオブジェクトを残さないよう、削除してから中断する。
			await deleteDriveFileObjects(deps, keys);
			throw err;
		}

		applyDriveFileStorage(file, location, alts, content);

		return {
			file,
			cleanup: () => deleteDriveFileObjects(deps, keys),
		};
	}

	const { location, savedKeys } = saveDriveFileToInternalStorage(deps, path, alts);
	applyDriveFileStorage(file, location, alts, content);

	return {
		file,
		cleanup: async () => {
			await Promise.all(
				savedKeys.map(async (accessKey) => {
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

async function persistStoredDriveFile(
	deps: DriveFileUploadDependencies,
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

			if (!force && stored.file.md5 != null) {
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
			const isModerator = isLocalUser ? await userIsModerator({ ...deps, db: transaction }, user) : false;
			let expiredFiles: MiDriveFile[] = [];

			if (!stored.file.isLink && !isModerator) {
				const policies = await fetchRolePolicies({ ...deps, db: transaction }, user);
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

		if (!result.inserted) {
			await stored.cleanup();
		}
		for (const deletion of result.expiredFileDeletions) {
			await publishEnqueuedDriveFileDeletion(deps, deletion);
		}
		return { file: result.file, inserted: result.inserted };
	} catch (err) {
		await stored.cleanup();
		throw err;
	}
}

async function expireOldDriveFile(
	deps: DriveFileUploadDependencies,
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

/** 保存しないリモートのファイルを、中身を取得せずに登録するための相手の申告 (ActivityPub の Document)。 */
export type DeclaredRemoteFile = {
	mime: string;
	width: number | null;
	height: number | null;
	blurhash: string | null;
};

/**
 * センシティブ判定をこの利用者のファイルに掛ける設定か。掛けるなら中身が要る。
 * ロールの alwaysMarkNsfw による省略は登録時に判定するので、ここでは管理設定だけを見る (取得が要らない場合にも取得する側へ倒れる)。
 */
function sensitiveDetectionApplies(meta: MiMeta, user: MiUser | null): boolean {
	if (user == null || meta.sensitiveMediaDetection === 'none') return false;
	if (meta.sensitiveMediaDetection === 'local') return user.host == null;
	if (meta.sensitiveMediaDetection === 'remote') return user.host != null;
	return true;
}

/** 取得していないファイルの情報。md5 は中身が無いので null、size は保存しないリモートのファイルと同じく 0。 */
function declaredFileInfo(declared: DeclaredRemoteFile): Omit<FileInfo, 'md5'> & { md5: null } {
	return {
		size: 0,
		md5: null,
		type: { mime: declared.mime, ext: mime.extension(declared.mime) || null },
		...(declared.width == null ? {} : { width: declared.width }),
		...(declared.height == null ? {} : { height: declared.height }),
		...(declared.blurhash == null ? {} : { blurhash: declared.blurhash }),
		sensitive: false,
		porn: false,
		warnings: [],
	};
}

export type AddDriveFileArgs = {
	user: MiUser | null;
	/** 中身の一時ファイル。null なら取得せずに declared で登録する (isLink の場合だけ)。 */
	path: string | null;
	declared?: DeclaredRemoteFile | null;
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

export async function addDriveFile(
	deps: DriveFileUploadDependencies,
	{
		user,
		path,
		declared = null,
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
	if (path == null && (!isLink || declared == null)) {
		throw new Error('A drive file without content must be a link with declared metadata');
	}
	const userRoleNSFW = user != null && (await fetchRolePolicies(deps, user)).alwaysMarkNsfw;
	let skipNsfwCheck = user == null || userRoleNSFW;
	if (deps.meta.sensitiveMediaDetection === 'none') {
		skipNsfwCheck = true;
	}
	if (user != null && deps.meta.sensitiveMediaDetection === 'local' && user.host != null) {
		skipNsfwCheck = true;
	}
	if (user != null && deps.meta.sensitiveMediaDetection === 'remote' && user.host == null) {
		skipNsfwCheck = true;
	}

	const info: Omit<FileInfo, 'md5'> & { md5: string | null } =
		path == null
			? declaredFileInfo(declared!)
			: await deps.fileInfoService.fetchFileInfo(path, {
					fileName: name,
					skipSensitiveDetection: skipNsfwCheck,
					sensitiveThreshold: driveSensitiveMediaThreshold(deps.meta),
					sensitiveThresholdForPorn: 0.75,
					enableSensitiveMediaDetectionForVideos: deps.meta.enableSensitiveMediaDetectionForVideos,
				});

	const detectedName = correctFilename(
		name != null && validateDriveFileName(name) ? name : 'untitled',
		ext ?? info.type.ext,
	);

	if (user != null && !force && info.md5 != null) {
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
		const isModerator = isLocalUser ? await userIsModerator(deps, user) : false;
		if (!isModerator) {
			const policies = await fetchRolePolicies(deps, user);

			const allowedMimeTypes = policies.uploadableFileTypes;
			const isAllowed = allowedMimeTypes.some((mimeType) => {
				if (mimeType === '*' || mimeType === '*/*') {
					return true;
				}
				if (mimeType.endsWith('/*')) {
					return info.type.mime.startsWith(mimeType.slice(0, -1));
				}
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
				await expireOldDriveFile(
					deps,
					await fetchUserByIdOrFailFromDatabase(deps.db, user.id),
					driveCapacity - info.size,
				);
			}
		}
	}

	const fetchFolder = async () => {
		if (!folderId) {
			return null;
		}

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
		if (info.height !== undefined) {
			properties.height = info.height;
		}
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

	if (user != null && isMediaSilencedHost(deps.meta.mediaSilencedHosts, user.host)) {
		file.isSensitive = true;
	}
	if (info.sensitive && profile!.autoSensitive) {
		file.isSensitive = true;
	}
	if (info.sensitive && deps.meta.setSensitiveFlagAutomatically) {
		file.isSensitive = true;
	}
	if (userRoleNSFW) {
		file.isSensitive = true;
	}

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
		if (path == null || info.md5 == null) throw new Error('A stored drive file needs its content');
		const stored = await saveDriveFile(deps, file, path, detectedName, info.type.mime, info.md5, info.size);
		const persisted = await persistStoredDriveFile(deps, stored, user, force, sensitive);
		if (!persisted.inserted) {
			return persisted.file;
		}
		file = persisted.file;
	}

	// リモートユーザーのアバター/バナー取り込み (ap-person) もここを通るが、
	// このストリームを購読するのはローカルのクライアントだけなので publish しない。
	if (user != null && user.host == null) {
		packDriveFileOrFail(deps, file, { self: true }).then((packedFile) => {
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
	deps: DriveFileUploadDependencies,
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
		} else if (!validateDriveFileName(name)) {
			throw new ApiError({
				status: 400,
				message: 'Invalid file name.',
				code: 'INVALID_FILE_NAME',
				id: 'f449b209-0c60-4e51-84d5-29486263bfd4',
			});
		}
	}

	try {
		const driveFile = await addDriveFile(deps, {
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
		return await packDriveFileOrFail(deps, driveFile, { self: true });
	} catch (err) {
		if (err instanceof ApiError) {
			throw err;
		}
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

export async function uploadDriveFileFromUrl(
	deps: DriveFileUploadDependencies,
	{
		url,
		user,
		folderId = null,
		uri = null,
		sensitive = false,
		force = false,
		isLink = false,
		declared = null,
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
		/** 相手の申告。保存しない (isLink) ファイルで中身が要らなければ、取得せずにこれで登録する。 */
		declared?: DeclaredRemoteFile | null;
		comment?: string | null;
		requestIp?: string | null;
		requestHeaders?: Record<string, string> | null;
	},
): Promise<MiDriveFile> {
	// 同じ利用者の同じ URI は一意なので、登録済みなら取得し直さない。
	if (user != null && uri != null) {
		const existing = await fetchDriveFileByUriAndUserIdFromDatabase(deps.db, uri, user.id);
		if (existing != null) {
			if (sensitive && !existing.isSensitive) {
				await updateDriveFileInDatabase(deps.db, existing.id, { isSensitive: true });
				existing.isSensitive = true;
			}
			return existing;
		}
	}

	// 保存しないファイルは相手の申告で登録し、センシティブ判定に中身が必要な場合だけ取得する。
	// 中身を取得せずに登録すると、取得と書き込みを省ける。
	if (isLink && declared != null && !sensitiveDetectionApplies(deps.meta, user)) {
		const driveFile = await addDriveFile(deps, {
			user,
			path: null,
			declared,
			name: await deps.downloadService.fetchFileName(url),
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
		deps.logger.info(`Registered without fetching: ${driveFile.id}`);
		return driveFile;
	}

	const [path, cleanup] = await createTemp();

	try {
		const { filename: name } = await deps.downloadService.downloadUrl(url, path);

		if (comment !== null && name === comment) {
			comment = null;
		}

		const driveFile = await addDriveFile(deps, {
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
	deps: DriveFileUploadDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
	ip: string | null,
	headers: Record<string, string> | null,
): void {
	const params = parseApiParams(driveFilesUploadFromUrlParamDef, body);

	uploadDriveFileFromUrl(deps, {
		url: params.url,
		user: me,
		folderId: params.folderId,
		sensitive: params.isSensitive,
		force: params.force,
		comment: params.comment,
		// URLアップロードは enableIpLogging に関係なく接続元情報を記録する。
		requestIp: ip,
		requestHeaders: headers,
	})
		.then(async (file) => {
			const packedFile = await packDriveFileOrFail(deps, file, { self: true });
			deps.publishMainStream?.(me.id, 'urlUploadFinished', {
				marker: params.marker,
				file: packedFile,
			});
		})
		.catch((err: unknown) => {
			// 応答は先に返しているので、失敗はストリームで知らせる (知らせないとクライアントは待ち続ける)。
			deps.logger.warn(`Failed to upload from url: ${err}`);
			deps.publishMainStream?.(me.id, 'urlUploadFailed', { marker: params.marker });
		});
}
