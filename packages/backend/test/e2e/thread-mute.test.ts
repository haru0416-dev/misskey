/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll, describe, expect, test, vi } from 'vitest';
import { api, connectStream, POLL, post, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('Note thread mute', () => {
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

	test('notes/mentions にミュートしているスレッドの投稿が含まれない', async () => {
		const bobNote = await post(bob, { text: '@alice @carol root note' });
		const aliceReply = await post(alice, { replyId: bobNote.id, text: '@bob @carol child note' });

		await api('notes/thread-muting/create', { noteId: bobNote.id }, alice);

		const carolReply = await post(carol, { replyId: bobNote.id, text: '@bob @alice child note' });
		const carolReplyWithoutMention = await post(carol, { replyId: aliceReply.id, text: 'child note' });
		// ミュートしていないスレッドの同じ形の投稿は含まれることを対照にする。
		const otherAliceNote = await post(alice, { text: 'unmuted thread' });
		const unmutedReply = await post(carol, { replyId: otherAliceNote.id, text: '@alice unmuted child note' });

		const res = await api('notes/mentions', {}, alice);

		expect(res.status).toBe(200);
		expect(Array.isArray(res.body)).toBe(true);
		expect(res.body.some((note) => note.id === unmutedReply.id)).toBe(true);
		expect(res.body.some((note) => note.id === bobNote.id)).toBe(false);
		expect(res.body.some((note) => note.id === carolReply.id)).toBe(false);
		expect(res.body.some((note) => note.id === carolReplyWithoutMention.id)).toBe(false);
	});

	test('i/notifications にミュートしているスレッドの通知が含まれない', async () => {
		const bobNote = await post(bob, { text: '@alice @carol root note' });
		const aliceReply = await post(alice, { replyId: bobNote.id, text: '@bob @carol child note' });

		await api('notes/thread-muting/create', { noteId: bobNote.id }, alice);

		const carolReply = await post(carol, { replyId: bobNote.id, text: '@bob @alice child note' });
		const carolReplyWithoutMention = await post(carol, { replyId: aliceReply.id, text: 'child note' });
		// 通知は応答を待たずに作られる。ミュートしたスレッドへの投稿の後に、ミュートしていないスレッドへ
		// 同じ形の返信をして、その通知が届いてから見る (読む時点で作られていないだけの素通りを防ぐ)。
		const otherAliceNote = await post(alice, { text: 'unmuted thread' });
		const unmutedReply = await post(carol, { replyId: otherAliceNote.id, text: '@alice unmuted child note' });

		const res = await vi.waitFor(async () => {
			const res = await api('i/notifications', {}, alice);
			expect(res.status).toBe(200);
			expect(res.body.some((notification) => 'note' in notification && notification.note.id === unmutedReply.id)).toBe(
				true,
			);
			return res;
		}, POLL);

		expect(res.body.some((notification) => 'note' in notification && notification.note.id === carolReply.id)).toBe(
			false,
		);
		expect(
			res.body.some((notification) => 'note' in notification && notification.note.id === carolReplyWithoutMention.id),
		).toBe(false);
	});
});
