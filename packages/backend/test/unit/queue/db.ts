/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';
// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しないため
// 未定義になる。テスト用にダミー値を注入しておく。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type * as Bull from 'bullmq';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserInDatabase } from '@/core/UserStore.js';
import { createDriveFileInDatabase, fetchDriveFileByIdFromDatabase } from '@/core/DriveFileStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { handleHonoQueueDeleteDriveFiles, type HonoQueueDbDependencies } from '@/queue/handlers/db.js';
import type { DbJobDataWithUser } from '@/queue/types.js';

function fakeJob(data: DbJobDataWithUser): Bull.Job<DbJobDataWithUser> {
	return { data, updateProgress: async () => {} } as unknown as Bull.Job<DbJobDataWithUser>;
}

describe('hono-queue-db', () => {
	let runtime: RuntimeDependencies;
	let deps: HonoQueueDbDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = { ...runtime, logger: runtime.loggerService.getLogger('test-db') };
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('handleHonoQueueDeleteDriveFiles: 対象ユーザーのドライブファイルを全て削除する', async () => {
		const userId = genId();
		await createUserInDatabase(runtime.db, {
			id: userId,
			username: `honoqueuedb${userId}`,
			usernameLower: `honoqueuedb${userId}`.toLowerCase(),
		});

		const fileIds = [genId(), genId(), genId()];
		for (const fileId of fileIds) {
			await createDriveFileInDatabase(runtime.db, {
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
			expect(await fetchDriveFileByIdFromDatabase(runtime.db, fileId)).toBeNull();
		}
	});

	test('存在しないuserIdは何もしない', async () => {
		await expect(handleHonoQueueDeleteDriveFiles(deps, fakeJob({ user: { id: genId() } }))).resolves.toBeUndefined();
	});
});
