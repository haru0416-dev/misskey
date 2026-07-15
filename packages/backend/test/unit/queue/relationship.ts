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
import * as Bull from 'bullmq';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/UserStore.js';
import { createFollowingInDatabase, fetchFollowingByFollowerIdAndFolloweeIdFromDatabase } from '@/core/FollowingStore.js';
import { createFollowRequestInDatabase, fetchFollowRequestFromDatabase } from '@/core/FollowRequestStore.js';
import { createBlockingInDatabase, fetchBlockingByBlockerIdAndBlockeeIdFromDatabase } from '@/core/BlockingStore.js';
import { updateUserProfileInDatabase } from '@/core/UserProfileStore.js';
import { genId } from '@/misc/id/gen-id.js';
import {
	handleHonoQueueRelationshipBlock,
	handleHonoQueueRelationshipFollow,
	handleHonoQueueRelationshipUnblock,
	handleHonoQueueRelationshipUnfollow,
	type HonoQueueRelationshipDependencies,
} from '@/queue/handlers/relationship.js';
import type { RelationshipJobData } from '@/queue/types.js';
import type { MiUser } from '@/models/User.js';

function fakeJob(data: RelationshipJobData): Bull.Job<RelationshipJobData> {
	return { data } as Bull.Job<RelationshipJobData>;
}

async function createTestUser(deps: HonoQueueRelationshipDependencies, options: { isLocked?: boolean } = {}): Promise<MiUser> {
	const id = genId();
	return await createUserWithProfileAndPublickeyInDatabase(deps.db, {
		user: {
			id,
			username: `honoqueuerel${id}`,
			usernameLower: `honoqueuerel${id}`.toLowerCase(),
			isLocked: options.isLocked,
		},
		profile: { userId: id },
	});
}

async function createTestRemoteUser(deps: HonoQueueRelationshipDependencies, host: string): Promise<MiUser> {
	const id = genId();
	return await createUserWithProfileAndPublickeyInDatabase(deps.db, {
		user: {
			id,
			username: `honoqueuerelremote${id}`,
			usernameLower: `honoqueuerelremote${id}`.toLowerCase(),
			host,
			uri: `https://${host}/users/${id}`,
			inbox: `https://${host}/users/${id}/inbox`,
		},
		profile: { userId: id },
	});
}

