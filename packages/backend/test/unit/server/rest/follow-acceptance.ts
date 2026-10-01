/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, expect, test } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import {
	createUserWithProfileAndPublickeyInDatabase,
	fetchUserByIdOrFailFromDatabase,
	updateUserInDatabase,
} from '@/core/user/UserStore.js';
import { fetchFollowingByFollowerIdAndFolloweeIdFromDatabase } from '@/core/user/FollowingStore.js';
import { fetchBlockingByBlockerIdAndBlockeeIdFromDatabase } from '@/core/user/BlockingStore.js';
import { fetchFollowRequestFromDatabase } from '@/core/user/FollowRequestStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/user/UserProfileStore.js';
import { followAcceptance } from '@/db/schema/follow-acceptance.js';
import { queueOutbox } from '@/db/schema/queue-outbox.js';
import { genId } from '@/misc/id/gen-id.js';
import { performOneActivityForApi } from '@/server/activitypub/inbox-dispatch.js';
import type { ApiInboxDependencies } from '@/server/activitypub/inbox-dispatch.js';
import { isRemoteUser, insertFollowingWithSideEffects } from '@/server/rest/user/following.js';
import { blockForApi, undoFollowForApi } from '@/server/rest/account/account-blocking.js';
import { handleQueueDeliver } from '@/queue/handlers/deliver.js';
import type { DeliverJobData } from '@/core/queue/types.js';
import type { IFollow } from '@/core/activitypub/type.js';

let runtime: RuntimeDependencies;
let deps: ApiInboxDependencies;
beforeAll(async () => {
	runtime = await createRuntimeDependencies(loadConfig());
	deps = { ...runtime, logger: runtime.loggerService.getLogger('test-follow-acceptance') };
});
afterAll(async () => {
	await runtime.dispose();
});

async function pair() {
	const followerId = genId();
	const followeeId = genId();
	const follower = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
		user: {
			id: followerId,
			username: `receipt${followerId}`,
			usernameLower: `receipt${followerId}`,
			host: 'receipt.example.test',
			uri: `https://receipt.example.test/users/${followerId}`,
			inbox: 'https://receipt.example.test/inbox',
			lastFetchedAt: new Date(),
		},
		profile: { userId: followerId },
	});
	const followee = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
		user: { id: followeeId, username: `receipt${followeeId}`, usernameLower: `receipt${followeeId}` },
		profile: { userId: followeeId },
	});
	if (!isRemoteUser(follower)) throw new Error('Remote fixture is required');
	const activity: IFollow = {
		type: 'Follow',
		id: `https://receipt.example.test/follows/${genId()}`,
		actor: follower.uri,
		object: `${deps.config.instance.url}/users/${followee.id}`,
	};
	return { follower, followee, activity };
}

async function deliveries(followeeId: string) {
	const rows = await runtime.db.select().from(queueOutbox);
	return rows.flatMap((row) => {
		const raw = row.data;
		if (typeof raw !== 'object' || raw === null || !('data' in raw)) return [];
		const data = raw.data;
		if (typeof data !== 'object' || data === null || !('followStateGuard' in data)) return [];
		const guard = data.followStateGuard;
		if (typeof guard !== 'object' || guard === null || !('followeeId' in guard) || guard.followeeId !== followeeId)
			return [];
		// このテストが作成した、登録境界で検査済みの delivery payload。
		const delivery = data as DeliverJobData;
		return [delivery];
	});
}

test('同時・逐次の同じ Follow は関係・集計・Accept の配送登録を重複させない', async () => {
	const { follower, followee, activity } = await pair();
	await Promise.all(Array.from({ length: 3 }, () => performOneActivityForApi(deps, follower, activity, new Set())));
	await performOneActivityForApi(deps, follower, activity, new Set());
	expect(
		await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(runtime.db, follower.id, followee.id),
	).not.toBeNull();
	expect((await fetchUserByIdOrFailFromDatabase(runtime.db, follower.id)).followingCount).toBe(1);
	expect((await fetchUserByIdOrFailFromDatabase(runtime.db, followee.id)).followersCount).toBe(1);
	const registered = await deliveries(followee.id);
	expect(registered).toHaveLength(1);
	expect(JSON.parse(registered[0]!.content)).toMatchObject({
		type: 'Accept',
		actor: activity.object,
		object: { id: activity.id, actor: activity.actor, object: activity.object },
	});
	expect(
		await runtime.db.select().from(followAcceptance).where(eq(followAcceptance.followeeId, followee.id)),
	).toHaveLength(1);
});

