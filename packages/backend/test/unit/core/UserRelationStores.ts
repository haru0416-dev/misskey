/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '@/config.js';
import {
	createBlockingInDatabase,
	listBlockeeIdsByBlockerIdAndBlockeeIdsFromDatabase,
	listBlockerIdsByBlockeeIdAndBlockerIdsFromDatabase,
} from '@/core/user/BlockingStore.js';
import {
	createFollowRequestInDatabase,
	listFollowRequestFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase,
	listFollowRequestFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase,
} from '@/core/user/FollowRequestStore.js';
import {
	createFollowingInDatabase,
	deleteFollowingAndUpdateUserCountsByIdInDatabase,
	listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase,
	listFollowingsByFollowerIdAndFolloweeIdsFromDatabase,
} from '@/core/user/FollowingStore.js';
import { createMutingInDatabase, listMuteeIdsByMuterIdAndMuteeIdsFromDatabase } from '@/core/user/MutingStore.js';
import {
	createRenoteMutingInDatabase,
	listRenoteMuteeIdsByMuterIdAndMuteeIdsFromDatabase,
} from '@/core/user/RenoteMutingStore.js';
import { createUserWithProfileAndPublickeyInDatabase, fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { unfollow, type HonoApiAccountBlockingDependencies } from '@/server/rest/account-blocking.js';

describe('targeted user relation stores', () => {
	let runtime: RuntimeDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('returns only requested users in both relation directions', async () => {
		const users = await Promise.all(
			['viewer', 'target', 'unrelated'].map(async (prefix) => {
				const id = genId();
				return await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
					user: { id, username: `relation${prefix}${id}`, usernameLower: `relation${prefix}${id}` },
					profile: { userId: id },
				});
			}),
		);
		const [viewer, target, unrelated] = users;
		if (viewer == null || target == null || unrelated == null) throw new Error('Failed to create relation test users');

		for (const other of [target, unrelated]) {
			await Promise.all([
				createFollowingInDatabase(runtime.db, { id: genId(), followerId: viewer.id, followeeId: other.id }),
				createFollowingInDatabase(runtime.db, { id: genId(), followerId: other.id, followeeId: viewer.id }),
				createFollowRequestInDatabase(runtime.db, { id: genId(), followerId: viewer.id, followeeId: other.id }),
				createFollowRequestInDatabase(runtime.db, { id: genId(), followerId: other.id, followeeId: viewer.id }),
				createBlockingInDatabase(runtime.db, { id: genId(), blockerId: viewer.id, blockeeId: other.id }),
				createBlockingInDatabase(runtime.db, { id: genId(), blockerId: other.id, blockeeId: viewer.id }),
				createMutingInDatabase(runtime.db, { id: genId(), muterId: viewer.id, muteeId: other.id, expiresAt: null }),
				createRenoteMutingInDatabase(runtime.db, { id: genId(), muterId: viewer.id, muteeId: other.id }),
			]);
		}

		const targetIds = [target.id];
		const [followings, followers, outgoingRequests, incomingRequests, blockees, blockers, mutees, renoteMutees] =
			await Promise.all([
				listFollowingsByFollowerIdAndFolloweeIdsFromDatabase(runtime.db, viewer.id, targetIds),
				listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase(runtime.db, viewer.id, targetIds),
				listFollowRequestFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase(runtime.db, viewer.id, targetIds),
				listFollowRequestFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase(runtime.db, viewer.id, targetIds),
				listBlockeeIdsByBlockerIdAndBlockeeIdsFromDatabase(runtime.db, viewer.id, targetIds),
				listBlockerIdsByBlockeeIdAndBlockerIdsFromDatabase(runtime.db, viewer.id, targetIds),
				listMuteeIdsByMuterIdAndMuteeIdsFromDatabase(runtime.db, viewer.id, targetIds),
				listRenoteMuteeIdsByMuterIdAndMuteeIdsFromDatabase(runtime.db, viewer.id, targetIds),
			]);

		expect(followings.map((following) => following.followeeId)).toEqual(targetIds);
		expect(followers).toEqual(targetIds);
		expect(outgoingRequests).toEqual(targetIds);
		expect(incomingRequests).toEqual(targetIds);
		expect(blockees).toEqual(targetIds);
		expect(blockers).toEqual(targetIds);
		expect(mutees).toEqual(targetIds);
		expect(renoteMutees).toEqual(targetIds);
	});

	test('decrements counters only once when the same following is deleted concurrently', async () => {
		const followerId = genId();
		const followeeId = genId();
		const [follower, followee] = await Promise.all([
			createUserWithProfileAndPublickeyInDatabase(runtime.db, {
				user: {
					id: followerId,
					username: `deletefollower${followerId}`,
					usernameLower: `deletefollower${followerId}`,
					followingCount: 1,
				},
				profile: { userId: followerId },
			}),
			createUserWithProfileAndPublickeyInDatabase(runtime.db, {
				user: {
					id: followeeId,
					username: `deletefollowee${followeeId}`,
					usernameLower: `deletefollowee${followeeId}`,
					followersCount: 1,
				},
				profile: { userId: followeeId },
			}),
		]);
		const followingId = genId();
		await createFollowingInDatabase(runtime.db, { id: followingId, followerId, followeeId });

		const deleted = await Promise.all([
			deleteFollowingAndUpdateUserCountsByIdInDatabase(runtime.db, followingId, follower.id, followee.id),
			deleteFollowingAndUpdateUserCountsByIdInDatabase(runtime.db, followingId, follower.id, followee.id),
		]);
		const [updatedFollower, updatedFollowee] = await Promise.all([
			fetchUserByIdOrFailFromDatabase(runtime.db, followerId),
			fetchUserByIdOrFailFromDatabase(runtime.db, followeeId),
		]);

		expect(deleted.sort()).toEqual([false, true]);
		expect(updatedFollower.followingCount).toBe(0);
		expect(updatedFollowee.followersCount).toBe(0);
	});

	test('runs block/unfollow shared deletion side effects only once', async () => {
		const followerId = genId();
		const followeeId = genId();
		const [follower, followee] = await Promise.all([
			createUserWithProfileAndPublickeyInDatabase(runtime.db, {
				user: {
					id: followerId,
					username: `blockfollower${followerId}`,
					usernameLower: `blockfollower${followerId}`,
					followingCount: 1,
				},
				profile: { userId: followerId },
			}),
			createUserWithProfileAndPublickeyInDatabase(runtime.db, {
				user: {
					id: followeeId,
					username: `blockfollowee${followeeId}`,
					usernameLower: `blockfollowee${followeeId}`,
					followersCount: 1,
				},
				profile: { userId: followeeId },
			}),
		]);
		await createFollowingInDatabase(runtime.db, { id: genId(), followerId, followeeId });
		const publishInternalEvent = vi.fn();
		const deps = {
			db: runtime.db,
			redis: { set: vi.fn().mockResolvedValue('OK') },
			meta: { enableStatsForFederatedInstances: false },
			config: { instance: { url: 'https://example.test' } },
			deliverQueue: {},
			userWebhookDeliverQueue: { add: vi.fn() },
			publishInternalEvent,
		} as unknown as HonoApiAccountBlockingDependencies;

		await Promise.all([unfollow(deps, follower, followee, true), unfollow(deps, follower, followee, true)]);
		const [updatedFollower, updatedFollowee] = await Promise.all([
			fetchUserByIdOrFailFromDatabase(runtime.db, followerId),
			fetchUserByIdOrFailFromDatabase(runtime.db, followeeId),
		]);

		expect(publishInternalEvent).toHaveBeenCalledTimes(1);
		expect(publishInternalEvent).toHaveBeenCalledWith('unfollow', { followerId, followeeId });
		expect(updatedFollower.followingCount).toBe(0);
		expect(updatedFollowee.followersCount).toBe(0);
	});
});
