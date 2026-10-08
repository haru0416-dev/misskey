/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll, describe, expect, test, vi } from 'vitest';
import { api, POLL, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('following/list', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let carol: misskey.entities.SignupResponse;

	beforeAll(
		async () => {
			alice = await signup({ username: 'alice' });
			bob = await signup({ username: 'bob' });
			carol = await signup({ username: 'carol' });
		},
		1000 * 60 * 2,
	);

	test('通知対象を0件から1件、複数件へ変更し、limitと通知OFFを反映する', async () => {
		await api('following/create', { userId: bob.id }, alice);

		const res1 = await api('following/list', { notification: true }, alice);
		const res2 = await api('following/list', {}, alice);

		expect(res1.status).toBe(200);
		expect(Array.isArray(res1.body)).toBe(true);
		expect(res1.body).toHaveLength(0);

		expect(res2.status).toBe(200);
		expect(Array.isArray(res2.body)).toBe(true);
		expect(res2.body).toHaveLength(1);
		expect(res2.body[0]?.followeeId).toBe(bob.id);
		await api('following/create', { userId: carol.id, withReplies: false }, alice);
		await api('following/update', { userId: carol.id, notify: 'normal' }, alice);

		const one = await api('following/list', { notification: true }, alice);
		expect(one.status).toBe(200);
		expect(one.body.map((u) => u.followeeId)).toStrictEqual([carol.id]);
		await api('following/update', { userId: bob.id, notify: 'normal' }, alice);

		const res = await api('following/list', { notification: true }, alice);

		expect(res.status).toBe(200);
		expect(res.body).toHaveLength(2);

		const ids = res.body.map((u) => u.followeeId).sort();
		expect(ids).toStrictEqual([bob.id, carol.id].sort());

		const limited = await api('following/list', { notification: true, limit: 1 }, alice);
		expect(limited.status).toBe(200);
		expect(limited.body).toHaveLength(1);
		await api('following/update', { userId: bob.id, notify: 'none' }, alice);

		const remaining = await api('following/list', { notification: true }, alice);
		const all = await api('following/list', {}, alice);
		expect(remaining.status).toBe(200);
		expect(remaining.body.map((u) => u.followeeId)).toStrictEqual([carol.id]);
		expect(all.status).toBe(200);
		expect(all.body.map((u) => u.followeeId).sort()).toStrictEqual([bob.id, carol.id].sort());
	});

	test('他のユーザーの通知対象は見えない', async () => {
		await api('following/create', { userId: carol.id }, bob);
		await api('following/update', { userId: carol.id, notify: 'normal' }, bob);

		const aliceRes = await api('following/list', { notification: true }, alice);
		const aliceIds = aliceRes.body.map((u) => u.followeeId);
		expect(aliceIds.includes(bob.id)).toBe(false);

		const bobRes = await api('following/list', { notification: true }, bob);
		expect(bobRes.body).toHaveLength(1);
		expect(bobRes.body[0]?.followeeId).toBe(carol.id);

		await api('following/delete', { userId: carol.id }, bob);
	});

	// 他のテストのフォロー状態に依存しないよう、この確認専用の利用者でフォローから作る。
	test('normal通知設定時、投稿で通知が届く', async () => {
		const follower = await signup();
		const poster = await signup();
		expect((await api('following/create', { userId: poster.id }, follower)).status).toBe(200);
		expect((await api('following/update', { userId: poster.id, notify: 'normal' }, follower)).status).toBe(200);

		const textOnlyRes = await api(
			'notes/create',
			{
				text: 'ファイルなしの投稿',
			},
			poster,
		);
		expect(textOnlyRes.status).toBe(200);

		// 通知は応答の後に作られるので、届くまで待つ。
		await vi.waitFor(async () => {
			const res = await api('i/notifications', {}, follower);
			expect(res.status).toBe(200);
			const noteNotif = res.body.filter(
				(n: { type: string; note?: { id: string } }) =>
					n.type === 'note' && n.note?.id === textOnlyRes.body.createdNote.id,
			);
			expect(noteNotif).toHaveLength(1);
		}, POLL);
	});
});
