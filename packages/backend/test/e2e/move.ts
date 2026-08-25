/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';
// jobQueue() が呼ぶ createRuntimeDependencies() は UrlPreviewService を構築する。同サービスは
// rolldown の `define` で注入される _SUMMALY_VERSION_ を参照するが、このファイルは jobQueue() を
// (test-server 経由でなく) vitest プロセス内で直接呼ぶため、ビルド時injectionが効かない。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import * as assert from 'assert';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import {
	fetchUserByIdOrFailFromDatabase,
	openTestDatabase,
	type TestDatabase,
	updateUserInDatabase,
} from '../fixtures.js';
import {
	api,
	castAsError,
	origin,
	signup,
	startJobQueue,
	successfulApiCall,
	type TestJobQueueRuntime,
	uploadFile,
} from '../utils.js';
import type * as misskey from 'misskey-js';

const waitForMoveJobOptions = { timeout: 5000, interval: 50 };
const waitForDelayedUnfollowJobOptions = { timeout: 15000, interval: 100 };

describe('Account Move', () => {
	let jq: TestJobQueueRuntime;
	let url: URL;

	let root: misskey.entities.SignupResponse;
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let carol: misskey.entities.SignupResponse;
	let dave: misskey.entities.SignupResponse;
	let eve: misskey.entities.SignupResponse;
	let frank: misskey.entities.SignupResponse;

	let db: TestDatabase;

	beforeAll(
		async () => {
			jq = await startJobQueue();

			url = new URL(origin);
			db = openTestDatabase();
			root = await signup({ username: 'root' });
			alice = await signup({ username: 'alice' });
			bob = await signup({ username: 'bob' });
			carol = await signup({ username: 'carol' });
			dave = await signup({ username: 'dave' });
			eve = await signup({ username: 'eve' });
			frank = await signup({ username: 'frank' });
		},
		1000 * 60 * 2,
	);

	afterAll(async () => {
		await db.close();
		await jq.close();
	});

	describe('Create Alias', () => {
		afterEach(async () => {
			await updateUserInDatabase(db, bob.id, { alsoKnownAs: null });
		}, 1000 * 10);

		test('Able to create an alias', async () => {
			const res = await api(
				'i/update',
				{
					alsoKnownAs: [`@alice@${url.hostname}`],
				},
				bob,
			);

			const newBob = await fetchUserByIdOrFailFromDatabase(db, bob.id);
			expect(newBob.alsoKnownAs).toStrictEqual([`${url.origin}/users/${alice.id}`]);
			expect(res.body.alsoKnownAs).toStrictEqual([alice.id]);
		});

		test('Able to create a local alias without hostname', async () => {
			await api(
				'i/update',
				{
					alsoKnownAs: ['@alice'],
				},
				bob,
			);

			const newBob = await fetchUserByIdOrFailFromDatabase(db, bob.id);
			expect(newBob.alsoKnownAs).toStrictEqual([`${url.origin}/users/${alice.id}`]);
		});

		test('Able to create a local alias without @', async () => {
			await api(
				'i/update',
				{
					alsoKnownAs: ['alice'],
				},
				bob,
			);

			const newBob = await fetchUserByIdOrFailFromDatabase(db, bob.id);
			expect(newBob.alsoKnownAs).toStrictEqual([`${url.origin}/users/${alice.id}`]);
		});

		test('Able to set remote user (but may fail)', async () => {
			const res = await api(
				'i/update',
				{
					alsoKnownAs: ['@syuilo@example.com'],
				},
				bob,
			);

			expect(res.status).toBe(400);
			expect(castAsError(res.body).error.code).toBe('NO_SUCH_USER');
			expect(castAsError(res.body).error.id).toBe('fcd2eef9-a9b2-4c4f-8624-038099e90aa5');
		});

		test('Unable to add duplicated aliases to alsoKnownAs', async () => {
			const res = await api(
				'i/update',
				{
					alsoKnownAs: [`@alice@${url.hostname}`, `@alice@${url.hostname}`],
				},
				bob,
			);

			expect(res.status).toBe(400);
			expect(castAsError(res.body).error.code).toBe('INVALID_PARAM');
			expect(castAsError(res.body).error.id).toBe('3d81ceae-475f-4600-b2a8-2bc116157532');
		});

		test('Unable to add itself', async () => {
			const res = await api(
				'i/update',
				{
					alsoKnownAs: [`@bob@${url.hostname}`],
				},
				bob,
			);

			expect(res.status).toBe(400);
			expect(castAsError(res.body).error.code).toBe('FORBIDDEN_TO_SET_YOURSELF');
			expect(castAsError(res.body).error.id).toBe('25c90186-4ab0-49c8-9bba-a1fa6c202ba4');
		});

		test('Unable to add a nonexisting local account to alsoKnownAs', async () => {
			const res1 = await api(
				'i/update',
				{
					alsoKnownAs: [`@nonexist@${url.hostname}`],
				},
				bob,
			);

			expect(res1.status).toBe(400);
			expect(castAsError(res1.body).error.code).toBe('NO_SUCH_USER');
			expect(castAsError(res1.body).error.id).toBe('fcd2eef9-a9b2-4c4f-8624-038099e90aa5');

			const res2 = await api(
				'i/update',
				{
					alsoKnownAs: ['@alice', 'nonexist'],
				},
				bob,
			);

			expect(res2.status).toBe(400);
			expect(castAsError(res2.body).error.code).toBe('NO_SUCH_USER');
			expect(castAsError(res2.body).error.id).toBe('fcd2eef9-a9b2-4c4f-8624-038099e90aa5');
		});

		test('Able to add two existing local account to alsoKnownAs', async () => {
			await api(
				'i/update',
				{
					alsoKnownAs: [`@alice@${url.hostname}`, `@carol@${url.hostname}`],
				},
				bob,
			);

			const newBob = await fetchUserByIdOrFailFromDatabase(db, bob.id);
			expect(newBob.alsoKnownAs).toStrictEqual([`${url.origin}/users/${alice.id}`, `${url.origin}/users/${carol.id}`]);
		});

		test('Able to properly overwrite alsoKnownAs', async () => {
			await api(
				'i/update',
				{
					alsoKnownAs: [`@alice@${url.hostname}`],
				},
				bob,
			);
			await api(
				'i/update',
				{
					alsoKnownAs: [`@carol@${url.hostname}`, `@dave@${url.hostname}`],
				},
				bob,
			);

			const newBob = await fetchUserByIdOrFailFromDatabase(db, bob.id);
			expect(newBob.alsoKnownAs).toStrictEqual([`${url.origin}/users/${carol.id}`, `${url.origin}/users/${dave.id}`]);
		});
	});

	describe('Local to Local', () => {
		let antennaId = '';

		beforeAll(async () => {
			await api(
				'i/update',
				{
					alsoKnownAs: [`@alice@${url.hostname}`],
				},
				root,
			);
			const listRoot = await api(
				'users/lists/create',
				{
					name: secureRndstr(8),
				},
				root,
			);
			await api(
				'users/lists/push',
				{
					listId: listRoot.body.id,
					userId: alice.id,
				},
				root,
			);

			await api(
				'following/create',
				{
					userId: root.id,
				},
				alice,
			);
			await api(
				'following/create',
				{
					userId: eve.id,
				},
				alice,
			);
			const antenna = await api(
				'antennas/create',
				{
					name: secureRndstr(8),
					src: 'home',
					keywords: [[secureRndstr(8)]],
					excludeKeywords: [],
					users: [],
					caseSensitive: false,
					localOnly: false,
					withReplies: false,
					withFile: false,
				},
				alice,
			);
			antennaId = antenna.body.id;

			await api(
				'i/update',
				{
					alsoKnownAs: [`@alice@${url.hostname}`],
				},
				bob,
			);

			await api(
				'following/create',
				{
					userId: alice.id,
				},
				carol,
			);

			await api(
				'mute/create',
				{
					userId: alice.id,
				},
				dave,
			);
			await api(
				'blocking/create',
				{
					userId: alice.id,
				},
				dave,
			);
			await api(
				'following/create',
				{
					userId: eve.id,
				},
				dave,
			);

			await api(
				'following/create',
				{
					userId: dave.id,
				},
				eve,
			);
			const listEve = await api(
				'users/lists/create',
				{
					name: secureRndstr(8),
				},
				eve,
			);
			await api(
				'users/lists/push',
				{
					listId: listEve.body.id,
					userId: bob.id,
				},
				eve,
			);

			await api(
				'i/update',
				{
					isLocked: true,
				},
				frank,
			);
			await api(
				'following/create',
				{
					userId: frank.id,
				},
				alice,
			);
			await api(
				'following/requests/accept',
				{
					userId: alice.id,
				},
				frank,
			);
		}, 1000 * 10);

		test('Prohibit the root account from moving', async () => {
			const res = await api(
				'i/move',
				{
					moveToAccount: `@bob@${url.hostname}`,
				},
				root,
			);

			expect(res.status).toBe(400);
			expect(castAsError(res.body).error.code).toBe('NOT_ROOT_FORBIDDEN');
			expect(castAsError(res.body).error.id).toBe('4362e8dc-731f-4ad8-a694-be2a88922a24');
		});

		test('Unable to move to a nonexisting local account', async () => {
			const res = await api(
				'i/move',
				{
					moveToAccount: `@nonexist@${url.hostname}`,
				},
				alice,
			);

			expect(res.status).toBe(400);
			expect(castAsError(res.body).error.code).toBe('NO_SUCH_USER');
			expect(castAsError(res.body).error.id).toBe('fcd2eef9-a9b2-4c4f-8624-038099e90aa5');
		});

		test('Unable to move if alsoKnownAs is invalid', async () => {
			const res = await api(
				'i/move',
				{
					moveToAccount: `@carol@${url.hostname}`,
				},
				alice,
			);

			expect(res.status).toBe(400);
			expect(castAsError(res.body).error.code).toBe('DESTINATION_ACCOUNT_FORBIDS');
			expect(castAsError(res.body).error.id).toBe('b5c90186-4ab0-49c8-9bba-a1f766282ba4');
		});

		test('Relationships have been properly migrated', async () => {
			const move = await api(
				'i/move',
				{
					moveToAccount: `@bob@${url.hostname}`,
				},
				alice,
			);

			expect(move.status).toBe(200);

			await vi.waitFor(async () => {
				const aliceFollowings = await api(
					'users/following',
					{
						userId: alice.id,
					},
					alice,
				);
				expect(aliceFollowings.status).toBe(200);
				expect(aliceFollowings.body.length).toBe(3);
			}, waitForMoveJobOptions);

			await vi.waitFor(async () => {
				const carolFollowings = await api(
					'users/following',
					{
						userId: carol.id,
					},
					carol,
				);
				expect(carolFollowings.status).toBe(200);
				expect(carolFollowings.body.length).toBe(2);
				expect(carolFollowings.body[0]?.followeeId).toBe(bob.id);
				expect(carolFollowings.body[1]?.followeeId).toBe(alice.id);
			}, waitForMoveJobOptions);

			await vi.waitFor(async () => {
				const blockings = await api('blocking/list', {}, dave);
				expect(blockings.status).toBe(200);
				expect(blockings.body.length).toBe(2);
				expect(blockings.body[0]?.blockeeId).toBe(bob.id);
				expect(blockings.body[1]?.blockeeId).toBe(alice.id);
			}, waitForMoveJobOptions);

			await vi.waitFor(async () => {
				const mutings = await api('mute/list', {}, dave);
				expect(mutings.status).toBe(200);
				expect(mutings.body.length).toBe(2);
				expect(mutings.body[0]?.muteeId).toBe(bob.id);
				expect(mutings.body[1]?.muteeId).toBe(alice.id);
			}, waitForMoveJobOptions);

			await vi.waitFor(async () => {
				const rootLists = await api('users/lists/list', {}, root);
				expect(rootLists.status).toBe(200);
				const userIds = rootLists.body[0]?.userIds;
				assert.ok(userIds);
				expect(userIds.length).toBe(2);
				assert.ok(userIds.includes(bob.id));
				assert.ok(userIds.includes(alice.id));
			}, waitForMoveJobOptions);

			await vi.waitFor(async () => {
				const eveLists = await api('users/lists/list', {}, eve);
				expect(eveLists.status).toBe(200);
				expect(eveLists.body[0]?.userIds).toStrictEqual([bob.id]);
			}, waitForMoveJobOptions);
		});

		test('A locked account automatically accept the follow request if it had already accepted the old account.', async () => {
			await successfulApiCall({
				endpoint: 'following/create',
				parameters: {
					userId: frank.id,
				},
				user: bob,
			});
			const followers = await api(
				'users/followers',
				{
					userId: frank.id,
				},
				frank,
			);

			expect(followers.status).toBe(200);
			expect(followers.body.length).toBe(2);
			expect(followers.body[0]?.followerId).toBe(bob.id);
		});

		test('Unfollowed after 10 sec (24 hours in production).', async () => {
			await vi.waitFor(async () => {
				const following = await api(
					'users/following',
					{
						userId: alice.id,
					},
					alice,
				);

				expect(following.status).toBe(200);
				expect(following.body.length).toBe(0);
			}, waitForDelayedUnfollowJobOptions);
		});

		test('Unable to move if the destination account has already moved.', async () => {
			const res = await api(
				'i/move',
				{
					moveToAccount: `@alice@${url.hostname}`,
				},
				bob,
			);

			expect(res.status).toBe(400);
			expect(castAsError(res.body).error.code).toBe('DESTINATION_ACCOUNT_FORBIDS');
			expect(castAsError(res.body).error.id).toBe('b5c90186-4ab0-49c8-9bba-a1f766282ba4');
		});

		test('Follow and follower counts are properly adjusted', async () => {
			await api(
				'following/create',
				{
					userId: alice.id,
				},
				eve,
			);
			const newAlice = await fetchUserByIdOrFailFromDatabase(db, alice.id);
			const newCarol = await fetchUserByIdOrFailFromDatabase(db, carol.id);
			let newEve = await fetchUserByIdOrFailFromDatabase(db, eve.id);
			expect(newAlice.movedToUri).toBe(`${url.origin}/users/${bob.id}`);
			expect(newAlice.followingCount).toBe(0);
			expect(newAlice.followersCount).toBe(0);
			expect(newCarol.followingCount).toBe(1);
			expect(newEve.followingCount).toBe(1);
			expect(newEve.followersCount).toBe(1);

			await api(
				'following/delete',
				{
					userId: alice.id,
				},
				eve,
			);
			newEve = await fetchUserByIdOrFailFromDatabase(db, eve.id);
			expect(newEve.followingCount).toBe(1);
			expect(newEve.followersCount).toBe(1);
		});

		test.each([
			'antennas/create',
			'channels/create',
			'channels/favorite',
			'channels/follow',
			'channels/unfavorite',
			'channels/unfollow',
			'clips/add-note',
			'clips/create',
			'clips/favorite',
			'clips/remove-note',
			'clips/unfavorite',
			'clips/update',
			'drive/files/upload-from-url',
			'flash/create',
			'flash/like',
			'flash/unlike',
			'flash/update',
			'following/create',
			'gallery/posts/create',
			'gallery/posts/like',
			'gallery/posts/unlike',
			'gallery/posts/update',
			'i/claim-achievement',
			'i/move',
			'i/import-blocking',
			'i/import-following',
			'i/import-muting',
			'i/import-user-lists',
			'i/pin',
			'mute/create',
			'notes/create',
			'notes/favorites/create',
			'notes/polls/vote',
			'notes/reactions/create',
			'pages/create',
			'pages/like',
			'pages/unlike',
			'pages/update',
			'renote-mute/create',
			'users/lists/create',
			'users/lists/pull',
			'users/lists/push',
		] as const)('Prohibit access after moving: %s', async (endpoint) => {
			const res = await api(endpoint, {}, alice);
			expect(res.status).toBe(403);
			assert.ok(res.body);
			expect(castAsError(res.body).error.code).toBe('YOUR_ACCOUNT_MOVED');
			expect(castAsError(res.body).error.id).toBe('56f20ec9-fd06-4fa5-841b-edd6d7d4fa31');
		});

		test('Prohibit access after moving: /antennas/update', async () => {
			const res = await api(
				'antennas/update',
				{
					antennaId,
					name: secureRndstr(8),
					src: 'users',
					keywords: [[secureRndstr(8)]],
					excludeKeywords: [],
					users: [eve.id],
					caseSensitive: false,
					localOnly: false,
					withReplies: false,
					withFile: false,
				},
				alice,
			);

			expect(res.status).toBe(403);
			assert.ok(res.body);
			expect(castAsError(res.body).error.code).toBe('YOUR_ACCOUNT_MOVED');
			expect(castAsError(res.body).error.id).toBe('56f20ec9-fd06-4fa5-841b-edd6d7d4fa31');
		});

		test('Prohibit access after moving: /drive/files/create', async () => {
			const res = await uploadFile(alice);

			expect(res.status).toBe(403);
			assert.ok(res.body);
			expect(castAsError(res.body).error.code).toBe('YOUR_ACCOUNT_MOVED');
			expect(castAsError(res.body).error.id).toBe('56f20ec9-fd06-4fa5-841b-edd6d7d4fa31');
		});

		test('Prohibit updating alsoKnownAs after moving', async () => {
			const res = await api(
				'i/update',
				{
					alsoKnownAs: [`@eve@${url.hostname}`],
				},
				alice,
			);

			expect(res.status).toBe(403);
			expect(castAsError(res.body).error.code).toBe('YOUR_ACCOUNT_MOVED');
			expect(castAsError(res.body).error.id).toBe('56f20ec9-fd06-4fa5-841b-edd6d7d4fa31');
			expect(castAsError(res.body).error.kind).toBe('permission');
		});
	});
});
