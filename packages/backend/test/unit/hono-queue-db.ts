/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type * as Bull from 'bullmq';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase, type MiDrizzlePool } from '@/drizzle.js';
import { createUserInDatabase } from '@/core/UserStore.js';
import { createDriveFileInDatabase, fetchDriveFileByIdFromDatabase } from '@/core/DriveFileStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { handleHonoQueueDeleteDriveFiles, type HonoQueueDbDependencies } from '@/server/hono-queue-db.js';
import type { DbJobDataWithUser } from '@/queue/types.js';
import type { Config } from '@/config.js';

function fakeJob(data: DbJobDataWithUser): Bull.Job<DbJobDataWithUser> {
	return { data, updateProgress: async () => {} } as unknown as Bull.Job<DbJobDataWithUser>;
}

describe('hono-queue-db', () => {
	let pool: MiDrizzlePool;
	let db: MiDrizzleDatabase;
	let config: Config;
	let deps: HonoQueueDbDependencies;

	beforeAll(() => {
		config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);
		deps = {
			db,
			meta: { enableChartsForFederatedInstances: false, objectStorageBucket: 'test-bucket' },
			s3Service: { getS3Client: (() => ({})) as HonoQueueDbDependencies['s3Service']['getS3Client'], delete: vi.fn().mockResolvedValue(undefined) },
			internalStorageService: { del: vi.fn() },
			chartWriters: {
				driveChart: { update: async () => {} } as HonoQueueDbDependencies['chartWriters']['driveChart'],
				perUserDriveChart: { update: async () => {} } as HonoQueueDbDependencies['chartWriters']['perUserDriveChart'],
				instanceChart: { updateDrive: async () => {} } as HonoQueueDbDependencies['chartWriters']['instanceChart'],
			},
		};
	});

	afterAll(async () => {
		await pool.end();
	});

	test('handleHonoQueueDeleteDriveFiles: 対象ユーザーのドライブファイルを全て削除する', async () => {
		const userId = genId(config);
		await createUserInDatabase(db, {
			id: userId,
			username: `honoqueuedb${userId}`,
			usernameLower: `honoqueuedb${userId}`.toLowerCase(),
		});

		const fileIds = [genId(config), genId(config), genId(config)];
		for (const fileId of fileIds) {
			await createDriveFileInDatabase(db, {
				id: fileId,
				md5: 'dummy',
				name: 'test.png',
				type: 'image/png',
				size: 100,
				storedInternal: true,
				url: 'http://example.com/test.png',
				accessKey: `access-${fileId}`,
				userId,
				userHost: null,
			});
		}

		await handleHonoQueueDeleteDriveFiles(deps, fakeJob({ user: { id: userId } }));

		for (const fileId of fileIds) {
			expect(await fetchDriveFileByIdFromDatabase(db, fileId)).toBeNull();
		}
	});

	test('存在しないuserIdは何もしない', async () => {
		await expect(handleHonoQueueDeleteDriveFiles(deps, fakeJob({ user: { id: genId(config) } }))).resolves.toBeUndefined();
	});
});
