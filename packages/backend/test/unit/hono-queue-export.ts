/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';
// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しないため
// 未定義になる。テスト用にダミー値を注入しておく。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type * as Bull from 'bullmq';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/UserStore.js';
import { createMutingInDatabase } from '@/core/MutingStore.js';
import { createBlockingInDatabase } from '@/core/BlockingStore.js';
import { createUserListInDatabase } from '@/core/UserListStore.js';
import { createUserListMembershipInDatabase } from '@/core/UserListMembershipStore.js';
import { createAntennaInDatabase } from '@/core/AntennaStore.js';
import { createFollowingInDatabase } from '@/core/FollowingStore.js';
import { listDriveFilesByUserIdWithPaginationFromDatabase } from '@/core/DriveFileStore.js';
import { genId } from '@/misc/id/gen-id.js';
import {
	handleHonoQueueExportAntennas,
	handleHonoQueueExportBlocking,
	handleHonoQueueExportFollowing,
	handleHonoQueueExportMuting,
	handleHonoQueueExportUserLists,
	type HonoQueueDbDependencies,
} from '@/server/hono-queue-db.js';
import type { DBExportAntennasData, DbExportFollowingData, DbJobDataWithUser } from '@/queue/types.js';
import type { MiUser } from '@/models/User.js';

function fakeJob<T>(data: T): Bull.Job<T> {
	return { data, updateProgress: async () => {} } as unknown as Bull.Job<T>;
}

async function createTestUser(runtime: RuntimeDependencies, prefix: string): Promise<MiUser> {
	const id = genId(runtime.config);
	return await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
		user: {
			id,
			username: `${prefix}${id}`,
			usernameLower: `${prefix}${id}`.toLowerCase(),
		},
		profile: { userId: id },
	});
}

describe('hono-queue-db (export)', () => {
	let runtime: RuntimeDependencies;
	let deps: HonoQueueDbDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = { ...runtime, logger: runtime.loggerService.getLogger('test-export') };
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('handleHonoQueueExportMuting: ミュート一覧をCSVとしてドライブに保存する', async () => {
		const muter = await createTestUser(runtime, 'honoqueueexpmute');
		const mutee = await createTestUser(runtime, 'honoqueueexpmute');
		await createMutingInDatabase(runtime.db, { id: genId(runtime.config), muterId: muter.id, muteeId: mutee.id, expiresAt: null });

		await handleHonoQueueExportMuting(deps, fakeJob({ user: { id: muter.id } }));

		const files = await listDriveFilesByUserIdWithPaginationFromDatabase(runtime.db, muter.id, { limit: 10 });
		expect(files.some(f => f.name.startsWith('mute-') && f.name.endsWith('.csv'))).toBe(true);
	});

	test('handleHonoQueueExportBlocking: ブロック一覧をCSVとしてドライブに保存する', async () => {
		const blocker = await createTestUser(runtime, 'honoqueueexpblock');
		const blockee = await createTestUser(runtime, 'honoqueueexpblock');
		await createBlockingInDatabase(runtime.db, { id: genId(runtime.config), blockerId: blocker.id, blockeeId: blockee.id });

		await handleHonoQueueExportBlocking(deps, fakeJob({ user: { id: blocker.id } }));

		const files = await listDriveFilesByUserIdWithPaginationFromDatabase(runtime.db, blocker.id, { limit: 10 });
		expect(files.some(f => f.name.startsWith('blocking-') && f.name.endsWith('.csv'))).toBe(true);
	});

	test('handleHonoQueueExportUserLists: リスト一覧をCSVとしてドライブに保存する', async () => {
		const owner = await createTestUser(runtime, 'honoqueueexplist');
		const member = await createTestUser(runtime, 'honoqueueexplist');
		const listId = genId(runtime.config);
		await createUserListInDatabase(runtime.db, { id: listId, userId: owner.id, name: 'test-list' });
		await createUserListMembershipInDatabase(runtime.db, { id: genId(runtime.config), userId: member.id, userListId: listId, userListUserId: owner.id });

		await handleHonoQueueExportUserLists(deps, fakeJob({ user: { id: owner.id } }));

		const files = await listDriveFilesByUserIdWithPaginationFromDatabase(runtime.db, owner.id, { limit: 10 });
		expect(files.some(f => f.name.startsWith('user-lists-') && f.name.endsWith('.csv'))).toBe(true);
	});

	test('handleHonoQueueExportAntennas: アンテナ一覧をJSONとしてドライブに保存する', async () => {
		const owner = await createTestUser(runtime, 'honoqueueexpant');
		await createAntennaInDatabase(runtime.db, {
			id: genId(runtime.config),
			userId: owner.id,
			name: 'test-antenna',
			src: 'all',
			withFile: false,
			lastUsedAt: new Date(),
		});

		await handleHonoQueueExportAntennas(deps, fakeJob<DBExportAntennasData>({ user: { id: owner.id } }));

		const files = await listDriveFilesByUserIdWithPaginationFromDatabase(runtime.db, owner.id, { limit: 10 });
		expect(files.some(f => f.name.startsWith('antennas-') && f.name.endsWith('.json'))).toBe(true);
	});

	test('handleHonoQueueExportFollowing: フォロー一覧をCSVとしてドライブに保存する', async () => {
		const follower = await createTestUser(runtime, 'honoqueueexpfollow');
		const followee = await createTestUser(runtime, 'honoqueueexpfollow');
		await createFollowingInDatabase(runtime.db, {
			id: genId(runtime.config),
			followerId: follower.id,
			followeeId: followee.id,
		});

		await handleHonoQueueExportFollowing(deps, fakeJob<DbExportFollowingData>({
			user: { id: follower.id },
			excludeMuting: false,
			excludeInactive: false,
		}));

		const files = await listDriveFilesByUserIdWithPaginationFromDatabase(runtime.db, follower.id, { limit: 10 });
		expect(files.some(f => f.name.startsWith('following-') && f.name.endsWith('.csv'))).toBe(true);
	});

	test('存在しないuserIdは何もしない', async () => {
		await expect(handleHonoQueueExportMuting(deps, fakeJob({ user: { id: genId(runtime.config) } }))).resolves.toBeUndefined();
	});
});
