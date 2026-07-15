/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type * as Bull from 'bullmq';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase, type MiDrizzlePool } from '@/drizzle.js';
import { createDriveFileInDatabase, fetchDriveFileByIdFromDatabase } from '@/core/DriveFileStore.js';
import { genId } from '@/misc/id/gen-id.js';
import {
	deleteFileSyncForHonoApi,
	handleHonoQueueCleanRemoteFiles,
	handleHonoQueueDeleteFile,
	type HonoQueueObjectStorageDependencies,
} from '@/queue/handlers/object-storage.js';
import type { ObjectStorageFileJobData } from '@/queue/types.js';
import type { Config } from '@/config.js';

function fakeJob(data: Record<string, unknown> = {}): Bull.Job<Record<string, unknown>> {
	return { data, updateProgress: async () => {} } as unknown as Bull.Job<Record<string, unknown>>;
}

describe('hono-queue-object-storage', () => {
	let pool: MiDrizzlePool;
	let db: MiDrizzleDatabase;
	let config: Config;
	let deleteMock: ReturnType<typeof vi.fn>;
	let deps: HonoQueueObjectStorageDependencies;

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
				getS3Client: (() => ({})) as unknown as HonoQueueObjectStorageDependencies['s3Service']['getS3Client'],
				delete: deleteMock as unknown as HonoQueueObjectStorageDependencies['s3Service']['delete'],
			},
			internalStorageService: { del: vi.fn() },
			chartWriters: {
				driveChart: { update: async () => {} } as unknown as HonoQueueObjectStorageDependencies['chartWriters']['driveChart'],
				perUserDriveChart: { update: async () => {} } as unknown as HonoQueueObjectStorageDependencies['chartWriters']['perUserDriveChart'],
				instanceChart: { updateDrive: async () => {} } as unknown as HonoQueueObjectStorageDependencies['chartWriters']['instanceChart'],
			},
		};
	});

	test('handleHonoQueueDeleteFile: object storageからキーを削除する', async () => {
		deleteMock.mockClear();
		const result = await handleHonoQueueDeleteFile(deps, fakeJob({ key: 'some-key' }) as unknown as Bull.Job<ObjectStorageFileJobData>);
		expect(result).toBe('Success');
		expect(deleteMock).toHaveBeenCalledOnce();
	});

	test('handleHonoQueueDeleteFile: NoSuchKeyエラーは握りつぶす', async () => {
		deleteMock.mockClear();
		deleteMock.mockRejectedValueOnce(Object.assign(new Error('no such key'), { name: 'NoSuchKey' }));
		await expect(handleHonoQueueDeleteFile(deps, fakeJob({ key: 'missing-key' }) as unknown as Bull.Job<ObjectStorageFileJobData>)).resolves.toBe('Success');
	});

	test('deleteFileSyncForHonoApi: storedInternalなファイルはinternalStorageServiceで削除しレコードも消える', async () => {
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

		await deleteFileSyncForHonoApi(deps, file!, false);

		const after = await fetchDriveFileByIdFromDatabase(db, fileId);
		expect(after).toBeNull();
		expect(deps.internalStorageService.del).toHaveBeenCalledWith(`access-${fileId}`);
	});

	test('handleHonoQueueCleanRemoteFiles: リモートかつisLink=falseのキャッシュ済みファイルを削除する', async () => {
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

		await handleHonoQueueCleanRemoteFiles(deps, fakeJob());

		const after = await fetchDriveFileByIdFromDatabase(db, fileId);
		expect(after).toBeNull();
	});
});
