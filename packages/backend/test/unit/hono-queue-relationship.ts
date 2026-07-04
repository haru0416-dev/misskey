/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as Bull from 'bullmq';
import * as Redis from 'ioredis';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase, type MiDrizzlePool } from '@/drizzle.js';
import { createDeliverQueue, createUserWebhookDeliverQueue, type DeliverQueue, type UserWebhookDeliverQueue } from '@/core/QueueModule.js';
import { fetchMetaFromDatabase } from '@/core/MetaStore.js';
import { createUserInDatabase } from '@/core/UserStore.js';
import { createFollowingInDatabase, fetchFollowingByFollowerIdAndFolloweeIdFromDatabase } from '@/core/FollowingStore.js';
import { createFollowRequestInDatabase, fetchFollowRequestFromDatabase } from '@/core/FollowRequestStore.js';
import { fetchBlockingByBlockerIdAndBlockeeIdFromDatabase } from '@/core/BlockingStore.js';
import { genId } from '@/misc/id/gen-id.js';
import {
	handleHonoQueueRelationshipBlock,
	handleHonoQueueRelationshipUnblock,
	handleHonoQueueRelationshipUnfollow,
	type HonoQueueRelationshipDependencies,
} from '@/server/hono-queue-relationship.js';
import type { RelationshipJobData } from '@/queue/types.js';
import type { MiUser } from '@/models/User.js';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/_.js';

function fakeJob(data: RelationshipJobData): Bull.Job<RelationshipJobData> {
	return { data } as Bull.Job<RelationshipJobData>;
}

async function createTestUser(deps: HonoQueueRelationshipDependencies): Promise<MiUser> {
	const id = genId(deps.config);
	return await createUserInDatabase(deps.db, {
		id,
		username: `honoqueuerel${id}`,
		usernameLower: `honoqueuerel${id}`.toLowerCase(),
	});
}

describe('hono-queue-relationship', () => {
	let pool: MiDrizzlePool;
	let db: MiDrizzleDatabase;
	let redis: Redis.Redis;
	let deliverQueue: DeliverQueue;
	let userWebhookDeliverQueue: UserWebhookDeliverQueue;
	let config: Config;
	let meta: MiMeta;
	let runtime: HonoQueueRelationshipDependencies;

	beforeAll(async () => {
		config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);
		redis = new Redis.Redis(config.redis);
		deliverQueue = createDeliverQueue(config);
		userWebhookDeliverQueue = createUserWebhookDeliverQueue(config);
		meta = await fetchMetaFromDatabase(db);
		runtime = { config, db, meta, redis, deliverQueue, userWebhookDeliverQueue };
	});

	afterAll(async () => {
		await Promise.all([
			deliverQueue.close(),
			userWebhookDeliverQueue.close(),
		]);
		redis.disconnect();
		await pool.end();
	});

	test('handleHonoQueueRelationshipUnfollow はフォロー関係を削除しカウントを減らす', async () => {
		const follower = await createTestUser(runtime);
		const followee = await createTestUser(runtime);

		await createFollowingInDatabase(runtime.db, {
			id: genId(runtime.config),
			followerId: follower.id,
			followeeId: followee.id,
		});

		const result = await handleHonoQueueRelationshipUnfollow(runtime, fakeJob({ from: follower, to: followee, silent: true }));
		expect(result).toBe('ok');

		const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(runtime.db, follower.id, followee.id);
		expect(following).toBeNull();
	});

	test('handleHonoQueueRelationshipUnfollow は既にフォローしていない場合は何もしない', async () => {
		const follower = await createTestUser(runtime);
		const followee = await createTestUser(runtime);

		const result = await handleHonoQueueRelationshipUnfollow(runtime, fakeJob({ from: follower, to: followee, silent: true }));
		expect(result).toBe('ok');
	});

	test('handleHonoQueueRelationshipBlock はフォロー解除・フォローリクエスト取消・ブロック作成を行う', async () => {
		const blocker = await createTestUser(runtime);
		const blockee = await createTestUser(runtime);

		// 双方向のフォロー関係と、blockee→blocker のフォローリクエストを用意しておく
		await createFollowingInDatabase(runtime.db, {
			id: genId(runtime.config),
			followerId: blocker.id,
			followeeId: blockee.id,
		});
		await createFollowingInDatabase(runtime.db, {
			id: genId(runtime.config),
			followerId: blockee.id,
			followeeId: blocker.id,
		});

		const result = await handleHonoQueueRelationshipBlock(runtime, fakeJob({ from: blocker, to: blockee, silent: true }));
		expect(result).toBe('ok');

		const [followingA, followingB, blocking] = await Promise.all([
			fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(runtime.db, blocker.id, blockee.id),
			fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(runtime.db, blockee.id, blocker.id),
			fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(runtime.db, blocker.id, blockee.id),
		]);

		expect(followingA).toBeNull();
		expect(followingB).toBeNull();
		expect(blocking).not.toBeNull();
		expect(blocking!.blockerId).toBe(blocker.id);
		expect(blocking!.blockeeId).toBe(blockee.id);
	});

	test('handleHonoQueueRelationshipBlock は保留中のフォローリクエストも取り消す', async () => {
		const blocker = await createTestUser(runtime);
		const blockee = await createTestUser(runtime);

		await createFollowRequestInDatabase(runtime.db, {
			id: genId(runtime.config),
			followerId: blockee.id,
			followeeId: blocker.id,
		});

		await handleHonoQueueRelationshipBlock(runtime, fakeJob({ from: blocker, to: blockee, silent: true }));

		const request = await fetchFollowRequestFromDatabase(runtime.db, blockee.id, blocker.id);
		expect(request).toBeNull();
	});

	test('handleHonoQueueRelationshipUnblock はブロックを削除する', async () => {
		const blocker = await createTestUser(runtime);
		const blockee = await createTestUser(runtime);

		await handleHonoQueueRelationshipBlock(runtime, fakeJob({ from: blocker, to: blockee, silent: true }));
		expect(await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(runtime.db, blocker.id, blockee.id)).not.toBeNull();

		const result = await handleHonoQueueRelationshipUnblock(runtime, fakeJob({ from: blocker, to: blockee, silent: true }));
		expect(result).toBe('ok');

		expect(await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(runtime.db, blocker.id, blockee.id)).toBeNull();
	});

	test('handleHonoQueueRelationshipUnblock はブロックしていない場合はskipする', async () => {
		const blocker = await createTestUser(runtime);
		const blockee = await createTestUser(runtime);

		const result = await handleHonoQueueRelationshipUnblock(runtime, fakeJob({ from: blocker, to: blockee, silent: true }));
		expect(result).toBe('skip: not blocking');
	});
});
