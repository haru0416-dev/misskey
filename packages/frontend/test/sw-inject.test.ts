/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/os.js', () => ({ post: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: vi.fn() }));
vi.mock('@/i.js', () => ({ $i: null }));
vi.mock('@/utility/get-account-from-id.js', () => ({ getAccountFromId: vi.fn() }));
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
});
