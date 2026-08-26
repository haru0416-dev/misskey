/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Bull from 'bullmq';
import type { DeleteObjectCommandInput } from '@aws-sdk/client-s3';
import { finishDriveFileDeletionSync } from '@/core/drive/DriveFileDeletionLogic.js';
import {
	countRemoteCachedDriveFilesFromDatabase,
	listRemoteCachedDriveFilesWithPaginationFromDatabase,
} from '@/core/drive/DriveFileStore.js';
import type { InternalStorageService } from '@/core/drive/InternalStorageService.js';
import type { S3Service } from '@/core/drive/S3Service.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiMeta } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import type { ObjectStorageFileJobData } from '@/queue/types.js';
import type { HonoChartWriters } from '../../server/chart-runtime.js';

export type HonoQueueObjectStorageDependencies = {
	db: MiDrizzleDatabase;
	meta: Pick<MiMeta, 'enableChartsForFederatedInstances' | 'objectStorageBucket'>;
	s3Service: Pick<S3Service, 'getS3Client' | 'delete'>;
	internalStorageService: Pick<InternalStorageService, 'del'>;
	chartWriters: Pick<HonoChartWriters, 'driveChart' | 'perUserDriveChart' | 'instanceChart'>;
	publishDriveStream?: (userId: MiUser['id'], type: 'fileDeleted', value: MiDriveFile['id']) => void;
	isModerator?: (user: MiUser) => Promise<boolean>;
	logDriveFileDeletion?: (
		db: MiDrizzleDatabase,
		deleter: MiUser,
		logId: string,
		info: {
			fileId: MiDriveFile['id'];
			fileUserId: MiDriveFile['userId'];
			fileUserUsername: MiUser['username'] | null;
			fileUserHost: MiUser['host'] | null;
		},
	) => unknown;
};

export async function deleteObjectStorageFileForHonoApi(
	deps: HonoQueueObjectStorageDependencies,
	key: string,
): Promise<void> {
	try {
		const param = {
			Bucket: deps.meta.objectStorageBucket,
			Key: key,
		} as DeleteObjectCommandInput;

		await deps.s3Service.delete(deps.meta as MiMeta, param);
	} catch (err) {
		if ((err as { name?: string }).name === 'NoSuchKey') {
			return;
		}
		throw new Error(`Failed to delete the file from the object storage with the given key: ${key}`, {
			cause: err,
		});
	}
}

export async function deleteFileSyncForHonoApi(
	deps: HonoQueueObjectStorageDependencies,
	file: MiDriveFile,
	isExpired = false,
	deleter?: MiUser,
): Promise<void> {
	if (file.storedInternal) {
		const promises: Promise<void>[] = [];
		if (file.accessKey != null) promises.push(deps.internalStorageService.del(file.accessKey));

		if (file.thumbnailUrl && file.thumbnailAccessKey != null) {
			promises.push(deps.internalStorageService.del(file.thumbnailAccessKey));
		}

		if (file.webpublicUrl && file.webpublicAccessKey != null) {
			promises.push(deps.internalStorageService.del(file.webpublicAccessKey));
		}

		await Promise.all(promises);
	} else if (!file.isLink) {
		const promises: Promise<void>[] = [];

		if (file.accessKey != null) promises.push(deleteObjectStorageFileForHonoApi(deps, file.accessKey));

		if (file.thumbnailUrl && file.thumbnailAccessKey != null) {
			promises.push(deleteObjectStorageFileForHonoApi(deps, file.thumbnailAccessKey));
		}

		if (file.webpublicUrl && file.webpublicAccessKey != null) {
			promises.push(deleteObjectStorageFileForHonoApi(deps, file.webpublicAccessKey));
		}

		await Promise.all(promises);
	}

	await finishDriveFileDeletionSync(
		{
			db: deps.db,
			meta: deps.meta,
			deleteInternalFile: (key) => deps.internalStorageService.del(key),
			enqueueDeleteObjectStorageFile: (key) => deleteObjectStorageFileForHonoApi(deps, key),
			updateDriveChart: (f, isAdditional) => deps.chartWriters.driveChart.update(f, isAdditional),
			updatePerUserDriveChart: (f, isAdditional) => deps.chartWriters.perUserDriveChart.update(f, isAdditional),
			updateInstanceDriveChart: (f, isAdditional) => deps.chartWriters.instanceChart.updateDrive(f, isAdditional),
			publishDriveStream: (userId, type, value) => deps.publishDriveStream?.(userId, type, value),
			...(deps.isModerator == null ? {} : { isModerator: deps.isModerator }),
			...(deps.logDriveFileDeletion == null ? {} : { logDriveFileDeletion: deps.logDriveFileDeletion }),
		},
		file,
		isExpired,
		deleter,
	);
}

export async function handleHonoQueueCleanRemoteFiles(
	deps: HonoQueueObjectStorageDependencies,
	job: Bull.Job<Record<string, unknown>>,
): Promise<void> {
	let deletedCount = 0;
	let cursor: MiDriveFile['id'] | null = null;

	const total = await countRemoteCachedDriveFilesFromDatabase(deps.db);

	for (;;) {
		const files = await listRemoteCachedDriveFilesWithPaginationFromDatabase(deps.db, {
			limit: 8,
			sinceId: cursor,
		});

		if (files.length === 0) {
			job.updateProgress(100);
			break;
		}

		cursor = files.at(-1)?.id ?? null;

		await Promise.all(files.map((file) => deleteFileSyncForHonoApi(deps, file, true)));

		deletedCount += 8;

		job.updateProgress((deletedCount * total) / 100);
	}
}

export async function handleHonoQueueDeleteFile(
	deps: HonoQueueObjectStorageDependencies,
	job: Bull.Job<ObjectStorageFileJobData>,
): Promise<string> {
	await deleteObjectStorageFileForHonoApi(deps, job.data.key);
	return 'Success';
}
