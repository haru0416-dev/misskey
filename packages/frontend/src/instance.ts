/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { reactive } from 'vue';
import * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { miLocalStorage } from '@/local-storage.js';
import { $i } from '@/i.js';
import { queryClient } from '@/query/client.js';
import { queryKeys } from '@/query/keys.js';
import { resolveInitialInstanceMeta } from '@/features/instances/instance-cache.js';

//#region loader
const providedMetaEl = window.document.getElementById('misskey_meta');
const initialMeta = resolveInitialInstanceMeta({
	cachedMeta: miLocalStorage.getItem('instance'),
	cachedAt: miLocalStorage.getItem('instanceCachedAt'),
	providedMeta: providedMetaEl?.textContent ?? null,
	providedAt: providedMetaEl?.dataset['generatedAt'] ?? null,
});
if (initialMeta.cacheAction === 'store') {
	miLocalStorage.setItem('instance', JSON.stringify(initialMeta.meta));
	miLocalStorage.setItem('instanceCachedAt', initialMeta.cachedAt.toString());
} else if (initialMeta.cacheAction === 'clear') {
	miLocalStorage.removeItem('instance');
	miLocalStorage.removeItem('instanceCachedAt');
}
const cachedMeta = initialMeta.meta as Misskey.entities.MetaDetailed | null;
const cachedAt = initialMeta.cachedAt;
//#endregion

export const instance = reactive(cachedMeta ?? {}) as Misskey.entities.MetaDetailed;

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

	Object.assign(instance, meta);

	miLocalStorage.setItem('instance', JSON.stringify(instance));
	miLocalStorage.setItem('instanceCachedAt', Date.now().toString());

	return instance;
}
