/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { PersistedStateIo } from '@/store/persisted-state.js';
import { $i } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { get, update } from '@/utility/idb-proxy.js';
import { TAB_ID } from '@/tab-id.js';
import { miLocalStorage } from '@/local-storage.js';
import { isAccountWithToken } from '@/features/auth/account-data.js';

const accountId = $i?.id ?? null;
const accountToken = $i?.token ?? null;

export const persistedStateIo: PersistedStateIo = {
	sourceId: TAB_ID,
	currentAccountId: () => accountId,
	// 別タブの切替・ログアウト後は、捕捉済み認証情報で遅延処理を再開しない。
	isCurrent: () => {
		const selected = miLocalStorage.getItemAsJson('account', isAccountWithToken);
		return (selected?.id ?? null) === accountId && (selected?.token ?? null) === accountToken;
	},
	get,
	update,
	loadAccount: (namespace) => misskeyApi('i/registry/get-all', { scope: ['client', namespace] }, accountToken),
	saveAccount: (namespace, key, value) =>
		misskeyApi(
			'i/registry/set',
			{
				scope: ['client', namespace],
				key,
				value,
			},
			accountToken,
		),
	createChannel: (name) => (typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name)),
	onError: (error) => console.error('Failed to load or save persisted Pinia state', error),
};
