/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';

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
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	test('reports the client account once after repeated injection', async () => {
		const listeners: ((event: MessageEvent) => Promise<void>)[] = [];
		const addEventListener = vi.fn((_type, callback) => {
			listeners.push(callback);
		});
		vi.stubGlobal('navigator', { serviceWorker: { addEventListener } });
		const { swInject } = await import('@/ui/common/sw-inject.js');
		const postMessage = vi.fn();

		swInject();
		swInject();
		const event = { data: { type: 'requestClientAccount' }, ports: [{ postMessage }] } as unknown as MessageEvent;
		await Promise.all(listeners.map((listener) => listener(event)));

		expect(postMessage).toHaveBeenCalledWith({ loginId: 'account-a' });
		expect(postMessage).toHaveBeenCalledOnce();
	});

	test('does not switch accounts for an invalid order message', async () => {
		let listener: ((event: MessageEvent) => Promise<void>) | undefined;
		const addEventListener = vi.fn((_type, callback) => {
			listener = callback;
		});
		vi.stubGlobal('navigator', { serviceWorker: { addEventListener } });
		const { getAccountFromId } = await import('@/features/user/get-account-from-id.js');
		const { login } = await import('@/accounts.js');
		const { swInject } = await import('@/ui/common/sw-inject.js');

		swInject();
		await listener?.({
			data: { type: 'order', order: 'push', loginId: 'account-b', url: 'https://attacker.example/' },
		} as MessageEvent);

		expect(getAccountFromId).not.toHaveBeenCalled();
		expect(login).not.toHaveBeenCalled();
	});

	test('validates post options before switching accounts', async () => {
		let listener: ((event: MessageEvent) => Promise<void>) | undefined;
		const addEventListener = vi.fn((_type, callback) => {
			listener = callback;
		});
		vi.stubGlobal('navigator', { serviceWorker: { addEventListener } });
		const { getAccountFromId } = await import('@/features/user/get-account-from-id.js');
		const { login } = await import('@/accounts.js');
		const { swInject } = await import('@/ui/common/sw-inject.js');

		swInject();
		await listener?.({
			data: {
				type: 'order',
				order: 'post',
				loginId: 'account-b',
				url: '/share',
				options: { reply: { id: null } },
			},
		} as unknown as MessageEvent);

		expect(getAccountFromId).not.toHaveBeenCalled();
		expect(login).not.toHaveBeenCalled();
	});
});
