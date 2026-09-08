/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '@/config.js';
import { createFollowingInDatabase } from '@/core/user/FollowingStore.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { createPollInDatabase } from '@/core/note/PollStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { countDatabaseQueries } from '../../../query-counter.js';
import type { QueryCounter } from '../../../query-counter.js';
import { createApObjectRoutesApp } from '@/server/activitypub/object-routes.js';
import type { ApObjectRoutesDependencies } from '@/server/activitypub/object-routes.js';
import { createNoteInDatabase, fetchNoteByIdOrFailFromDatabase } from '@/core/note/NoteStore.js';
import { deliverQuestionUpdateForApi, renderNoteForApi } from '@/server/rest/activitypub/notes-ap.js';

describe('ActivityPub object routes', () => {
	let runtime: RuntimeDependencies;
	let queries: QueryCounter;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		queries = countDatabaseQueries(runtime.db);
	});

	afterAll(async () => {
		queries.restore();
		await runtime.dispose();
	});

	test.each(['public', 'home', 'followers', 'specified'] as const)(
		'返信元が %s のとき公開範囲に応じた ActivityPub オブジェクトを返す',
		async (visibility) => {
			const id = genId();
			const author = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
				user: { id, username: `reply${id}`, usernameLower: `reply${id}` },
				profile: { userId: id },
			});
			const parentId = genId();
			const replyId = genId();
			await createNoteInDatabase(runtime.db, {
				id: parentId,
				userId: author.id,
				userHost: null,
				text: 'parent body',
				visibility,
			});
			await createNoteInDatabase(runtime.db, {
				id: replyId,
				userId: author.id,
				userHost: null,
				text: 'reply body',
				visibility: 'specified',
				replyId: parentId,
			});
			const reply = await fetchNoteByIdOrFailFromDatabase(runtime.db, replyId);
			const rendered = await renderNoteForApi(runtime, reply, true);
			const parentUri = `${runtime.config.instance.url}/notes/${parentId}`;
			if (visibility === 'public' || visibility === 'home') {
				expect(rendered['inReplyTo']).toMatchObject({ id: parentUri, type: 'Note' });
			} else {
				expect(rendered['inReplyTo']).toBe(parentUri);
				expect(JSON.stringify(rendered)).not.toContain('parent body');
			}
		},
	);

	test.each([false, true])('指定公開の返信元を宛先が閲覧可能=%s のとき参照の配送を制御する', async (canReadParent) => {
		const authorId = genId();
		const recipientId = genId();
		await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id: authorId, username: `author${authorId}`, usernameLower: `author${authorId}` },
			profile: { userId: authorId },
		});
		const recipient = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: {
				id: recipientId,
				username: `recipient${recipientId}`,
				usernameLower: `recipient${recipientId}`,
				host: 'recipient.example',
				uri: `https://recipient.example/users/${recipientId}`,
			},
			profile: { userId: recipientId },
		});
		const parentId = genId();
		const replyId = genId();
		await createNoteInDatabase(runtime.db, {
			id: parentId,
			userId: authorId,
			userHost: null,
			text: 'private parent body',
			visibility: 'specified',
			visibleUserIds: canReadParent ? [recipientId] : [],
		});
		await createNoteInDatabase(runtime.db, {
			id: replyId,
			userId: authorId,
			userHost: null,
			text: 'visible reply body',
			visibility: 'specified',
			visibleUserIds: [recipientId, authorId],
			replyId: parentId,
		});
		const reply = await fetchNoteByIdOrFailFromDatabase(runtime.db, replyId);
		for (const dive of [false, true]) {
			const rendered = await renderNoteForApi(runtime, reply, dive);
			expect(rendered['inReplyTo']).toBe(canReadParent ? `${runtime.config.instance.url}/notes/${parentId}` : null);
			expect(rendered['to']).toEqual([recipient.uri]);
			expect(JSON.stringify(rendered)).not.toContain('private parent body');
		}
	});

	test.each(['public', 'home', 'followers', 'specified'] as const)(
		'%s のアンケート更新を閲覧対象の宛先へ配送する',
		async (visibility) => {
			const authorId = genId();
			await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
				user: { id: authorId, username: `poll${authorId}`, usernameLower: `poll${authorId}` },
				profile: { userId: authorId },
			});
			const users = await Promise.all(
				['recipient', 'follower'].map(async (label) => {
					const id = genId();
					return await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
						user: {
							id,
							username: `${label}${id}`,
							usernameLower: `${label}${id}`,
							host: `${label}.example`,
							uri: `https://${label}.example/users/${id}`,
							inbox: `https://${label}.example/users/${id}/inbox`,
						},
						profile: { userId: id },
					});
				}),
			);
			const recipient = users[0]!;
			const follower = users[1]!;
			await createFollowingInDatabase(runtime.db, {
				id: genId(),
				followerId: follower.id,
				followeeId: authorId,
				followerHost: follower.host,
				followerInbox: follower.inbox,
			});
			const noteId = genId();
			await createNoteInDatabase(runtime.db, {
				id: noteId,
				userId: authorId,
				userHost: null,
				visibility,
				hasPoll: true,
				visibleUserIds: visibility === 'specified' ? [recipient.id] : [],
				mentions: [recipient.id, follower.id],
			});
			await createPollInDatabase(runtime.db, {
				noteId,
				userId: authorId,
				userHost: null,
				noteVisibility: visibility,
				choices: ['one', 'two'],
				votes: [1, 0],
				multiple: false,
			});
			const addBulk = vi.spyOn(runtime.deliverQueue, 'addBulk').mockResolvedValue([]);
			try {
				await deliverQuestionUpdateForApi(runtime, noteId);
				expect(addBulk).toHaveBeenCalledOnce();
				const jobs = addBulk.mock.calls[0]![0];
				expect(jobs.map((job) => job.data.to).sort()).toEqual(
					(visibility === 'specified' ? [recipient.inbox] : [recipient.inbox, follower.inbox]).sort(),
				);
				const activity = JSON.parse(jobs[0]!.data.content);
				expect(activity.type).toBe('Update');
				expect(activity.object.type).toBe('Question');
				expect(
					activity.object.oneOf.map((choice: { replies: { totalItems: number } }) => choice.replies.totalItems),
				).toEqual([1, 0]);
				expect(activity.to).toEqual(activity.object.to);
				expect(activity.cc).toEqual(activity.object.cc);
				if (visibility === 'specified') {
					expect(activity.to).toEqual([recipient.uri]);
					expect(activity.cc).toEqual([]);
				}
			} finally {
				addBulk.mockRestore();
			}
		},
	);

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
