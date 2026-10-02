/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/user-store.js';
import { createMutingInDatabase } from '@/core/user/muting-store.js';
import { createBlockingInDatabase } from '@/core/user/blocking-store.js';
import { createUserListInDatabase } from '@/core/user/user-list-store.js';
import { createUserListMembershipInDatabase } from '@/core/user/user-list-membership-store.js';
import { createAntennaInDatabase } from '@/core/antenna/antenna-store.js';
import { createFollowingInDatabase } from '@/core/user/following-store.js';
import { createNoteInDatabase } from '@/core/note/note-store.js';
import { createNoteFavoriteInDatabase } from '@/core/note/note-favorite-store.js';
import { createClipInDatabase } from '@/core/clip/clip-store.js';
import { createClipNoteInDatabase } from '@/core/clip/clip-note-store.js';
import { listDriveFilesByUserIdWithPaginationFromDatabase } from '@/core/drive/drive-file-store.js';
import { genId } from '@/misc/id/gen-id.js';
import {
	handleQueueExportAntennas,
	handleQueueExportBlocking,
	handleQueueExportClips,
	handleQueueExportFavorites,
	handleQueueExportFollowing,
	handleQueueExportMuting,
	handleQueueExportNotes,
	handleQueueExportUserLists,
} from '@/queue/handlers/db.js';
import type { QueueDbDependencies } from '@/queue/handlers/db.js';
import type { DbExportAntennasData, DbExportFollowingData } from '@/core/queue/types.js';
import type { MiUser } from '@/models/User.js';

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

		await handleQueueExportMuting(deps, { user: { id: muter.id } }, async () => {});

		const files = await listDriveFilesByUserIdWithPaginationFromDatabase(runtime.db, muter.id, { limit: 10 });
		expect(files.some((f) => f.name.startsWith('mute-') && f.name.endsWith('.csv'))).toBe(true);
	});

	test('handleQueueExportBlocking: ブロック一覧をCSVとしてドライブに保存する', async () => {
		const blocker = await createTestUser(runtime, 'honoqueueexpblock');
		const blockee = await createTestUser(runtime, 'honoqueueexpblock');
		await createBlockingInDatabase(runtime.db, { id: genId(), blockerId: blocker.id, blockeeId: blockee.id });

		await handleQueueExportBlocking(deps, { user: { id: blocker.id } }, async () => {});

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

		await handleQueueExportUserLists(deps, { user: { id: owner.id } });

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

		await handleQueueExportAntennas(deps, { user: { id: owner.id } } satisfies DbExportAntennasData);

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

		await handleQueueExportFollowing(deps, {
			user: { id: follower.id },
			excludeMuting: false,
			excludeInactive: false,
		} satisfies DbExportFollowingData);

		const files = await listDriveFilesByUserIdWithPaginationFromDatabase(runtime.db, follower.id, { limit: 10 });
		expect(files.some((f) => f.name.startsWith('following-') && f.name.endsWith('.csv'))).toBe(true);
	});

	test('存在しないuserIdは何もしない', async () => {
		await expect(handleQueueExportMuting(deps, { user: { id: genId() } }, async () => {})).resolves.toBeUndefined();
		await expect(handleQueueExportNotes(deps, { user: { id: genId() } }, async () => {})).resolves.toBeUndefined();
		await expect(handleQueueExportFavorites(deps, { user: { id: genId() } }, async () => {})).resolves.toBeUndefined();
		await expect(handleQueueExportClips(deps, { user: { id: genId() } }, async () => {})).resolves.toBeUndefined();
	});
});
