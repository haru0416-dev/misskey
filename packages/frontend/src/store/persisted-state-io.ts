/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { PersistedStateIo } from '@/store/persisted-state.js';
import { $i } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { get, set, update } from '@/utility/idb-proxy.js';
import { TAB_ID } from '@/tab-id.js';

const accountId = $i?.id ?? null;
const accountToken = $i?.token ?? null;

export const persistedStateIo: PersistedStateIo = {
	sourceId: TAB_ID,
	currentAccountId: () => accountId,
	get,
	set,
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
	onError: (error) => console.error('Failed to load persisted Pinia state', error),
};
