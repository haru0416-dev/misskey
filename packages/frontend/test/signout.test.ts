/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

const unisonReload = vi.fn();
const cloudBackup = vi.fn();

vi.mock('@/i.js', () => ({ $i: { id: 'me', token: 'dead-token' } }));
vi.mock('@/store.js', () => ({ store: { enablePreferencesAutoCloudBackup: true } }));
vi.mock('@/os.js', () => ({ waiting: vi.fn() }));
vi.mock('@/preferences/utility.js', () => ({ cloudBackup }));
vi.mock('@/utility/unison-reload.js', () => ({ unisonReload }));
vi.mock('@/utility/idb-proxy.js', () => ({ clear: vi.fn(async () => {}) }));
vi.mock('@/query/client.js', () => ({ queryClient: { clear: vi.fn() } }));

describe('signout', () => {
	beforeEach(() => {
		unisonReload.mockReset();
		cloudBackup.mockReset();
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
});
