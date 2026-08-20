/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';

const openClient = vi.fn();

vi.mock('idb-keyval', () => ({ get: vi.fn() }));
vi.mock('misskey-js/acct.js', () => ({ toString: vi.fn() }));
vi.mock('@/scripts/create-notification.js', () => ({
	createEmptyNotification: vi.fn(),
	createNotification: vi.fn(),
}));
vi.mock('@/scripts/lang.js', () => ({
	MISSKEY_CACHE_PREFIX: 'mk-cache-',
	swLang: { cacheName: 'mk-cache-test', setLang: vi.fn() },
}));
vi.mock('@/scripts/operations.js', () => ({
	api: vi.fn(),
	openAntenna: vi.fn(),
	openChat: vi.fn(),
	openClient,
	openNote: vi.fn(),
	openPost: vi.fn(),
	openUser: vi.fn(),
	sendMarkAllAsRead: vi.fn(),
}));

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	vi.resetModules();
});

test('closes the notification and resolves waitUntil when focus fails', async () => {
	let notificationClick: ((event: unknown) => void) | undefined;
	vi.stubGlobal('addEventListener', vi.fn((type: string, listener: (event: unknown) => void) => {
		if (type === 'notificationclick') notificationClick = listener;
	}));
	const focus = vi.fn().mockRejectedValue(new Error('focus failed'));
	openClient.mockResolvedValue({ focus });
	await import('@/sw.js');
	const close = vi.fn();
	let lifetime: Promise<void> | undefined;

	notificationClick?.({
		action: 'settings',
		notification: { data: {}, close },
		waitUntil: (promise: Promise<void>) => {
			lifetime = promise;
		},
	});

	await expect(lifetime).resolves.toBeUndefined();
	expect(focus).toHaveBeenCalledOnce();
	expect(close).toHaveBeenCalledOnce();
});
