/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setTimeout } from 'node:timers/promises';
import { beforeAll, describe, expect, test } from 'vitest';
import { api, signup } from '../utils.js';
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

	test('通知設定なしのフォローのみの場合、空配列が返る', async () => {
		await api('following/create', { userId: bob.id }, alice);

		const res1 = await api('following/list', { notification: true }, alice);
		const res2 = await api('following/list', {}, alice);

		expect(res1.status).toBe(200);
		expect(Array.isArray(res1.body)).toBe(true);
		expect(res1.body.length).toBe(0);

		expect(res2.status).toBe(200);
		expect(Array.isArray(res2.body)).toBe(true);
		expect(res2.body.length).toBe(1);
		expect(res2.body[0]?.followeeId).toBe(bob.id);
	});

	test('通知設定ありのフォローがある場合、そのユーザーが返る', async () => {
		await api('following/create', { userId: carol.id, withReplies: false }, alice);
		await api('following/update', { userId: carol.id, notify: 'normal' }, alice);

		const res = await api('following/list', { notification: true }, alice);

		expect(res.status).toBe(200);
		expect(res.body.length).toBe(1);
		expect(res.body[0]?.followeeId).toBe(carol.id);
	});

	test('複数ユーザーで通知設定ありの場合、全員返る', async () => {
		await api('following/update', { userId: bob.id, notify: 'normal' }, alice);

		const res = await api('following/list', { notification: true }, alice);

		expect(res.status).toBe(200);
		expect(res.body.length).toBe(2);

		const ids = res.body.map((u) => u.followeeId).sort();
		expect(ids).toStrictEqual([bob.id, carol.id].sort());
	});

	test('通知設定をOFF（none）にすると notification: true な一覧から外れる', async () => {
		await api('following/update', { userId: bob.id, notify: 'none' }, alice);

		const res1 = await api('following/list', { notification: true }, alice);
		const res2 = await api('following/list', {}, alice);

		expect(res1.status).toBe(200);
		expect(res1.body.length).toBe(1);
		expect(res1.body[0]?.followeeId).toBe(carol.id);

		expect(res2.status).toBe(200);
		expect(res2.body.length).toBe(2);
		const ids = res2.body.map((u) => u.followeeId).sort();
		expect(ids).toStrictEqual([bob.id, carol.id].sort());
	});

	test('他のユーザーの通知対象は見えない', async () => {
		await api('following/create', { userId: carol.id }, bob);
		await api('following/update', { userId: carol.id, notify: 'normal' }, bob);

		const aliceRes = await api('following/list', { notification: true }, alice);
		const aliceIds = aliceRes.body.map((u) => u.followeeId);
		expect(aliceIds.includes(bob.id)).toBe(false);

		const bobRes = await api('following/list', { notification: true }, bob);
		expect(bobRes.body.length).toBe(1);
		expect(bobRes.body[0]?.followeeId).toBe(carol.id);

		await api('following/delete', { userId: carol.id }, bob);
	});

	test('normal通知設定時、投稿で通知が届く', async () => {
		await api('following/update', { userId: bob.id, notify: 'normal' }, alice);

		await api('notifications/mark-all-as-read', {}, alice);
		const textOnlyRes = await api(
			'notes/create',
			{
				text: 'ファイルなしの投稿',
			},
			bob,
		);
		expect(textOnlyRes.status).toBe(200);
		// Redis への反映を待つ。
		await setTimeout(100);

		const beforeRes = await api('i/notifications', {}, alice);
		expect(beforeRes.status).toBe(200);
		const noteNotif = beforeRes.body.filter(
			(n: { type: string; note?: { id: string } }) =>
				n.type === 'note' && n.note?.id === textOnlyRes.body.createdNote.id,
		);

		expect(noteNotif.length, '投稿の通知が届かなかった').toBe(1);

		await api('following/update', { userId: bob.id, notify: 'none' }, alice);
		await api('notifications/mark-all-as-read', {}, alice);
	});

	test('limit パラメータが効く', async () => {
		await api('following/update', { userId: bob.id, notify: 'normal' }, alice);

		const allRes = await api('following/list', { notification: true }, alice);
		expect(allRes.status).toBe(200);
		expect(allRes.body.length).toBe(2);

		const res = await api('following/list', { notification: true, limit: 1 }, alice);
		expect(res.status).toBe(200);
		expect(res.body.length).toBe(1);
	});

	test('未認証の場合はエラー', async () => {
		const res = await api('following/list', {});
		expect(res.status).toBe(401);
	});
});
