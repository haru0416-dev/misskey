/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { api, signup, startJobQueue } from '../../utils.js';
import type { TestJobQueueRuntime } from '../../utils.js';

describe('[シナリオ] 鍵の解除', () => {
	let queue: TestJobQueueRuntime;

	beforeAll(
		async () => {
			queue = await startJobQueue();
		},
		1000 * 60 * 2,
	);

	afterAll(async () => {
		await queue.close();
	});

	test('保留中のフォロー申請は応答のあと queue で承認される', async () => {
		const followee = await signup({ username: 'unlockee' });
		const followers = await Promise.all([signup({ username: 'unlockfa' }), signup({ username: 'unlockfb' })]);
		expect((await api('i/update', { isLocked: true }, followee)).status).toBe(200);
		for (const follower of followers) {
			expect((await api('following/create', { userId: followee.id }, follower)).status).toBe(200);
		}
		expect((await api('following/requests/list', {}, followee)).body).toHaveLength(2);

		const unlocked = await api('i/update', { isLocked: false }, followee);
		expect(unlocked.status).toBe(200);
		expect(unlocked.body.isLocked).toBe(false);

		await vi.waitFor(
			async () => {
				const res = await api('users/followers', { userId: followee.id }, followee);
				expect(res.body.map((row: { followerId: string }) => row.followerId).sort()).toEqual(
					followers.map((follower) => follower.id).sort(),
				);
			},
			{ timeout: 15_000, interval: 100 },
		);
		expect((await api('following/requests/list', {}, followee)).body).toEqual([]);
	});
});
