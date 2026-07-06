import { describe, test, beforeAll, afterAll } from 'vitest';
import * as Misskey from 'misskey-js';
import { assertNotificationReceived, createAccount, type LoginUser, resolveRemoteNote, resolveRemoteUser, sleep } from './utils.js';

describe('Notification', () => {
	let alice: LoginUser, bob: LoginUser;
	let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

	beforeAll(async () => {
		[alice, bob] = await Promise.all([
			createAccount('a.test'),
			createAccount('b.test'),
		]);

		[bobInA, aliceInB] = await Promise.all([
			resolveRemoteUser('b.test', bob.id, alice),
			resolveRemoteUser('a.test', alice.id, bob),
		]);
	});

	describe('Follow', () => {
		test('Get notification when follow', async () => {
			await assertNotificationReceived(
				'b.test', bob,
				async () => await bob.client.request('following/create', { userId: aliceInB.id }),
				notification => notification.type === 'followRequestAccepted' && notification.userId === aliceInB.id,
				true,
			);

			await bob.client.request('following/delete', { userId: aliceInB.id });
			await sleep();
		});

		test('Get notification when get followed', async () => {
			await assertNotificationReceived(
				'a.test', alice,
				async () => await bob.client.request('following/create', { userId: aliceInB.id }),
				notification => notification.type === 'follow' && notification.userId === bobInA.id,
				true,
			);
		});

		afterAll(async () => {
			// リモートフォローは Accept の往復が完了するまで following 行が現れない。
			// 反映前に following/delete すると 'You are not following that user' で
			// フックごと失敗するため、反映を待ってから解除する
			for (let i = 0; i < 40; i++) {
				const following = await bob.client.request('users/following', { userId: bob.id });
				if (following.length > 0) break;
				await sleep();
			}
			await bob.client.request('following/delete', { userId: aliceInB.id }).catch(() => {});
		});
	});

	describe('Note', () => {
		test('Get notification when get a reaction', async () => {
			const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
			const noteInB = await resolveRemoteNote('a.test', note.id, bob);
			const reaction = '😅';
			await assertNotificationReceived(
				'a.test', alice,
				async () => await bob.client.request('notes/reactions/create', { noteId: noteInB.id, reaction }),
				notification =>
					notification.type === 'reaction' && notification.note.id === note.id && notification.userId === bobInA.id && notification.reaction === reaction,
				true,
			);
		});

		test('Get notification when replied', async () => {
			const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
			const noteInB = await resolveRemoteNote('a.test', note.id, bob);
			const text = crypto.randomUUID();
			await assertNotificationReceived(
				'a.test', alice,
				async () => await bob.client.request('notes/create', { text, replyId: noteInB.id }),
				notification =>
					notification.type === 'reply' && notification.note.reply!.id === note.id && notification.userId === bobInA.id && notification.note.text === text,
				true,
			);
		});

		test('Get notification when renoted', async () => {
			const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
			const noteInB = await resolveRemoteNote('a.test', note.id, bob);
			await assertNotificationReceived(
				'a.test', alice,
				async () => await bob.client.request('notes/create', { renoteId: noteInB.id }),
				notification =>
					notification.type === 'renote' && notification.note.renote!.id === note.id && notification.userId === bobInA.id,
				true,
			);
		});

		test('Get notification when quoted', async () => {
			const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
			const noteInB = await resolveRemoteNote('a.test', note.id, bob);
			const text = crypto.randomUUID();
			await assertNotificationReceived(
				'a.test', alice,
				async () => await bob.client.request('notes/create', { text, renoteId: noteInB.id }),
				notification =>
					notification.type === 'quote' && notification.note.renote!.id === note.id && notification.userId === bobInA.id && notification.note.text === text,
				true,
			);
		});

		test('Get notification when mentioned', async () => {
			const text = `@${alice.username}@a.test`;
			await assertNotificationReceived(
				'a.test', alice,
				async () => await bob.client.request('notes/create', { text }),
				notification => notification.type === 'mention' && notification.userId === bobInA.id && notification.note.text === text,
				true,
			);
		});
	});
});
