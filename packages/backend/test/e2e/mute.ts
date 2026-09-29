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

	test('「自分宛ての投稿」にミュートしているユーザーの投稿が含まれない', async () => {
		const bobNote = await post(bob, { text: '@alice hi' });
		const carolNote = await post(carol, { text: '@alice hi' });

		const res = await api('notes/mentions', {}, alice);

		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
		expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
		expect(res.body.some((note) => note.id === carolNote.id)).toBe(false);
	});

	// ノートの通知 (メンション等) は作成の直後に notification を流し、unreadNotification は流さない。ミュート相手の通知は
	// 作成側 (createNoteNotifications) とストリームの main チャンネルの両方で弾くので、どちらかが効いていることを見る。
	test('ミュートしているユーザーからメンションされても、ストリームに通知が流れてこない', async () => {
		await api('notifications/mark-all-as-read', {}, alice);

		const fired = await waitFire(
			alice,
			'main',
			() => post(carol, { text: '@alice hi' }),
			(msg) => msg.type === 'notification',
		);

		expect(fired).toBe(false);
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