test('Undo 後の古い Follow を再承認せず、配送待ちの古い Accept も送らない', async () => {
	const { follower, followee, activity } = await pair();
	await performOneActivityForApi(deps, follower, activity, new Set());
	const [delivery] = await deliveries(followee.id);
	expect(delivery).toBeDefined();
	await undoFollowForApi(deps, follower, followee);
	await performOneActivityForApi(deps, follower, activity, new Set());
	expect(await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(runtime.db, follower.id, followee.id)).toBeNull();
	expect((await fetchUserByIdOrFailFromDatabase(runtime.db, follower.id)).followingCount).toBe(0);
	expect(await deliveries(followee.id)).toHaveLength(1);
	expect(await handleQueueDeliver(runtime, delivery!)).toBe('skip (stale follow acceptance)');
	const next = { ...activity, id: `https://receipt.example.test/follows/${genId()}` };
	await performOneActivityForApi(deps, follower, next, new Set());
	expect(await handleQueueDeliver(runtime, delivery!)).toBe('skip (stale follow acceptance)');
	expect((await fetchUserByIdOrFailFromDatabase(runtime.db, follower.id)).followingCount).toBe(1);
	expect(await deliveries(followee.id)).toHaveLength(2);
});

test('古い Follow replay は後発 Block を消さず、新しい Follow ID だけを新たに承認する', async () => {
	const { follower, followee, activity } = await pair();
	await performOneActivityForApi(deps, follower, activity, new Set());
	await blockForApi(deps, follower, followee);
	await performOneActivityForApi(deps, follower, activity, new Set());
	expect(await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(runtime.db, follower.id, followee.id)).not.toBeNull();
	expect(await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(runtime.db, follower.id, followee.id)).toBeNull();
	const next = { ...activity, id: `https://receipt.example.test/follows/${genId()}` };
	await performOneActivityForApi(deps, follower, next, new Set());
	expect(await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(runtime.db, follower.id, followee.id)).toBeNull();
	expect((await fetchUserByIdOrFailFromDatabase(runtime.db, follower.id)).followingCount).toBe(1);
	const requests = (await deliveries(followee.id)).map((delivery) => JSON.parse(delivery.content).object.id);
	expect(requests.sort()).toEqual([activity.id, next.id].sort());
});

test('outbox 保存失敗で承認記録・関係・集計を残さず、再試行で正しく承認できる', async () => {
	const { follower, followee, activity } = await pair();
	const constraint = `reject_receipt_${genId()}`;
	const marker = activity.id!;
	await runtime.db.execute(
		sql.raw(
			`ALTER TABLE queue_outbox ADD CONSTRAINT "${constraint}" CHECK (COALESCE(data->'data'->>'content','') NOT LIKE '%${marker}%')`,
		),
	);
	try {
		await expect(performOneActivityForApi(deps, follower, activity, new Set())).rejects.toThrow();
		expect(await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(runtime.db, follower.id, followee.id)).toBeNull();
		expect((await fetchUserByIdOrFailFromDatabase(runtime.db, follower.id)).followingCount).toBe(0);
		expect(
			await runtime.db.select().from(followAcceptance).where(eq(followAcceptance.followeeId, followee.id)),
		).toEqual([]);
	} finally {
		await runtime.db.execute(sql.raw(`ALTER TABLE queue_outbox DROP CONSTRAINT "${constraint}"`));
	}
	await performOneActivityForApi(deps, follower, activity, new Set());
	expect((await fetchUserByIdOrFailFromDatabase(runtime.db, follower.id)).followingCount).toBe(1);
	expect(await deliveries(followee.id)).toHaveLength(1);
});

test('取り消された pending request の保存済み snapshot から後で承認しない', async () => {
	const { follower, followee, activity } = await pair();
	await updateUserInDatabase(runtime.db, followee.id, { isLocked: true });
	await performOneActivityForApi(deps, follower, activity, new Set());
	const request = await fetchFollowRequestFromDatabase(runtime.db, follower.id, followee.id);
	expect(request).not.toBeNull();
	await undoFollowForApi(deps, follower, followee);
	await expect(
		insertFollowingWithSideEffects(deps, follower, followee, {
			followeeProfile: await fetchUserProfileByUserIdOrFailFromDatabase(runtime.db, followee.id),
			requestId: request!.requestId ?? undefined,
			requestRowId: request!.id,
		}),
	).rejects.toMatchObject({ code: 'NO_FOLLOW_REQUEST' });
	expect(await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(runtime.db, follower.id, followee.id)).toBeNull();
	expect((await fetchUserByIdOrFailFromDatabase(runtime.db, followee.id)).followersCount).toBe(0);
	expect(await deliveries(followee.id)).toEqual([]);
});
