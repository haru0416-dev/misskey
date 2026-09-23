/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, expect, test, vi } from 'vitest';
import { getAccountFromId, getLocalAccounts } from '@/scripts/get-account-from-id.js';

const storage = vi.hoisted(() => new Map<string, unknown>());
vi.mock('idb-keyval', () => ({ get: async (key: string) => storage.get(key) }));

afterEach(() => {
	storage.clear();
	vi.unstubAllGlobals();
});

test('does not reuse a foreign-host or legacy credential after signout', async () => {
	vi.stubGlobal('location', new URL('https://misskey.example'));
	const accountTokens: Record<string, string> = {
		'misskey.example/account-a': 'local-token',
		'foreign.example/account-a': 'foreign-token',
	};
	storage.set('pinia::base::device', { accountTokens });
	storage.set('accounts', [{ id: 'account-a', token: 'obsolete-token' }]);

	await expect(getAccountFromId('account-a')).resolves.toEqual({ id: 'account-a', token: 'local-token' });
	await expect(getLocalAccounts()).resolves.toEqual([{ id: 'account-a', token: 'local-token' }]);

	delete accountTokens['misskey.example/account-a'];
	await expect(getAccountFromId('account-a')).resolves.toBeUndefined();
	await expect(getLocalAccounts()).resolves.toEqual([]);
});
