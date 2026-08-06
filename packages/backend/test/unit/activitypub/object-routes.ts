/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createFollowingInDatabase } from '@/core/FollowingStore.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { countPoolQueries, type QueryCounter } from '../../query-counter.js';
import { createApObjectRoutesApp, type ApObjectRoutesDependencies } from '@/server/activitypub/object-routes.js';

describe('ActivityPub object routes', () => {
	let runtime: RuntimeDependencies;
	let queries: QueryCounter;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		queries = countPoolQueries(runtime.drizzlePool);
	});

	afterAll(async () => {
		queries.restore();
		await runtime.dispose();
	});

	test('following page preserves relation order and paginates after batching users', async () => {
		const ownerId = genId();
		const owner = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: {
				id: ownerId,
				username: `apfollowowner${ownerId}`,
				usernameLower: `apfollowowner${ownerId}`,
				followersCount: 11,
				followingCount: 11,
			},
			profile: { userId: ownerId, followersVisibility: 'public', followingVisibility: 'public' },
		});
		const base = Date.now() - 20_000;
		const targets = await Promise.all(
			Array.from({ length: 11 }, async (_, index) => {
				const id = genId();
				const remote = index === 9;
				return await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
					user: {
						id,
						username: `apfollowtarget${index}${id}`,
						usernameLower: `apfollowtarget${index}${id}`,
						host: remote ? 'remote.example' : null,
						uri: remote ? `https://remote.example/users/${id}` : null,
						inbox: remote ? `https://remote.example/users/${id}/inbox` : null,
						isSuspended: remote,
					},
					profile: { userId: id },
				});
			}),
		);
		const followings = [];
		const followers = [];
		for (let index = 0; index < targets.length; index++) {
			followings.push(
				await createFollowingInDatabase(runtime.db, {
					id: genId(base + index),
					followerId: owner.id,
					followeeId: targets[index]!.id,
				}),
			);
			followers.push(
				await createFollowingInDatabase(runtime.db, {
					id: genId(base + 100 + index),
					followerId: targets[index]!.id,
					followeeId: owner.id,
				}),
			);
		}

		const deps: ApObjectRoutesDependencies = {
			config: runtime.config,
			db: runtime.db,
			meta: { ...runtime.meta, federation: 'all' },
			redis: runtime.redis,
			redisForTimelines: runtime.redisForTimelines,
			deliverQueue: runtime.deliverQueue,
			userWebhookDeliverQueue: runtime.userWebhookDeliverQueue,
			httpRequestService: runtime.httpRequestService,
		};
		const app = createApObjectRoutesApp(deps);
		const targetUri = (index: number) =>
			targets[index]!.uri ?? `${runtime.config.instance.url}/users/${targets[index]!.id}`;

		for (const [kind, relations] of [
			['following', followings],
			['followers', followers],
		] as const) {
			queries.reset();
			const response = await app.request(`/users/${owner.id}/${kind}?page=true`, {
				headers: { accept: 'application/activity+json' },
			});
			const body = (await response.json()) as { totalItems: number; orderedItems: string[]; next: string };
			const expectedTargets = targets
				.map((_, index) => targetUri(index))
				.slice(1)
				.reverse();

			expect(response.status).toBe(200);
			expect(queries.count()).toBe(4);
			expect(body.totalItems).toBe(11);
			expect(body.orderedItems).toEqual(expectedTargets);
			expect(body.next).toBe(
				`${runtime.config.instance.url}/users/${owner.id}/${kind}?page=true&cursor=${relations[1]!.id}`,
			);

			queries.reset();
			const nextUrl = new URL(body.next);
			const nextResponse = await app.request(nextUrl.pathname + nextUrl.search, {
				headers: { accept: 'application/activity+json' },
			});
			const nextBody = (await nextResponse.json()) as { orderedItems: string[]; next?: string };

			expect(nextResponse.status).toBe(200);
			expect(queries.count()).toBe(4);
			expect(nextBody.orderedItems).toEqual([targetUri(0)]);
			expect(nextBody.next).toBeUndefined();
		}
	});
});
