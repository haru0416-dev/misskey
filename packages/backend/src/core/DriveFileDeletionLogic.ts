/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Config } from '@/config.js';
import {
	enqueueDbJobInOutbox,
	enqueueInlineDbJobInOutbox,
	publishDbOutboxRowEagerly,
	runInlineDbOutboxJob,
} from '@/core/QueueOutboxStore.js';
import { fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import type { DbQueue } from '@/core/queues.js';
import { driveFile } from '@/db/schema/drive-file.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiUser } from '@/models/User.js';
import { genId } from '@/misc/id/gen-id.js';
import type { DbDeleteDriveFileJobData } from '@/queue/types.js';

type DriveFileChartSnapshot = Pick<MiDriveFile, 'id' | 'userId' | 'userHost' | 'size'>;

type DriveFileDeletionFinalizationDependencies = {
	db: MiDrizzleDatabase;
	meta: Pick<MiMeta, 'enableChartsForFederatedInstances'>;
	deleteInternalFile: (key: string) => unknown;
	enqueueDeleteObjectStorageFile: (key: string) => unknown;
	updateDriveChart?: (file: DriveFileChartSnapshot, isAdditional: boolean) => unknown;
	updatePerUserDriveChart?: (file: DriveFileChartSnapshot, isAdditional: boolean) => unknown;
	updateInstanceDriveChart?: (file: DriveFileChartSnapshot, isAdditional: boolean) => unknown;
	publishDriveStream?: ((userId: MiUser['id'], type: 'fileDeleted', value: MiDriveFile['id']) => void) | undefined;
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

export type DriveFileDeletionDependencies = DriveFileDeletionFinalizationDependencies & {
	config: Pick<Config, 'queues'>;
	dbQueue: DbQueue;
};

export type EnqueuedDriveFileDeletion = {
	outboxId: string;
	data: DbDeleteDriveFileJobData;
	opts: {
		attempts: 12;
		backoff: { type: 'exponential'; delay: 1000 };
		removeOnComplete: true;
		removeOnFail: false;
	};
};

async function postProcessDriveFileDeletion(
	deps: DriveFileDeletionFinalizationDependencies,
	data: DbDeleteDriveFileJobData,
	deleter?: MiUser,
): Promise<void> {
	const { file, isExpired } = data;
	let moderationLog:
		| {
				deleter: MiUser;
				info: {
					fileId: MiDriveFile['id'];
					fileUserId: MiDriveFile['userId'];
					fileUserUsername: MiUser['username'] | null;
					fileUserHost: MiUser['host'] | null;
				};
		  }
		| undefined;
	if (
		deleter &&
		deps.isModerator != null &&
		deps.logDriveFileDeletion != null &&
		(await deps.isModerator(deleter)) &&
		file.userId !== deleter.id
	) {
		moderationLog = {
			deleter,
			info: {
				fileId: file.id,
				fileUserId: file.userId,
				fileUserUsername: file.userUsername,
				fileUserHost: file.userHost,
			},
		};
	}

	const finalized = await deps.db.transaction(async (transaction) => {
		if (isExpired && file.userHost !== null && file.uri != null) {
			const replacementKeys = data.replacementKeys;
			if (replacementKeys == null) throw new Error('Remote-link deletion is missing replacement keys');
			const updated = await transaction
				.update(driveFile)
				.set({
					isLink: true,
					url: file.uri,
					thumbnailUrl: null,
					webpublicUrl: null,
					storedInternal: false,
					accessKey: replacementKeys.accessKey,
					thumbnailAccessKey: replacementKeys.thumbnailAccessKey,
					webpublicAccessKey: replacementKeys.webpublicAccessKey,
				})
				.where(and(eq(driveFile.id, file.id), eq(driveFile.isLink, false)))
				.returning({ id: driveFile.id });
			if (updated.length === 0) return false;
		} else {
			const deleted = await transaction
				.delete(driveFile)
				.where(eq(driveFile.id, file.id))
				.returning({ id: driveFile.id });
			if (deleted.length === 0) return false;
		}
		if (moderationLog != null && deps.logDriveFileDeletion != null) {
			await deps.logDriveFileDeletion(transaction, moderationLog.deleter, data.operationId, moderationLog.info);
		}
		return true;
	});
	if (!finalized) return;

	void deps.updateDriveChart?.(file, false);
	if (file.userHost == null) {
		// ローカルユーザーのみ
		void deps.updatePerUserDriveChart?.(file, false);
	} else if (deps.meta.enableChartsForFederatedInstances) {
		void deps.updateInstanceDriveChart?.(file, false);
	}

	if (file.userId) {
		deps.publishDriveStream?.(file.userId, 'fileDeleted', file.id);
	}
}

async function deleteDriveFileStorage(
	deps: DriveFileDeletionFinalizationDependencies,
	file: DbDeleteDriveFileJobData['file'],
): Promise<void> {
	const keys = [
		file.accessKey,
		...(file.thumbnailUrl == null ? [] : [file.thumbnailAccessKey]),
		...(file.webpublicUrl == null ? [] : [file.webpublicAccessKey]),
	].filter((key): key is string => key != null);

	if (file.storedInternal) {
		await Promise.all(keys.map((key) => Promise.resolve(deps.deleteInternalFile(key))));
	} else if (!file.isLink) {
		await Promise.all(keys.map((key) => Promise.resolve(deps.enqueueDeleteObjectStorageFile(key))));
	}
}

async function createDriveFileDeletionData(
	db: MiDrizzleDatabase,
	file: MiDriveFile,
	isExpired: boolean,
	deleter?: MiUser,
): Promise<DbDeleteDriveFileJobData> {
	const owner = file.userId == null ? null : await fetchUserByIdFromDatabase(db, file.userId);
	return {
		operationId: genId(),
		file: {
			id: file.id,
			userId: file.userId,
			userHost: file.userHost,
			userUsername: owner?.username ?? null,
			size: file.size,
			uri: file.uri,
			storedInternal: file.storedInternal,
			isLink: file.isLink,
			accessKey: file.accessKey,
			thumbnailUrl: file.thumbnailUrl,
			thumbnailAccessKey: file.thumbnailAccessKey,
			webpublicUrl: file.webpublicUrl,
			webpublicAccessKey: file.webpublicAccessKey,
		},
		isExpired,
		...(isExpired && file.userHost !== null && file.uri != null
			? {
					replacementKeys: {
						accessKey: randomUUID(),
						thumbnailAccessKey: 'thumbnail-' + randomUUID(),
						webpublicAccessKey: 'webpublic-' + randomUUID(),
					},
				}
			: {}),
		...(deleter == null ? {} : { deleterId: deleter.id }),
	};
}

export async function enqueueDriveFileDeletion(
	db: MiDrizzleDatabase,
	file: MiDriveFile,
	isExpired = false,
	deleter?: MiUser,
): Promise<EnqueuedDriveFileDeletion> {
	const data = await createDriveFileDeletionData(db, file, isExpired, deleter);
	const opts = {
		attempts: 12,
		backoff: { type: 'exponential', delay: 1000 },
		removeOnComplete: true,
		removeOnFail: false,
	} as const;
	const outboxId = await enqueueDbJobInOutbox(db, 'deleteDriveFile', data, opts);
	return { outboxId, data, opts };
}

export function publishEnqueuedDriveFileDeletion(
	deps: Pick<DriveFileDeletionDependencies, 'db' | 'dbQueue'>,
	deletion: EnqueuedDriveFileDeletion,
): void {
	void publishDbOutboxRowEagerly(deps.db, deps.dbQueue, deletion.outboxId, {
		name: 'deleteDriveFile',
		data: deletion.data,
		opts: deletion.opts,
	});
}

export async function startDriveFileDeletion(
	deps: DriveFileDeletionDependencies,
	file: MiDriveFile,
	isExpired = false,
	deleter?: MiUser,
): Promise<void> {
	const data = await createDriveFileDeletionData(deps.db, file, isExpired, deleter);
	const opts = {
		attempts: 12,
		backoff: { type: 'exponential', delay: 1000 },
		removeOnComplete: true,
		removeOnFail: false,
	} as const;
	const deletion = { ...(await enqueueInlineDbJobInOutbox(deps.db, 'deleteDriveFile', data, opts)), data, opts };
	try {
		await runInlineDbOutboxJob(deps.db, deletion, async (db) => {
			const txDeps = { ...deps, db };
			await deleteDriveFileStorage(txDeps, data.file);
			await postProcessDriveFileDeletion(txDeps, data, deleter);
		});
	} catch {
		// 解放済みの outbox 行は次回のポーリングで再処理される。
	}
}

export async function finishDriveFileDeletionSync(
	deps: DriveFileDeletionFinalizationDependencies,
	file: MiDriveFile,
	isExpired = false,
	deleter?: MiUser,
): Promise<void> {
	await postProcessDriveFileDeletion(
		deps,
		await createDriveFileDeletionData(deps.db, file, isExpired, deleter),
		deleter,
	);
}

export async function finishEnqueuedDriveFileDeletion(
	deps: DriveFileDeletionFinalizationDependencies,
	data: DbDeleteDriveFileJobData,
	deleter?: MiUser,
): Promise<void> {
	await deleteDriveFileStorage(deps, data.file);
	await postProcessDriveFileDeletion(deps, data, deleter);
}
