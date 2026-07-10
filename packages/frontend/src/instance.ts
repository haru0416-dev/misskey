/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, reactive } from 'vue';
import * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { miLocalStorage } from '@/local-storage.js';
import { $i } from '@/i.js';
import { queryClient } from '@/query/client.js';
import { queryKeys } from '@/query/keys.js';

// TODO: 他のタブと永続化されたstateを同期

//#region loader
const providedMetaEl = window.document.getElementById('misskey_meta');

let cachedMeta = miLocalStorage.getItem('instance') ? JSON.parse(miLocalStorage.getItem('instance')!) : null;
let cachedAt = miLocalStorage.getItem('instanceCachedAt') ? parseInt(miLocalStorage.getItem('instanceCachedAt')!) : 0;
const providedMeta = providedMetaEl && providedMetaEl.textContent ? JSON.parse(providedMetaEl.textContent) : null;
const providedAt =
	providedMetaEl && providedMetaEl.dataset.generatedAt ? parseInt(providedMetaEl.dataset.generatedAt) : 0;
if (providedAt > cachedAt) {
	miLocalStorage.setItem('instance', JSON.stringify(providedMeta));
	miLocalStorage.setItem('instanceCachedAt', providedAt.toString());
	cachedMeta = providedMeta;
	cachedAt = providedAt;
}
//#endregion

// TODO: instanceをリアクティブにするかは再考の余地あり

export const instance: Misskey.entities.MetaDetailed = reactive(cachedMeta ?? {});

const metaParams = { detail: true } as const;
const metaQueryKey = queryKeys.endpoint($i?.id ?? null, 'meta', metaParams);
if (cachedMeta != null) {
	queryClient.setQueryData(metaQueryKey, cachedMeta, { updatedAt: cachedAt });
}

export async function fetchInstance(force = false): Promise<Misskey.entities.MetaDetailed> {
	if (force) {
		await queryClient.invalidateQueries({ queryKey: metaQueryKey, exact: true, refetchType: 'none' });
	}

	const meta = await misskeyApi('meta', metaParams);

	for (const [k, v] of Object.entries(meta)) {
		(instance[k as keyof typeof meta] as any) = v;
	}

	miLocalStorage.setItem('instance', JSON.stringify(instance));
	miLocalStorage.setItem('instanceCachedAt', Date.now().toString());

	return instance;
}
