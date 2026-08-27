/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しないため
// 未定義になる。テスト用にダミー値を注入しておく。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type * as Bull from 'bullmq';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { createMutingInDatabase } from '@/core/user/MutingStore.js';
import { createBlockingInDatabase } from '@/core/user/BlockingStore.js';
import { createUserListInDatabase } from '@/core/user/UserListStore.js';
import { createUserListMembershipInDatabase } from '@/core/user/UserListMembershipStore.js';
import { createAntennaInDatabase } from '@/core/antenna/AntennaStore.js';
import { createFollowingInDatabase } from '@/core/user/FollowingStore.js';
import { listDriveFilesByUserIdWithPaginationFromDatabase } from '@/core/drive/DriveFileStore.js';
import { genId } from '@/misc/id/gen-id.js';
import {
	handleQueueExportAntennas,
	handleQueueExportBlocking,
	handleQueueExportFollowing,
	handleQueueExportMuting,
	handleQueueExportUserLists,
	type QueueDbDependencies,
} from '@/queue/handlers/db.js';
import type { DBExportAntennasData, DbExportFollowingData, DbJobDataWithUser } from '@/queue/types.js';
import type { MiUser } from '@/models/User.js';

function fakeJob<T>(data: T): Bull.Job<T> {
	return { data, updateProgress: async () => {} } as unknown as Bull.Job<T>;
}

async function createTestUser(runtime: RuntimeDependencies, prefix: string): Promise<MiUser> {
	const id = genId();
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
	let deps: QueueDbDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = { ...runtime, logger: runtime.loggerService.getLogger('test-export') };
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('handleQueueExportMuting: ミュート一覧をCSVとしてドライブに保存する', async () => {
		const muter = await createTestUser(runtime, 'honoqueueexpmute');
		const mutee = await createTestUser(runtime, 'honoqueueexpmute');
		await createMutingInDatabase(runtime.db, { id: genId(), muterId: muter.id, muteeId: mutee.id, expiresAt: null });

		await handleQueueExportMuting(deps, fakeJob({ user: { id: muter.id } }));

		const files = await listDriveFilesByUserIdWithPaginationFromDatabase(runtime.db, muter.id, { limit: 10 });
		expect(files.some((f) => f.name.startsWith('mute-') && f.name.endsWith('.csv'))).toBe(true);
	});

	test('handleQueueExportBlocking: ブロック一覧をCSVとしてドライブに保存する', async () => {
		const blocker = await createTestUser(runtime, 'honoqueueexpblock');
		const blockee = await createTestUser(runtime, 'honoqueueexpblock');
		await createBlockingInDatabase(runtime.db, { id: genId(), blockerId: blocker.id, blockeeId: blockee.id });

		await handleQueueExportBlocking(deps, fakeJob({ user: { id: blocker.id } }));

		const files = await listDriveFilesByUserIdWithPaginationFromDatabase(runtime.db, blocker.id, { limit: 10 });
		expect(files.some((f) => f.name.startsWith('blocking-') && f.name.endsWith('.csv'))).toBe(true);
	});

	test('handleQueueExportUserLists: リスト一覧をCSVとしてドライブに保存する', async () => {
		const owner = await createTestUser(runtime, 'honoqueueexplist');
		const member = await createTestUser(runtime, 'honoqueueexplist');
		const listId = genId();
		await createUserListInDatabase(runtime.db, { id: listId, userId: owner.id, name: 'test-list' });
		await createUserListMembershipInDatabase(runtime.db, {
			id: genId(),
			userId: member.id,
			userListId: listId,
			userListUserId: owner.id,
		});

		await handleQueueExportUserLists(deps, fakeJob({ user: { id: owner.id } }));

		const files = await listDriveFilesByUserIdWithPaginationFromDatabase(runtime.db, owner.id, { limit: 10 });
		expect(files.some((f) => f.name.startsWith('user-lists-') && f.name.endsWith('.csv'))).toBe(true);
	});

	test('handleQueueExportAntennas: アンテナ一覧をJSONとしてドライブに保存する', async () => {
		const owner = await createTestUser(runtime, 'honoqueueexpant');
		await createAntennaInDatabase(runtime.db, {
			id: genId(),
			userId: owner.id,
			name: 'test-antenna',
			src: 'all',
			withFile: false,
			lastUsedAt: new Date(),
		});

		await handleQueueExportAntennas(deps, fakeJob<DBExportAntennasData>({ user: { id: owner.id } }));

		const files = await listDriveFilesByUserIdWithPaginationFromDatabase(runtime.db, owner.id, { limit: 10 });
		expect(files.some((f) => f.name.startsWith('antennas-') && f.name.endsWith('.json'))).toBe(true);
	});

	test('handleQueueExportFollowing: フォロー一覧をCSVとしてドライブに保存する', async () => {
		const follower = await createTestUser(runtime, 'honoqueueexpfollow');
		const followee = await createTestUser(runtime, 'honoqueueexpfollow');
		await createFollowingInDatabase(runtime.db, {
			id: genId(),
			followerId: follower.id,
			followeeId: followee.id,
		});

		await handleQueueExportFollowing(
			deps,
			fakeJob<DbExportFollowingData>({
				user: { id: follower.id },
				excludeMuting: false,
				excludeInactive: false,
			}),
		);

		const files = await listDriveFilesByUserIdWithPaginationFromDatabase(runtime.db, follower.id, { limit: 10 });
		expect(files.some((f) => f.name.startsWith('following-') && f.name.endsWith('.csv'))).toBe(true);
	});

	test('存在しないuserIdは何もしない', async () => {
		await expect(handleQueueExportMuting(deps, fakeJob({ user: { id: genId() } }))).resolves.toBeUndefined();
	});
});
