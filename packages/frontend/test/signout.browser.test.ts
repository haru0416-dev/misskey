/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

const { unisonReload, cloudBackup, disposeStore, disposePreferences } = vi.hoisted(() => ({
	unisonReload: vi.fn(),
	cloudBackup: vi.fn(),
	disposeStore: vi.fn(),
	disposePreferences: vi.fn(),
}));

vi.mock('@/i.js', () => ({ $i: { id: 'me', token: 'dead-token' } }));
vi.mock('@/store.js', () => ({
	store: { enablePreferencesAutoCloudBackup: true, $persistDispose: disposeStore },
}));
vi.mock('@/preferences.js', () => ({ disposePreferences }));
vi.mock('@/os.js', () => ({ waiting: vi.fn() }));
vi.mock('@/preferences/utility.js', () => ({ cloudBackup }));
vi.mock('@/utility/unison-reload.js', () => ({ unisonReload }));
vi.mock('@/utility/idb-proxy.js', () => ({ clear: vi.fn(async () => {}) }));
vi.mock('@/query/client.js', () => ({ queryClient: { clear: vi.fn() } }));

describe('signout', () => {
	beforeEach(() => {
		unisonReload.mockReset();
		cloudBackup.mockReset();
		disposeStore.mockReset().mockResolvedValue(undefined);
		disposePreferences.mockReset().mockResolvedValue(undefined);
		localStorage.setItem('account', '{"id":"me"}');
	});

	test('クラウドへのバックアップが失敗しても、保存した認証情報を消して再読込まで進む', async () => {
		cloudBackup.mockRejectedValue(new Error('AUTHENTICATION_FAILED'));
		const { signout } = await import('@/signout.js');

		await signout();

		expect(cloudBackup).toHaveBeenCalled();
		expect(localStorage.getItem('account')).toBeNull();
		expect(unisonReload).toHaveBeenCalledWith('/');
	});

	test('clears account storage only after all persistence owners have drained their in-flight writes', async () => {
		const storeDone = Promise.withResolvers<void>();
		const preferencesDone = Promise.withResolvers<void>();
		const bothStarted = Promise.withResolvers<void>();
		let started = 0;
		disposeStore.mockImplementation(() => {
			if (++started === 2) bothStarted.resolve();
			return storeDone.promise;
		});
		disposePreferences.mockImplementation(() => {
			if (++started === 2) bothStarted.resolve();
			return preferencesDone.promise;
		});
		cloudBackup.mockResolvedValue(undefined);
		const { signout } = await import('@/signout.js');
		const completion = signout();
		await bothStarted.promise;
		expect(localStorage.getItem('account')).not.toBeNull();
		expect(unisonReload).not.toHaveBeenCalled();
		localStorage.setItem('late-account-write', 'synthetic');
		storeDone.resolve();
		preferencesDone.resolve();
		await completion;
		expect(localStorage.getItem('account')).toBeNull();
		expect(localStorage.getItem('late-account-write')).toBeNull();
		expect(unisonReload).toHaveBeenCalledWith('/');
	});
});
