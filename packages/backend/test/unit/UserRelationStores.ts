/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createBlockingInDatabase, listBlockeeIdsByBlockerIdAndBlockeeIdsFromDatabase, listBlockerIdsByBlockeeIdAndBlockerIdsFromDatabase } from '@/core/BlockingStore.js';
import { createFollowRequestInDatabase, listFollowRequestFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase, listFollowRequestFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase } from '@/core/FollowRequestStore.js';
import { createFollowingInDatabase, listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase, listFollowingsByFollowerIdAndFolloweeIdsFromDatabase } from '@/core/FollowingStore.js';
import { createMutingInDatabase, listMuteeIdsByMuterIdAndMuteeIdsFromDatabase } from '@/core/MutingStore.js';
import { createRenoteMutingInDatabase, listRenoteMuteeIdsByMuterIdAndMuteeIdsFromDatabase } from '@/core/RenoteMutingStore.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';

describe('targeted user relation stores', () => {
	let runtime: RuntimeDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('returns only requested users in both relation directions', async () => {
		const users = await Promise.all(['viewer', 'target', 'unrelated'].map(async prefix => {
			const id = genId();
			return await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
				user: { id, username: `relation${prefix}${id}`, usernameLower: `relation${prefix}${id}` },
				profile: { userId: id },
			});
		}));
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
		const [
			followings,
			followers,
			outgoingRequests,
			incomingRequests,
			blockees,
			blockers,
			mutees,
			renoteMutees,
		] = await Promise.all([
			listFollowingsByFollowerIdAndFolloweeIdsFromDatabase(runtime.db, viewer.id, targetIds),
			listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase(runtime.db, viewer.id, targetIds),
			listFollowRequestFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase(runtime.db, viewer.id, targetIds),
			listFollowRequestFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase(runtime.db, viewer.id, targetIds),
			listBlockeeIdsByBlockerIdAndBlockeeIdsFromDatabase(runtime.db, viewer.id, targetIds),
			listBlockerIdsByBlockeeIdAndBlockerIdsFromDatabase(runtime.db, viewer.id, targetIds),
			listMuteeIdsByMuterIdAndMuteeIdsFromDatabase(runtime.db, viewer.id, targetIds),
			listRenoteMuteeIdsByMuterIdAndMuteeIdsFromDatabase(runtime.db, viewer.id, targetIds),
		]);

		expect(followings.map(following => following.followeeId)).toEqual(targetIds);
		expect(followers).toEqual(targetIds);
		expect(outgoingRequests).toEqual(targetIds);
		expect(incomingRequests).toEqual(targetIds);
		expect(blockees).toEqual(targetIds);
		expect(blockers).toEqual(targetIds);
		expect(mutees).toEqual(targetIds);
		expect(renoteMutees).toEqual(targetIds);
	});
});
