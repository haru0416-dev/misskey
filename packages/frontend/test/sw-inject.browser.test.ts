/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { swInject } from '@/ui/common/sw-inject.js';
import { getAccountFromId } from '@/features/user/get-account-from-id.js';
import { login } from '@/accounts.js';
import { mainRouter } from '@/router.js';

vi.mock('@/features/post-composer/post.js', () => ({ post: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: { id: 'account-a' } }));
vi.mock('@/features/user/get-account-from-id.js', () => ({ getAccountFromId: vi.fn() }));
vi.mock('@/accounts.js', () => ({ login: vi.fn() }));
vi.mock('@/router.js', () => ({
	mainRouter: {
		currentRoute: { value: { path: '/' } },
		pushByPath: vi.fn(),
	},
}));

describe('swInject', () => {
	const listeners: ((event: MessageEvent) => unknown)[] = [];

	beforeAll(() => {
		vi.spyOn(navigator.serviceWorker, 'addEventListener').mockImplementation((type, callback) => {
			if (type === 'message' && typeof callback === 'function') {
				listeners.push(callback as (event: MessageEvent) => unknown);
			}
		});
		swInject();
	});
	beforeEach(() => vi.clearAllMocks());
	afterAll(() => vi.restoreAllMocks());

	test('reports the client account once after repeated injection', async () => {
		swInject();
		swInject();
		const channel = new MessageChannel();
		const completed = Promise.withResolvers<unknown[]>();
		const replies: unknown[] = [];
		channel.port1.onmessage = (event) => {
			if (event.data?.type === 'replyFence') completed.resolve(replies);
			else replies.push(event.data);
		};
		try {
			const event = new MessageEvent('message', {
				data: { type: 'requestClientAccount' },
				ports: [channel.port2],
			});
			await Promise.all(listeners.map((listener) => listener(event)));
			channel.port2.postMessage({ type: 'replyFence' });
			expect(await completed.promise).toEqual([{ loginId: 'account-a' }]);
		} finally {
			channel.port1.close();
			channel.port2.close();
		}
	});

	test('does not switch accounts for an invalid order message', async () => {
		const event = new MessageEvent('message', {
			data: { type: 'order', order: 'push', loginId: 'account-b', url: 'https://attacker.example/' },
		});
		await Promise.all(listeners.map((listener) => listener(event)));
		expect(getAccountFromId).not.toHaveBeenCalled();
		expect(login).not.toHaveBeenCalled();
		expect(mainRouter.pushByPath).not.toHaveBeenCalled();
	});

	test('validates post options before switching accounts', async () => {
		const event = new MessageEvent('message', {
			data: {
				type: 'order',
				order: 'post',
				loginId: 'account-b',
				url: '/share',
				options: { reply: { id: null } },
			},
		});
		await Promise.all(listeners.map((listener) => listener(event)));
		expect(getAccountFromId).not.toHaveBeenCalled();
		expect(login).not.toHaveBeenCalled();
	});
});
