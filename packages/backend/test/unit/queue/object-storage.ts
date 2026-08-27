/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type * as Bull from 'bullmq';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase, type MiDrizzlePool } from '@/drizzle.js';
import { createDriveFileInDatabase, fetchDriveFileByIdFromDatabase } from '@/core/drive/DriveFileStore.js';
import { genId } from '@/misc/id/gen-id.js';
import {
	deleteFileSyncForApi,
	handleQueueCleanRemoteFiles,
	handleQueueDeleteFile,
	type QueueObjectStorageDependencies,
} from '@/queue/handlers/object-storage.js';
import type { ObjectStorageFileJobData } from '@/queue/types.js';
import type { Config } from '@/config.js';
import type { MiUser } from '@/models/User.js';

function fakeJob(data: Record<string, unknown> = {}): Bull.Job<Record<string, unknown>> {
	return { data, updateProgress: async () => {} } as unknown as Bull.Job<Record<string, unknown>>;
}

describe('hono-queue-object-storage', () => {
	let pool: MiDrizzlePool;
	let db: MiDrizzleDatabase;
	let config: Config;
	let deleteMock: ReturnType<typeof vi.fn>;
	let deps: QueueObjectStorageDependencies;

	beforeAll(() => {
		config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);
	});

	afterAll(async () => {
		await pool.end();
	});

	beforeAll(() => {
		deleteMock = vi.fn().mockResolvedValue(undefined);
		deps = {
			db,
			meta: { enableChartsForFederatedInstances: false, objectStorageBucket: 'test-bucket' },
			s3Service: {
				getS3Client: (() => ({})) as unknown as QueueObjectStorageDependencies['s3Service']['getS3Client'],
				delete: deleteMock as unknown as QueueObjectStorageDependencies['s3Service']['delete'],
			},
			internalStorageService: { del: vi.fn() },
			chartWriters: {
				driveChart: {
					update: async () => {},
				} as unknown as QueueObjectStorageDependencies['chartWriters']['driveChart'],
				perUserDriveChart: {
					update: async () => {},
				} as unknown as QueueObjectStorageDependencies['chartWriters']['perUserDriveChart'],
				instanceChart: {
					updateDrive: async () => {},
				} as unknown as QueueObjectStorageDependencies['chartWriters']['instanceChart'],
			},
		};
	});

	test('handleQueueDeleteFile: object storageからキーを削除する', async () => {
		deleteMock.mockClear();
		const result = await handleQueueDeleteFile(
			deps,
			fakeJob({ key: 'some-key' }) as unknown as Bull.Job<ObjectStorageFileJobData>,
		);
		expect(result).toBe('Success');
		expect(deleteMock).toHaveBeenCalledOnce();
	});

	test('handleQueueDeleteFile: NoSuchKeyエラーは握りつぶす', async () => {
		deleteMock.mockClear();
		deleteMock.mockRejectedValueOnce(Object.assign(new Error('no such key'), { name: 'NoSuchKey' }));
		await expect(
			handleQueueDeleteFile(deps, fakeJob({ key: 'missing-key' }) as unknown as Bull.Job<ObjectStorageFileJobData>),
		).resolves.toBe('Success');
	});

	test('deleteFileSyncForApi: storedInternalなファイルはinternalStorageServiceで削除しレコードも消える', async () => {
		const fileId = genId();
		await createDriveFileInDatabase(db, {
			id: fileId,
			md5: 'dummy',
			name: 'test.png',
			type: 'image/png',
			size: 100,
			storedInternal: true,
			url: 'http://example.com/test.png',
			accessKey: `access-${fileId}`,
			userHost: null,
		});
		const file = await fetchDriveFileByIdFromDatabase(db, fileId);
		expect(file).not.toBeNull();

		await deleteFileSyncForApi(deps, file!, false);

		const after = await fetchDriveFileByIdFromDatabase(db, fileId);
		expect(after).toBeNull();
		expect(deps.internalStorageService.del).toHaveBeenCalledWith(`access-${fileId}`);
	});

	test('deleteFileSyncForApi: storage削除失敗時はレコードを残し、再試行後にだけ消す', async () => {
		const fileId = genId();
		await createDriveFileInDatabase(db, {
			id: fileId,
			md5: 'retryable-delete',
			name: 'retry.png',
			type: 'image/png',
			size: 100,
			storedInternal: true,
			url: 'http://example.com/retry.png',
			accessKey: `retry-access-${fileId}`,
			userHost: null,
		});
		const file = await fetchDriveFileByIdFromDatabase(db, fileId);
		const del = deps.internalStorageService.del as ReturnType<typeof vi.fn>;
		del.mockRejectedValueOnce(new Error('injected storage failure')).mockResolvedValue(undefined);

		await expect(deleteFileSyncForApi(deps, file!, false)).rejects.toThrow('injected storage failure');
		expect(await fetchDriveFileByIdFromDatabase(db, fileId)).not.toBeNull();

		await expect(deleteFileSyncForApi(deps, file!, false)).resolves.toBeUndefined();
		expect(await fetchDriveFileByIdFromDatabase(db, fileId)).toBeNull();
		await expect(deleteFileSyncForApi(deps, file!, false)).resolves.toBeUndefined();
		expect(await fetchDriveFileByIdFromDatabase(db, fileId)).toBeNull();
	});

	test('deleteFileSyncForApi: 同じ削除の再試行ではチャートを重複減算しない', async () => {
		const fileId = genId();
		await createDriveFileInDatabase(db, {
			id: fileId,
			md5: 'idempotent-delete',
			name: 'idempotent.png',
			type: 'image/png',
			size: 100,
			storedInternal: true,
			url: 'http://example.com/idempotent.png',
			accessKey: `idempotent-access-${fileId}`,
			userHost: null,
		});
		const file = await fetchDriveFileByIdFromDatabase(db, fileId);
		const driveUpdate = vi.fn().mockResolvedValue(undefined);
		const retryDeps = {
			...deps,
			chartWriters: {
				...deps.chartWriters,
				driveChart: {
					update: driveUpdate,
				} as unknown as QueueObjectStorageDependencies['chartWriters']['driveChart'],
			},
		};

		await deleteFileSyncForApi(retryDeps, file!, false);
		await deleteFileSyncForApi(retryDeps, file!, false);

		expect(driveUpdate).toHaveBeenCalledOnce();
	});

	test('deleteFileSyncForApi: moderatorによる削除を監査ログへ渡す', async () => {
		const fileId = genId();
		await createDriveFileInDatabase(db, {
			id: fileId,
			md5: 'moderator-delete',
			name: 'moderated.png',
			type: 'image/png',
			size: 100,
			storedInternal: true,
			url: 'http://example.com/moderated.png',
			accessKey: `moderated-access-${fileId}`,
			userHost: null,
		});
		const file = await fetchDriveFileByIdFromDatabase(db, fileId);
		const deleter = { id: genId() } as MiUser;
		const logDriveFileDeletion = vi.fn().mockResolvedValue(undefined);

		await deleteFileSyncForApi(
			{
				...deps,
				isModerator: vi.fn().mockResolvedValue(true),
				logDriveFileDeletion,
			},
			file!,
			false,
			deleter,
		);

		expect(logDriveFileDeletion).toHaveBeenCalledWith(
			expect.anything(),
			deleter,
			expect.any(String),
			expect.objectContaining({ fileId, fileUserId: null }),
		);
	});

	test('handleQueueCleanRemoteFiles: リモートかつisLink=falseのキャッシュ済みファイルを削除する', async () => {
		deleteMock.mockClear();
		const fileId = genId();
		await createDriveFileInDatabase(db, {
			id: fileId,
			md5: 'dummy',
			name: 'remote.png',
			type: 'image/png',
			size: 100,
			storedInternal: false,
			isLink: false,
			url: 'https://remote.example.com/remote.png',
			accessKey: `remote-access-${fileId}`,
			userHost: 'remote.example.com',
		});

		await handleQueueCleanRemoteFiles(deps, fakeJob());

		const after = await fetchDriveFileByIdFromDatabase(db, fileId);
		expect(after).toBeNull();
	});
});
