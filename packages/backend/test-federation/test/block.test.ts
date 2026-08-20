import { describe, test, beforeAll } from 'vitest';
import { deepStrictEqual, rejects, strictEqual } from 'node:assert';
import * as Misskey from 'misskey-js';
import {
	assertNotificationReceived,
	createAccount,
	type LoginUser,
	resolveRemoteNote,
	resolveRemoteUser,
	sleep,
	waitFor,
} from './utils.js';

describe('Block', () => {
	describe('Check follow', () => {
		let alice: LoginUser, bob: LoginUser;
		let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

		beforeAll(async () => {
			[alice, bob] = await Promise.all([createAccount('a.test'), createAccount('b.test')]);

			[bobInA, aliceInB] = await Promise.all([
				resolveRemoteUser('b.test', bob.id, alice),
				resolveRemoteUser('a.test', alice.id, bob),
			]);
		});

		test('Cannot follow if blocked', async () => {
			await alice.client.request('blocking/create', { userId: bobInA.id });
			await sleep();
			await rejects(
				async () => await bob.client.request('following/create', { userId: aliceInB.id }),
				(err: any) => {
					strictEqual(err.code, 'BLOCKED');
					return true;
				},
			);

			const following = await bob.client.request('users/following', { userId: bob.id });
			strictEqual(following.length, 0);
			const followers = await alice.client.request('users/followers', { userId: alice.id });
			strictEqual(followers.length, 0);
		});

		test.skip('Cannot follow even if unblocked', async () => {
			await alice.client.request('blocking/delete', { userId: bobInA.id });
			await sleep();

			await rejects(
				async () => await bob.client.request('following/create', { userId: aliceInB.id }),
				(err: any) => {
					strictEqual(err.code, 'BLOCKED');
					return true;
				},
			);
		});

		test('Can follow if unblocked', async () => {
			await alice.client.request('blocking/delete', { userId: bobInA.id });
			await sleep();

			await bob.client.request('following/create', { userId: aliceInB.id });
			await sleep();

			const following = await bob.client.request('users/following', { userId: bob.id });
			strictEqual(following.length, 1);
			const followers = await alice.client.request('users/followers', { userId: alice.id });
			strictEqual(followers.length, 1);
		});

		test('Remove follower when block them', async () => {
			const [blocker, follower] = await Promise.all([createAccount('a.test'), createAccount('b.test')]);
			const [followerInA, blockerInB] = await Promise.all([
				resolveRemoteUser('b.test', follower.id, blocker),
				resolveRemoteUser('a.test', blocker.id, follower),
			]);

			await follower.client.request('following/create', { userId: blockerInB.id });
			await waitFor(async () => {
				const following = await follower.client.request('users/following', { userId: follower.id });
				const followers = await blocker.client.request('users/followers', { userId: blocker.id });
				return following.length === 1 && followers.length === 1;
			});

			await blocker.client.request('blocking/create', { userId: followerInA.id });
			await waitFor(async () => {
				const following = await follower.client.request('users/following', { userId: follower.id });
				const followers = await blocker.client.request('users/followers', { userId: blocker.id });
				return following.length === 0 && followers.length === 0;
			});

			const followingAfterBlock = await follower.client.request('users/following', { userId: follower.id });
			strictEqual(followingAfterBlock.length, 0);
			const followersAfterBlock = await blocker.client.request('users/followers', { userId: blocker.id });
			strictEqual(followersAfterBlock.length, 0);
		});
	});

	describe('Check reply', () => {
		let alice: LoginUser, bob: LoginUser;
		let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

		beforeAll(async () => {
			[alice, bob] = await Promise.all([createAccount('a.test'), createAccount('b.test')]);

			[bobInA, aliceInB] = await Promise.all([
				resolveRemoteUser('b.test', bob.id, alice),
				resolveRemoteUser('a.test', alice.id, bob),
			]);
		});

		test('Cannot reply if blocked', async () => {
			await alice.client.request('blocking/create', { userId: bobInA.id });
			await sleep();

			const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
			const resolvedNote = await resolveRemoteNote('a.test', note.id, bob);
			await rejects(
				async () => await bob.client.request('notes/create', { text: 'b', replyId: resolvedNote.id }),
				(err: any) => {
					strictEqual(err.code, 'YOU_HAVE_BEEN_BLOCKED');
					return true;
				},
			);
		});

		test('Can reply if unblocked', async () => {
			await alice.client.request('blocking/delete', { userId: bobInA.id });
			await sleep();

			const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
			const resolvedNote = await resolveRemoteNote('a.test', note.id, bob);
			const reply = (await bob.client.request('notes/create', { text: 'b', replyId: resolvedNote.id })).createdNote;

			await resolveRemoteNote('b.test', reply.id, alice);
		});
	});

	describe('Check reaction', () => {
		let alice: LoginUser, bob: LoginUser;
		let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

		beforeAll(async () => {
			[alice, bob] = await Promise.all([createAccount('a.test'), createAccount('b.test')]);

			[bobInA, aliceInB] = await Promise.all([
				resolveRemoteUser('b.test', bob.id, alice),
				resolveRemoteUser('a.test', alice.id, bob),
			]);
		});

		test('Cannot reaction if blocked', async () => {
			await alice.client.request('blocking/create', { userId: bobInA.id });
			await sleep();

			const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
			const resolvedNote = await resolveRemoteNote('a.test', note.id, bob);
			await rejects(
				async () => await bob.client.request('notes/reactions/create', { noteId: resolvedNote.id, reaction: '😅' }),
				(err: any) => {
					strictEqual(err.code, 'YOU_HAVE_BEEN_BLOCKED');
					return true;
				},
			);
		});

		test.skip('Cannot reaction even if unblocked', async () => {
			await alice.client.request('blocking/delete', { userId: bobInA.id });
			await sleep();

			const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
			const resolvedNote = await resolveRemoteNote('a.test', note.id, bob);

			await rejects(
				async () => await bob.client.request('notes/reactions/create', { noteId: resolvedNote.id, reaction: '😅' }),
				(err: any) => {
					strictEqual(err.code, 'YOU_HAVE_BEEN_BLOCKED');
					return true;
				},
			);
		});

		test('Can reaction if unblocked', async () => {
			await alice.client.request('blocking/delete', { userId: bobInA.id });
			await sleep();

			const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
			const resolvedNote = await resolveRemoteNote('a.test', note.id, bob);
			await bob.client.request('notes/reactions/create', { noteId: resolvedNote.id, reaction: '😅' });
			await sleep();

			const _note = await alice.client.request('notes/show', { noteId: note.id });
			deepStrictEqual(_note.reactions, { '😅': 1 });
		});
	});

	describe('Check mention', () => {
		let alice: LoginUser, bob: LoginUser;
		let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

		beforeAll(async () => {
			[alice, bob] = await Promise.all([createAccount('a.test'), createAccount('b.test')]);

			[bobInA, aliceInB] = await Promise.all([
				resolveRemoteUser('b.test', bob.id, alice),
				resolveRemoteUser('a.test', alice.id, bob),
			]);
		});

		/** 通知の受信を止めるため、対象ユーザーをミュートする。 */
		test('Can mention and notified even if blocked', async () => {
			await alice.client.request('blocking/create', { userId: bobInA.id });
			await sleep();

			const text = `@${alice.username}@a.test plz unblock me!`;
			await assertNotificationReceived(
				'a.test',
				alice,
				async () => await bob.client.request('notes/create', { text }),
				(notification) =>
					notification.type === 'mention' && notification.userId === bobInA.id && notification.note.text === text,
				true,
			);
		});
	});
});
