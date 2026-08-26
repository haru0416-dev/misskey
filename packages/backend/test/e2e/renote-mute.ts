/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { api, post, signup, waitFire } from '../utils.js';
import type * as misskey from 'misskey-js';

const STREAMING_NEGATIVE_TIMEOUT_MS = 500;

describe('Renote Mute', () => {
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

	test('ミュート作成', async () => {
		const res = await api(
			'renote-mute/create',
			{
				userId: carol.id,
			},
			alice,
		);

		expect(res.status).toBe(204);
	});

	test('タイムラインにリノートミュートしているユーザーのリノートが含まれない', async () => {
		const bobNote = await post(bob, { text: 'hi' });
		const carolRenote = await post(carol, { renoteId: bobNote.id });
		const carolNote = await post(carol, { text: 'hi' });

		const res = await api('notes/local-timeline', {}, alice);

		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
		expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
		expect(res.body.some((note) => note.id === carolRenote.id)).toBe(false);
		expect(res.body.some((note) => note.id === carolNote.id)).toBe(true);
	});

	test('タイムラインにリノートミュートしているユーザーの引用が含まれる', async () => {
		const bobNote = await post(bob, { text: 'hi' });
		const carolRenote = await post(carol, { renoteId: bobNote.id, text: 'kore' });
		const carolNote = await post(carol, { text: 'hi' });

		const res = await api('notes/local-timeline', {}, alice);

		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
		expect(res.body.some((note) => note.id === bobNote.id)).toBe(true);
		expect(res.body.some((note) => note.id === carolRenote.id)).toBe(true);
		expect(res.body.some((note) => note.id === carolNote.id)).toBe(true);
	});

	// #12956
	test('タイムラインにリノートミュートしているユーザーの通常ノートのリノートが含まれる', async () => {
		const carolNote = await post(carol, { text: 'hi' });
		const bobRenote = await post(bob, { renoteId: carolNote.id });

		const res = await api('notes/local-timeline', {}, alice);

		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
		expect(res.body.some((note) => note.id === carolNote.id)).toBe(true);
		expect(res.body.some((note) => note.id === bobRenote.id)).toBe(true);
	});

	test('ストリームにリノートミュートしているユーザーのリノートが流れない', async () => {
		const bobNote = await post(bob, { text: 'hi' });

		const fired = await waitFire(
			alice,
			'localTimeline',
			() => api('notes/create', { renoteId: bobNote.id }, carol),
			(msg) => msg.type === 'note' && msg.body['userId'] === carol.id,
			undefined,
			STREAMING_NEGATIVE_TIMEOUT_MS,
		);

		expect(fired).toBe(false);
	});

	test('ストリームにリノートミュートしているユーザーの引用が流れる', async () => {
		const bobNote = await post(bob, { text: 'hi' });

		const fired = await waitFire(
			alice,
			'localTimeline',
			() => api('notes/create', { renoteId: bobNote.id, text: 'kore' }, carol),
			(msg) => msg.type === 'note' && msg.body['userId'] === carol.id,
		);

		expect(fired).toBe(true);
	});

	// #12956
	test('ストリームにリノートミュートしているユーザーの通常ノートのリノートが流れてくる', async () => {
		const carolbNote = await post(carol, { text: 'hi' });

		const fired = await waitFire(
			alice,
			'localTimeline',
			() => api('notes/create', { renoteId: carolbNote.id }, bob),
			(msg) => msg.type === 'note' && msg.body['userId'] === bob.id,
		);

		expect(fired).toBe(true);
	});
});
