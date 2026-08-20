/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('misskey-js/api.js', () => ({ APIClient: class {} }));

type MockClient = {
	url: string;
	postMessage: ReturnType<typeof vi.fn>;
};

function createClient(url: string, loginId: string | null): MockClient {
	return {
		url,
		postMessage: vi.fn((message: unknown, transfer?: Transferable[]) => {
			if ((message as { type?: string }).type !== 'requestClientAccount') return;
			const port = transfer?.[0] as MessagePort | undefined;
			port?.postMessage({ loginId });
		}),
	};
}

describe('openClient', () => {
	beforeEach(() => {
		vi.stubGlobal('origin', 'https://misskey.example');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('reuses the client representing the requested account', async () => {
		const otherAccount = createClient('https://misskey.example/home', 'account-b');
		const requestedAccount = createClient('https://misskey.example/notifications', 'account-a');
		const openWindow = vi.fn();
		vi.stubGlobal('clients', {
			matchAll: vi.fn().mockResolvedValue([otherAccount, requestedAccount]),
			openWindow,
		});
		const { openClient } = await import('@/scripts/operations.js');

		const result = await openClient('push', '/notes/note-id', 'account-a');

		expect(result).toBe(requestedAccount);
		expect(otherAccount.postMessage).toHaveBeenCalledOnce();
		expect(requestedAccount.postMessage).toHaveBeenLastCalledWith({
			type: 'order',
			order: 'push',
			loginId: 'account-a',
			url: '/notes/note-id',
		});
		expect(openWindow).not.toHaveBeenCalled();
	});

	test('opens a new window instead of switching an unrelated account', async () => {
		const otherAccount = createClient('https://misskey.example/home', 'account-b');
		const openedClient = createClient('https://misskey.example/notes/note-id?loginId=account-a', null);
		const openWindow = vi.fn().mockResolvedValue(openedClient);
		vi.stubGlobal('clients', {
			matchAll: vi.fn().mockResolvedValue([otherAccount]),
			openWindow,
		});
		const { openClient } = await import('@/scripts/operations.js');

		const result = await openClient('push', '/notes/note-id', 'account-a');

		expect(result).toBe(openedClient);
		expect(otherAccount.postMessage).toHaveBeenCalledOnce();
		expect(openWindow).toHaveBeenCalledWith('https://misskey.example/notes/note-id?loginId=account-a');
	});

	test('only reuses clients controlled by the current service worker', async () => {
		const openWindow = vi.fn().mockResolvedValue(null);
		const matchAll = vi.fn().mockResolvedValue([]);
		vi.stubGlobal('clients', { matchAll, openWindow });
		const { openClient } = await import('@/scripts/operations.js');

		await openClient('push', '/notes/note-id', 'account-a');

		expect(matchAll).toHaveBeenCalledWith({ includeUncontrolled: false, type: 'window' });
		expect(openWindow).toHaveBeenCalledOnce();
	});

	test('does not trust a loginId URL hint before the client listener is ready', async () => {
		vi.useFakeTimers();
		const hintedClient = {
			url: 'https://misskey.example/home?loginId=account-a',
			postMessage: vi.fn(),
		};
		const openedClient = createClient('https://misskey.example/notes/note-id?loginId=account-a', null);
		const openWindow = vi.fn().mockResolvedValue(openedClient);
		vi.stubGlobal('clients', {
			matchAll: vi.fn().mockResolvedValue([hintedClient]),
			openWindow,
		});
		const { openClient } = await import('@/scripts/operations.js');

		const result = openClient('push', '/notes/note-id', 'account-a');
		await vi.advanceTimersByTimeAsync(250);

		await expect(result).resolves.toBe(openedClient);
		expect(openWindow).toHaveBeenCalledWith('https://misskey.example/notes/note-id?loginId=account-a');
		vi.useRealTimers();
	});
});