describe('hono-queue-relationship', () => {
	let runtime: RuntimeDependencies;
	let deps: HonoQueueRelationshipDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = { ...runtime, logger: runtime.loggerService.getLogger('test-relationship') };
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('handleHonoQueueRelationshipUnfollow はフォロー関係を削除しカウントを減らす', async () => {
		const follower = await createTestUser(deps);
		const followee = await createTestUser(deps);

		await createFollowingInDatabase(deps.db, {
			id: genId(),
			followerId: follower.id,
			followeeId: followee.id,
		});

		const result = await handleHonoQueueRelationshipUnfollow(deps, fakeJob({ from: follower, to: followee, silent: true }));
		expect(result).toBe('ok');

		const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, follower.id, followee.id);
		expect(following).toBeNull();
	});

	test('handleHonoQueueRelationshipUnfollow は既にフォローしていない場合は何もしない', async () => {
		const follower = await createTestUser(deps);
		const followee = await createTestUser(deps);

		const result = await handleHonoQueueRelationshipUnfollow(deps, fakeJob({ from: follower, to: followee, silent: true }));
		expect(result).toBe('ok');
	});

	test('handleHonoQueueRelationshipBlock はフォロー解除・フォローリクエスト取消・ブロック作成を行う', async () => {
		const blocker = await createTestUser(deps);
		const blockee = await createTestUser(deps);

		// 双方向のフォロー関係と、blockee→blocker のフォローリクエストを用意しておく
		await createFollowingInDatabase(deps.db, {
			id: genId(),
			followerId: blocker.id,
			followeeId: blockee.id,
		});
		await createFollowingInDatabase(deps.db, {
			id: genId(),
			followerId: blockee.id,
			followeeId: blocker.id,
		});

		const result = await handleHonoQueueRelationshipBlock(deps, fakeJob({ from: blocker, to: blockee, silent: true }));
		expect(result).toBe('ok');

		const [followingA, followingB, blocking] = await Promise.all([
			fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, blocker.id, blockee.id),
			fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, blockee.id, blocker.id),
			fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, blocker.id, blockee.id),
		]);

		expect(followingA).toBeNull();
		expect(followingB).toBeNull();
		expect(blocking).not.toBeNull();
		expect(blocking!.blockerId).toBe(blocker.id);
		expect(blocking!.blockeeId).toBe(blockee.id);
	});

	test('handleHonoQueueRelationshipBlock は保留中のフォローリクエストも取り消す', async () => {
		const blocker = await createTestUser(deps);
		const blockee = await createTestUser(deps);

		await createFollowRequestInDatabase(deps.db, {
			id: genId(),
			followerId: blockee.id,
			followeeId: blocker.id,
		});

		await handleHonoQueueRelationshipBlock(deps, fakeJob({ from: blocker, to: blockee, silent: true }));

		const request = await fetchFollowRequestFromDatabase(deps.db, blockee.id, blocker.id);
		expect(request).toBeNull();
	});

	test('handleHonoQueueRelationshipUnblock はブロックを削除する', async () => {
		const blocker = await createTestUser(deps);
		const blockee = await createTestUser(deps);

		await handleHonoQueueRelationshipBlock(deps, fakeJob({ from: blocker, to: blockee, silent: true }));
		expect(await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, blocker.id, blockee.id)).not.toBeNull();

		const result = await handleHonoQueueRelationshipUnblock(deps, fakeJob({ from: blocker, to: blockee, silent: true }));
		expect(result).toBe('ok');

		expect(await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, blocker.id, blockee.id)).toBeNull();
	});

	test('handleHonoQueueRelationshipUnblock はブロックしていない場合はskipする', async () => {
		const blocker = await createTestUser(deps);
		const blockee = await createTestUser(deps);

		const result = await handleHonoQueueRelationshipUnblock(deps, fakeJob({ from: blocker, to: blockee, silent: true }));
		expect(result).toBe('skip: not blocking');
	});

	test('handleHonoQueueRelationshipFollow はローカル同士なら即フォロー関係を作る', async () => {
		const follower = await createTestUser(deps);
		const followee = await createTestUser(deps);

		const result = await handleHonoQueueRelationshipFollow(deps, fakeJob({ from: follower, to: followee, silent: true }));
		expect(result).toBe('ok');

		const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, follower.id, followee.id);
		expect(following).not.toBeNull();
	});

	test('handleHonoQueueRelationshipFollow は鍵アカウントに対してフォローリクエストを作る', async () => {
		const follower = await createTestUser(deps);
		const followee = await createTestUser(deps, { isLocked: true });

		const result = await handleHonoQueueRelationshipFollow(deps, fakeJob({ from: follower, to: followee, silent: true }));
		expect(result).toBe('ok: follow request created');

		const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, follower.id, followee.id);
		expect(following).toBeNull();

		const request = await fetchFollowRequestFromDatabase(deps.db, follower.id, followee.id);
		expect(request).not.toBeNull();
	});

	test('handleHonoQueueRelationshipFollow はリモートフォロワーが既にフォロー済みならAcceptを配送するだけ', async () => {
		const follower = await createTestRemoteUser(deps, 'honoqueuerel-remote-a.example.com');
		const followee = await createTestUser(deps);

		await createFollowingInDatabase(deps.db, {
			id: genId(),
			followerId: follower.id,
			followeeId: followee.id,
		});

		const result = await handleHonoQueueRelationshipFollow(deps, fakeJob({ from: follower, to: followee, silent: true }));
		expect(result).toBe('ok: already following');
	});

	test('handleHonoQueueRelationshipFollow はブロックされていればRejectを配送して終了する', async () => {
		const follower = await createTestRemoteUser(deps, 'honoqueuerel-remote-b.example.com');
		const followee = await createTestUser(deps);

		await createBlockingInDatabase(deps.db, {
			id: genId(),
			blockerId: followee.id,
			blockeeId: follower.id,
		});

		const result = await handleHonoQueueRelationshipFollow(deps, fakeJob({ from: follower, to: followee, silent: true }));
		expect(result).toBe('rejected: blocked');

		const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, follower.id, followee.id);
		expect(following).toBeNull();
	});

	test('handleHonoQueueRelationshipFollow はローカルフォロワーがブロックされていれば例外を投げる', async () => {
		const follower = await createTestUser(deps);
		const followee = await createTestUser(deps);

		await createBlockingInDatabase(deps.db, {
			id: genId(),
			blockerId: followee.id,
			blockeeId: follower.id,
		});

		await expect(handleHonoQueueRelationshipFollow(deps, fakeJob({ from: follower, to: followee, silent: true }))).rejects.toThrow();
	});

	test('handleHonoQueueRelationshipFollow は既にローカルからフォロー済みなら例外を投げる', async () => {
		const follower = await createTestUser(deps);
		const followee = await createTestUser(deps);

		await createFollowingInDatabase(deps.db, {
			id: genId(),
			followerId: follower.id,
			followeeId: followee.id,
		});

		await expect(handleHonoQueueRelationshipFollow(deps, fakeJob({ from: follower, to: followee, silent: true }))).rejects.toThrow();
	});

	test('handleHonoQueueRelationshipFollow はリモート同士のフォローを拒否する', async () => {
		const follower = await createTestRemoteUser(deps, 'honoqueuerel-remote-c.example.com');
		const followee = await createTestRemoteUser(deps, 'honoqueuerel-remote-d.example.com');

		await expect(handleHonoQueueRelationshipFollow(deps, fakeJob({ from: follower, to: followee, silent: true }))).rejects.toThrow();
	});

	test('handleHonoQueueRelationshipFollow はautoAcceptFollowedが有効ならフォロー中の相手からのフォローを自動承認する', async () => {
		const followee = await createTestUser(deps, { isLocked: true });
		await updateUserProfileInDatabase(deps.db, followee.id, { autoAcceptFollowed: true });
		const follower = await createTestUser(deps);

		// followee が既に follower をフォローしている状態にしておく
		await createFollowingInDatabase(deps.db, {
			id: genId(),
			followerId: followee.id,
			followeeId: follower.id,
		});

		const result = await handleHonoQueueRelationshipFollow(deps, fakeJob({ from: follower, to: followee, silent: true }));
		expect(result).toBe('ok');

		const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, follower.id, followee.id);
		expect(following).not.toBeNull();
	});
});
