/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { entities } from 'misskey-js';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { api, captureWebhook, randomString, signup, startJobQueue, WEBHOOK_HOST } from '../../utils.js';
import type { TestJobQueueRuntime } from '../../utils.js';

type UserWebhookPayload = { type: string; body: { note: entities.Note } };

describe('[シナリオ] 投稿の webhook', () => {
	let queue: TestJobQueueRuntime;
	let alice: entities.SignupResponse;
	let bob: entities.SignupResponse;

	beforeAll(
		async () => {
			queue = await startJobQueue();
			alice = await signup({ username: 'webhookalice' });
			bob = await signup({ username: 'webhookbob' });
			await api(
				'i/webhooks/create',
				{ name: randomString(), url: WEBHOOK_HOST, secret: randomString(), on: ['note', 'mention'] },
				alice,
			);
		},
		1000 * 60 * 2,
	);

	afterAll(async () => {
		await queue.close();
	});

	test('自分の投稿で note が送出され、本文に投稿が入る', async () => {
		let noteId = '';
		const payload = await captureWebhook<UserWebhookPayload>(async () => {
			noteId = (await api('notes/create', { text: 'webhook note' }, alice)).body.createdNote.id;
		});
		expect(payload.type).toBe('note');
		expect(payload.body.note.id).toBe(noteId);
		expect(payload.body.note.text).toBe('webhook note');
	});

	test('メンションされると mention が送出される', async () => {
		let noteId = '';
		const payload = await captureWebhook<UserWebhookPayload>(async () => {
			noteId = (await api('notes/create', { text: '@webhookalice hello' }, bob)).body.createdNote.id;
		});
		expect(payload.type).toBe('mention');
		expect(payload.body.note.id).toBe(noteId);
		expect(payload.body.note.user.username).toBe('webhookbob');
	});
});
