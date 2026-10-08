/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import {
	createUserWithProfileAndPublickeyInDatabase,
	fetchUserByIdOrFailFromDatabase,
} from '@/core/user/user-store.js';
import {
	createFollowingInDatabase,
	fetchFollowingByFollowerIdAndFolloweeIdFromDatabase,
} from '@/core/user/following-store.js';
import { createFollowRequestInDatabase, fetchFollowRequestFromDatabase } from '@/core/user/follow-request-store.js';
import {
	createBlockingInDatabase,
	fetchBlockingByBlockerIdAndBlockeeIdFromDatabase,
} from '@/core/user/blocking-store.js';
import { updateUserProfileInDatabase } from '@/core/user/user-profile-store.js';
import { genId } from '@/misc/id/gen-id.js';
import {
	handleQueueRelationshipBlock,
	handleQueueRelationshipFollow,
	handleQueueRelationshipUnblock,
	handleQueueRelationshipUnfollow,
} from '@/queue/handlers/relationship.js';
import type { QueueRelationshipDependencies } from '@/queue/handlers/relationship.js';
import type { MiUser } from '@/models/User.js';
import type { DeliverQueue } from '@/core/queue/queues.js';
import type { DeliverJobData } from '@/core/queue/types.js';
import { queueOutbox } from '@/db/schema/queue-outbox.js';

