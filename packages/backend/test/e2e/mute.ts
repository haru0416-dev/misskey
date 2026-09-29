/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll, describe, expect, test, vi } from 'vitest';
import { api, post, react, signup, waitFire } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('Mute', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let carol: misskey.entities.SignupResponse;

	beforeAll(
		async () => {
			alice = await signup({ username: 'alice' });
			bob = await signup({ username: 'bob' });
			carol = await signup({ username: 'carol' });

			await api(
				'mute/create',
				{
					userId: carol.id,
				},
				alice,
			);
		},
		1000 * 60 * 2,
	);

	test('ミュート作成', async () => {
		const res = await api(
			'mute/create',
			{
				userId: bob.id,
			},
			alice,
		);

		expect(res.status).toBe(204);

		await api(
			'mute/delete',
			{
				userId: bob.id,
			},
			alice,
		);
	});

	test('「自分宛ての投稿」にミュートしているユーザーの投稿が含まれない', async () => {
		const bobNote = await post(bob, { text: '@alice hi' });
		const carolNote = await post(carol, { text: '@alice hi' });

		const res = await api('notes/mentions', {}, alice);

		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
		expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
		expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
	});

	test('ミュートしているユーザーからメンションされても、ストリームに unreadNotification イベントが流れてこない', async () => {
		await api('notifications/mark-all-as-read', {}, alice);

		const fired = await waitFire(
			alice,
			'main',
			() => post(carol, { text: '@alice hi' }),
			(msg) => msg.type === 'unreadNotification',
		);

		expect(fired).toBe(false);
	});

	describe('Timeline', () => {
		test('タイムラインにミュートしているユーザーの投稿が含まれない', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			const bobNote = await post(bob, { text: 'hi' });
			const carolNote = await post(carol, { text: 'hi' });

			const res = await api('notes/local-timeline', {}, alice);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
			expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
			expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
		});

		test('タイムラインにミュートしているユーザーの投稿のRenoteが含まれない', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			const carolNote = await post(carol, { text: 'hi' });
			const bobNote = await post(bob, {
				renoteId: carolNote.id,
			});

			const res = await api('notes/local-timeline', {}, alice);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.some((note) => note.id === aliceNote.id)).toBe(true);
			expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
			expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
		});
	});

	describe('Notification', () => {
		test('通知にミュートしているユーザーの通知が含まれない(リアクション)', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			// リアクションの通知は応答を待たずに作られる。ミュート相手が先に反応し、後から反応した bob の通知が
			// 届くのを待ってから見ないと、作られる前に読んで通ってしまう。
			await react(carol, aliceNote, 'like');
			await react(bob, aliceNote, 'like');

			const res = await vi.waitFor(async () => {
				const res = await api('i/notifications', {}, alice);
				expect(res.status).toBe(200);
				expect(res.body.some((notification) => 'userId' in notification && notification.userId === bob.id)).toBe(true);
				return res;
			});
			expect(res.body.some((notification) => 'userId' in notification && notification.userId === carol.id)).toBe(false);
		});

		test('通知にミュートしているユーザーからのリプライが含まれない', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			await post(bob, { text: '@alice hi', replyId: aliceNote.id });
			await post(carol, { text: '@alice hi', replyId: aliceNote.id });

			const res = await api('i/notifications', {}, alice);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);

			expect(res.body.some((notification) => 'userId' in notification && notification.userId === bob.id)).toBe(true);
			expect(res.body.some((notification) => 'userId' in notification && notification.userId === carol.id)).toBe(false);
		});

		test('通知にミュートしているユーザーからのリプライが含まれない', async () => {
			await post(alice, { text: 'hi' });
			await post(bob, { text: '@alice hi' });
			await post(carol, { text: '@alice hi' });

			const res = await api('i/notifications', {}, alice);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);

			expect(res.body.some((notification) => 'userId' in notification && notification.userId === bob.id)).toBe(true);
			expect(res.body.some((notification) => 'userId' in notification && notification.userId === carol.id)).toBe(false);
		});

		test('通知にミュートしているユーザーからの引用リノートが含まれない', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			await post(bob, { text: 'hi', renoteId: aliceNote.id });
			await post(carol, { text: 'hi', renoteId: aliceNote.id });

			const res = await api('i/notifications', {}, alice);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);

			expect(res.body.some((notification) => 'userId' in notification && notification.userId === bob.id)).toBe(true);
			expect(res.body.some((notification) => 'userId' in notification && notification.userId === carol.id)).toBe(false);
		});

		test('通知にミュートしているユーザーからのリノートが含まれない', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			await post(bob, { renoteId: aliceNote.id });
			await post(carol, { renoteId: aliceNote.id });

			const res = await api('i/notifications', {}, alice);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);

			expect(res.body.some((notification) => 'userId' in notification && notification.userId === bob.id)).toBe(true);
			expect(res.body.some((notification) => 'userId' in notification && notification.userId === carol.id)).toBe(false);
		});

		test('通知にミュートしているユーザーからのフォロー通知が含まれない', async () => {
			await api('following/create', { userId: alice.id }, bob);
			await api('following/create', { userId: alice.id }, carol);

			const res = await api('i/notifications', {}, alice);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);

			expect(res.body.some((notification) => 'userId' in notification && notification.userId === bob.id)).toBe(true);
			expect(res.body.some((notification) => 'userId' in notification && notification.userId === carol.id)).toBe(false);

			await api('following/delete', { userId: alice.id }, bob);
			await api('following/delete', { userId: alice.id }, carol);
		});

		test('通知にミュートしているユーザーからのフォローリクエストが含まれない', async () => {
			await api('i/update', { isLocked: true }, alice);
			await api('following/create', { userId: alice.id }, bob);
			await api('following/create', { userId: alice.id }, carol);

			const res = await api('i/notifications', {}, alice);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);

			expect(res.body.some((notification) => 'userId' in notification && notification.userId === bob.id)).toBe(true);
			expect(res.body.some((notification) => 'userId' in notification && notification.userId === carol.id)).toBe(false);

			await api('following/delete', { userId: alice.id }, bob);
			await api('following/delete', { userId: alice.id }, carol);
		});

		// 通知を受けたあとで相手をミュートすると、最新のページが全件除外されることがある。空のページは
		// クライアントに「これ以上ない」と受け取られ、その先の見られる通知が表示されなくなる。
		test('最新の通知がすべてミュート相手のものでも、その先の通知を返す', async () => {
			const dave = await signup({ username: `daven${Date.now() % 100000}` });
			const aliceNote = await post(alice, { text: 'hi' });
			const bobReply = await post(bob, { text: '@alice visible', replyId: aliceNote.id });
			for (let i = 0; i < 3; i++) await post(dave, { text: `@alice later muted ${i}`, replyId: aliceNote.id });
			await api('mute/create', { userId: dave.id }, alice);

			const res = await api('i/notifications', { limit: 2 }, alice);

			expect(res.status).toBe(200);
			expect(res.body.some((notification) => 'userId' in notification && notification.userId === dave.id)).toBe(false);
			expect(res.body.some((notification) => 'note' in notification && notification.note?.id === bobReply.id)).toBe(
				true,
			);
		});
	});

	describe('Notification (Grouped)', () => {
		test('通知にミュートしているユーザーの通知が含まれない(リアクション)', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			// リアクションの通知は応答を待たずに作られる。ミュート相手が先に反応し、後から反応した bob の通知が
			// 届くのを待ってから見ないと、作られる前に読んで通ってしまう。
			await react(carol, aliceNote, 'like');
			await react(bob, aliceNote, 'like');

			const res = await vi.waitFor(async () => {
				const res = await api('i/notifications-grouped', {}, alice);
				expect(res.status).toBe(200);
				expect(res.body.some((notification) => 'userId' in notification && notification.userId === bob.id)).toBe(true);
				return res;
			});
			expect(res.body.some((notification) => 'userId' in notification && notification.userId === carol.id)).toBe(false);
		});
		test('通知にミュートしているユーザーからのリプライが含まれない', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			await post(bob, { text: '@alice hi', replyId: aliceNote.id });
			await post(carol, { text: '@alice hi', replyId: aliceNote.id });

			const res = await api('i/notifications-grouped', {}, alice);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);

			expect(res.body.some((notification) => 'userId' in notification && notification.userId === bob.id)).toBe(true);
			expect(res.body.some((notification) => 'userId' in notification && notification.userId === carol.id)).toBe(false);
		});

		test('通知にミュートしているユーザーからのリプライが含まれない', async () => {
			await post(alice, { text: 'hi' });
			await post(bob, { text: '@alice hi' });
			await post(carol, { text: '@alice hi' });

			const res = await api('i/notifications-grouped', {}, alice);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);

			expect(res.body.some((notification) => 'userId' in notification && notification.userId === bob.id)).toBe(true);
			expect(res.body.some((notification) => 'userId' in notification && notification.userId === carol.id)).toBe(false);
		});

		test('通知にミュートしているユーザーからの引用リノートが含まれない', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			await post(bob, { text: 'hi', renoteId: aliceNote.id });
			await post(carol, { text: 'hi', renoteId: aliceNote.id });

			const res = await api('i/notifications-grouped', {}, alice);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);

			expect(res.body.some((notification) => 'userId' in notification && notification.userId === bob.id)).toBe(true);
			expect(res.body.some((notification) => 'userId' in notification && notification.userId === carol.id)).toBe(false);
		});

		test('通知にミュートしているユーザーからのリノートが含まれない', async () => {
			const aliceNote = await post(alice, { text: 'hi' });
			await post(bob, { renoteId: aliceNote.id });
			await post(carol, { renoteId: aliceNote.id });

			const res = await api('i/notifications-grouped', {}, alice);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);

			expect(res.body.some((notification) => 'userId' in notification && notification.userId === bob.id)).toBe(true);
			expect(res.body.some((notification) => 'userId' in notification && notification.userId === carol.id)).toBe(false);
		});

		test('通知にミュートしているユーザーからのフォロー通知が含まれない', async () => {
			await api('following/create', { userId: alice.id }, bob);
			await api('following/create', { userId: alice.id }, carol);

			const res = await api('i/notifications-grouped', {}, alice);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);

			expect(res.body.some((notification) => 'userId' in notification && notification.userId === bob.id)).toBe(true);
			expect(res.body.some((notification) => 'userId' in notification && notification.userId === carol.id)).toBe(false);

			await api('following/delete', { userId: alice.id }, bob);
			await api('following/delete', { userId: alice.id }, carol);
		});

		test('通知にミュートしているユーザーからのフォローリクエストが含まれない', async () => {
			await api('i/update', { isLocked: true }, alice);
			await api('following/create', { userId: alice.id }, bob);
			await api('following/create', { userId: alice.id }, carol);

			const res = await api('i/notifications-grouped', {}, alice);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);

			expect(res.body.some((notification) => 'userId' in notification && notification.userId === bob.id)).toBe(true);
			expect(res.body.some((notification) => 'userId' in notification && notification.userId === carol.id)).toBe(false);
		});

		// 通知を受けたあとで相手をミュートすると、最新のページが全件除外されることがある。空のページは
		// クライアントに「これ以上ない」と受け取られ、その先の見られる通知が表示されなくなる。
		test('最新の通知がすべてミュート相手のものでも、その先の通知を返す', async () => {
			const dave = await signup({ username: `daveg${Date.now() % 100000}` });
			const aliceNote = await post(alice, { text: 'hi' });
			const bobReply = await post(bob, { text: '@alice visible', replyId: aliceNote.id });
			for (let i = 0; i < 3; i++) await post(dave, { text: `@alice later muted ${i}`, replyId: aliceNote.id });
			await api('mute/create', { userId: dave.id }, alice);

			const res = await api('i/notifications-grouped', { limit: 2 }, alice);

			expect(res.status).toBe(200);
			expect(res.body.some((notification) => 'userId' in notification && notification.userId === dave.id)).toBe(false);
			expect(res.body.some((notification) => 'note' in notification && notification.note?.id === bobReply.id)).toBe(
				true,
			);
		});
	});
});
