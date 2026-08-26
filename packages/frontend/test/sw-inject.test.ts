/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/os.js', () => ({ post: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: { id: 'account-a' } }));
vi.mock('@/features/users/get-account-from-id.js', () => ({ getAccountFromId: vi.fn() }));
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

	test('registers the service worker listener only once', async () => {
		const addEventListener = vi.fn();
		vi.stubGlobal('navigator', { serviceWorker: { addEventListener } });
		const { swInject } = await import('@/ui/_common_/sw-inject.js');

		swInject();
		swInject();

		expect(addEventListener).toHaveBeenCalledOnce();
	});

	test('reports the account represented by the client', async () => {
		let listener: ((event: MessageEvent) => void) | undefined;
		const addEventListener = vi.fn((_type, callback) => {
			listener = callback;
		});
		vi.stubGlobal('navigator', { serviceWorker: { addEventListener } });
		const { swInject } = await import('@/ui/_common_/sw-inject.js');
		const postMessage = vi.fn();

		swInject();
		listener?.({ data: { type: 'requestClientAccount' }, ports: [{ postMessage }] } as unknown as MessageEvent);

		expect(postMessage).toHaveBeenCalledWith({ loginId: 'account-a' });
	});

	test('does not switch accounts for an invalid order message', async () => {
		let listener: ((event: MessageEvent) => Promise<void>) | undefined;
		const addEventListener = vi.fn((_type, callback) => {
			listener = callback;
		});
		vi.stubGlobal('navigator', { serviceWorker: { addEventListener } });
		const { getAccountFromId } = await import('@/features/users/get-account-from-id.js');
		const { login } = await import('@/accounts.js');
		const { swInject } = await import('@/ui/_common_/sw-inject.js');

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
		const { getAccountFromId } = await import('@/features/users/get-account-from-id.js');
		const { login } = await import('@/accounts.js');
		const { swInject } = await import('@/ui/_common_/sw-inject.js');

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