async function createTestUser(
	deps: QueueRelationshipDependencies,
	options: { isLocked?: boolean } = {},
): Promise<MiUser> {
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

async function createTestRemoteUser(deps: QueueRelationshipDependencies, host: string): Promise<MiUser> {
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

/** 配送ジョブの content は JSON 文字列で持つ。 */
function activityType(content: string): unknown {
	return (JSON.parse(content) as { type?: unknown }).type;
}

/** 直接 deliver queue に積まれた配送を記録する。 */
function recordDeliverQueue(): { queue: DeliverQueue; jobs: DeliverJobData[] } {
	const jobs: DeliverJobData[] = [];
	const add = vi.fn(async (_name: string, data: DeliverJobData) => {
		jobs.push(data);
	});
	return { queue: { add } as unknown as DeliverQueue, jobs };
}

describe('hono-queue-relationship', () => {
	let runtime: RuntimeDependencies;
	let deps: QueueRelationshipDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = { ...runtime, logger: runtime.loggerService.getLogger('test-relationship') };
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	/** outbox 経由で登録された、指定した inbox 宛ての配送の activity type。 */
	async function outboxActivityTypesTo(inbox: string): Promise<unknown[]> {
		const rows = await runtime.db.select().from(queueOutbox);
		return rows.flatMap((row) => {
			const raw = row.data;
			if (typeof raw !== 'object' || raw === null || !('data' in raw)) return [];
			const data = raw.data as Partial<DeliverJobData>;
			if (data.to !== inbox) return [];
			return typeof data.content === 'string' ? [activityType(data.content)] : [];
		});
	}

	test('handleQueueRelationshipUnfollow はフォロー関係を削除しカウントを減らす', async () => {
		const follower = await createTestUser(deps);
		const followee = await createTestUser(deps);
		const counts = async () => {
			const [a, b] = await Promise.all([
				fetchUserByIdOrFailFromDatabase(deps.db, follower.id),
				fetchUserByIdOrFailFromDatabase(deps.db, followee.id),
			]);
			return { following: a.followingCount, followers: b.followersCount };
		};

		// フォローの経路で集計を進めてから解除し、集計が戻ることを見る。
		expect(await handleQueueRelationshipFollow(deps, { from: follower, to: followee, silent: true })).toBe('ok');
		expect(await counts()).toEqual({ following: 1, followers: 1 });

		const result = await handleQueueRelationshipUnfollow(deps, { from: follower, to: followee, silent: true });
		expect(result).toBe('ok');

		const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, follower.id, followee.id);
		expect(following).toBeNull();
		expect(await counts()).toEqual({ following: 0, followers: 0 });

		// 解除済みへの再実行は、関係も集計も変えない。
		expect(await handleQueueRelationshipUnfollow(deps, { from: follower, to: followee, silent: true })).toBe('ok');
		expect(await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, follower.id, followee.id)).toBeNull();
		expect(await counts()).toEqual({ following: 0, followers: 0 });
	});

	test('handleQueueRelationshipBlock はフォロー解除・フォローリクエスト取消・ブロック作成を行う', async () => {
		const blocker = await createTestUser(deps);
		const blockee = await createTestUser(deps);

		await createFollowRequestInDatabase(deps.db, {
			id: genId(),
			followerId: blockee.id,
			followeeId: blocker.id,
		});
		expect(await handleQueueRelationshipBlock(deps, { from: blocker, to: blockee, silent: true })).toBe('ok');
		expect(await fetchFollowRequestFromDatabase(deps.db, blockee.id, blocker.id)).toBeNull();
		expect(await handleQueueRelationshipUnblock(deps, { from: blocker, to: blockee, silent: true })).toBe('ok');
		expect(await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, blocker.id, blockee.id)).toBeNull();

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

		const result = await handleQueueRelationshipBlock(deps, { from: blocker, to: blockee, silent: true });
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

	test('handleQueueRelationshipUnblock はブロックを削除する', async () => {
		const blocker = await createTestUser(deps);
		const blockee = await createTestUser(deps);

		await handleQueueRelationshipBlock(deps, { from: blocker, to: blockee, silent: true });
		expect(await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, blocker.id, blockee.id)).not.toBeNull();

		const result = await handleQueueRelationshipUnblock(deps, { from: blocker, to: blockee, silent: true });
		expect(result).toBe('ok');

		expect(await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, blocker.id, blockee.id)).toBeNull();

		expect(await handleQueueRelationshipUnblock(deps, { from: blocker, to: blockee, silent: true })).toBe(
			'skip: not blocking',
		);
		expect(await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, blocker.id, blockee.id)).toBeNull();
	});

	test('handleQueueRelationshipFollow はローカル同士なら即フォロー関係を作る', async () => {
		const follower = await createTestUser(deps);
		const followee = await createTestUser(deps);

		const result = await handleQueueRelationshipFollow(deps, { from: follower, to: followee, silent: true });
		expect(result).toBe('ok');

		const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, follower.id, followee.id);
		expect(following).not.toBeNull();
	});

	test('handleQueueRelationshipFollow は鍵アカウントに対してフォローリクエストを作る', async () => {
		const follower = await createTestUser(deps);
		const followee = await createTestUser(deps, { isLocked: true });

		const result = await handleQueueRelationshipFollow(deps, { from: follower, to: followee, silent: true });
		expect(result).toBe('ok: follow request created');

		const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, follower.id, followee.id);
		expect(following).toBeNull();

		const request = await fetchFollowRequestFromDatabase(deps.db, follower.id, followee.id);
		expect(request).not.toBeNull();
	});

	test('handleQueueRelationshipFollow はリモートフォロワーが既にフォロー済みならAcceptを配送するだけ', async () => {
		const follower = await createTestRemoteUser(deps, 'honoqueuerel-remote-a.example.com');
		const followee = await createTestUser(deps);

		await createFollowingInDatabase(deps.db, {
			id: genId(),
			followerId: follower.id,
			followeeId: followee.id,
		});

		const direct = recordDeliverQueue();
		const result = await handleQueueRelationshipFollow(
			{ ...deps, deliverQueue: direct.queue },
			{ from: follower, to: followee, silent: true },
		);
		expect(result).toBe('ok: already following');

		// Accept は outbox に 1 件だけ登録し、他の配送はしない。
		expect(await outboxActivityTypesTo(follower.inbox!)).toEqual(['Accept']);
		expect(direct.jobs).toEqual([]);
	});

	test('handleQueueRelationshipFollow はブロックされていればRejectを配送して終了する', async () => {
		const follower = await createTestRemoteUser(deps, 'honoqueuerel-remote-b.example.com');
		const followee = await createTestUser(deps);

		await createBlockingInDatabase(deps.db, {
			id: genId(),
			blockerId: followee.id,
			blockeeId: follower.id,
		});

		const direct = recordDeliverQueue();
		const result = await handleQueueRelationshipFollow(
			{ ...deps, deliverQueue: direct.queue },
			{ from: follower, to: followee, silent: true },
		);
		expect(result).toBe('rejected: blocked');

		expect(direct.jobs.map((job) => ({ to: job.to, type: activityType(job.content) }))).toEqual([
			{ to: follower.inbox, type: 'Reject' },
		]);
		expect(await outboxActivityTypesTo(follower.inbox!)).toEqual([]);

		const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, follower.id, followee.id);
		expect(following).toBeNull();
	});

	test('handleQueueRelationshipFollow はリモートフォロワー側のブロックを外してからフォローを作る', async () => {
		// リモートの Undo Block が届かないまま相手がフォローしてきたとき、残っている相手側のブロックを消す。
		const follower = await createTestRemoteUser(deps, 'honoqueuerel-remote-unblock.example.com');
		const followee = await createTestUser(deps);

		await createBlockingInDatabase(deps.db, {
			id: genId(),
			blockerId: follower.id,
			blockeeId: followee.id,
		});

		await handleQueueRelationshipFollow(deps, { from: follower, to: followee, silent: true });

		expect(await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, follower.id, followee.id)).toBeNull();
		expect(await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, follower.id, followee.id)).not.toBeNull();
	});

	test('handleQueueRelationshipFollow はローカルフォロワーがブロックされていれば例外を投げる', async () => {
		const follower = await createTestUser(deps);
		const followee = await createTestUser(deps);

		await createBlockingInDatabase(deps.db, {
			id: genId(),
			blockerId: followee.id,
			blockeeId: follower.id,
		});

		await expect(handleQueueRelationshipFollow(deps, { from: follower, to: followee, silent: true })).rejects.toThrow();
	});

	test('handleQueueRelationshipFollow は既にローカルからフォロー済みなら例外を投げる', async () => {
		const follower = await createTestUser(deps);
		const followee = await createTestUser(deps);

		await createFollowingInDatabase(deps.db, {
			id: genId(),
			followerId: follower.id,
			followeeId: followee.id,
		});

		await expect(handleQueueRelationshipFollow(deps, { from: follower, to: followee, silent: true })).rejects.toThrow();
	});

	test('handleQueueRelationshipFollow はリモート同士のフォローを拒否する', async () => {
		const follower = await createTestRemoteUser(deps, 'honoqueuerel-remote-c.example.com');
		const followee = await createTestRemoteUser(deps, 'honoqueuerel-remote-d.example.com');

		await expect(handleQueueRelationshipFollow(deps, { from: follower, to: followee, silent: true })).rejects.toThrow();
	});

	test('handleQueueRelationshipFollow はautoAcceptFollowedが有効ならフォロー中の相手からのフォローを自動承認する', async () => {
		const followee = await createTestUser(deps, { isLocked: true });
		await updateUserProfileInDatabase(deps.db, followee.id, { autoAcceptFollowed: true });
		const follower = await createTestUser(deps);

		await createFollowingInDatabase(deps.db, {
			id: genId(),
			followerId: followee.id,
			followeeId: follower.id,
		});

		const result = await handleQueueRelationshipFollow(deps, { from: follower, to: followee, silent: true });
		expect(result).toBe('ok');

		const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, follower.id, followee.id);
		expect(following).not.toBeNull();
	});
});
