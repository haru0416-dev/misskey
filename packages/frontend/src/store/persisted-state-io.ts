/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { PersistedStateIo } from '@/store/persisted-state.js';
import { $i } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { get, set } from '@/utility/idb-proxy.js';
import { TAB_ID } from '@/tab-id.js';

export const persistedStateIo: PersistedStateIo = {
	sourceId: TAB_ID,
	currentAccountId: () => $i?.id ?? null,
	get,
	set,
	getLegacyItem: (key) => localStorage.getItem(key),
	removeLegacyItem: (key) => localStorage.removeItem(key),
	loadAccount: (namespace) => misskeyApi('i/registry/get-all', { scope: ['client', namespace] }),
	saveAccount: (namespace, key, value) =>
		misskeyApi('i/registry/set', {
			scope: ['client', namespace],
			key,
			value,
		}),
	createChannel: (name) => (typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name)),
	onError: (error) => console.error('Failed to load persisted Pinia state', error),
};
