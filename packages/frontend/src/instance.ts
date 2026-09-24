/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { shallowReactive, shallowReadonly } from 'vue';
import type * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { miLocalStorage } from '@/local-storage.js';
import { $i } from '@/i.js';
import { queryClient } from '@/query/client.js';
import { queryKeys } from '@/query/keys.js';
import { resolveInitialInstanceMeta } from '@/features/instances/instance-cache.js';
import { QueryBackedCache } from '@/query/cache.js';

//#region loader
const providedMetaEl = window.document.getElementById('misskey_meta');
const initialMeta = resolveInitialInstanceMeta({
	cachedMeta: miLocalStorage.getItem('instance'),
	cachedAt: miLocalStorage.getItem('instanceCachedAt'),
	providedMeta: providedMetaEl?.textContent ?? null,
	providedAt: providedMetaEl?.dataset['generatedAt'] ?? null,
});
if (initialMeta.cacheAction === 'clear') {
	miLocalStorage.removeItem('instance');
	miLocalStorage.removeItem('instanceCachedAt');
}
const cachedMeta = initialMeta.meta as Misskey.entities.MetaDetailed | null;
const cachedAt = initialMeta.cachedAt;
//#endregion

const instanceView = shallowReactive({}) as Misskey.entities.MetaDetailed;
export const instance = shallowReadonly(instanceView);

const metaParams = { detail: true } as const;
const accountToken = $i?.token ?? null;
const metaQueryKey = queryKeys.endpoint($i?.id ?? null, 'meta', metaParams);
const metaCache = new QueryBackedCache<Misskey.entities.MetaDetailed>(
	metaQueryKey,
	(signal) => misskeyApi('meta', metaParams, accountToken, signal),
	1000 * 60 * 60,
	{
		...(cachedMeta == null ? {} : { initialData: cachedMeta }),
		updatedAt: cachedAt,
		onUpdate: (meta, updatedAt) => {
			if (meta == null) {
				for (const key of Object.keys(instanceView)) Reflect.deleteProperty(instanceView, key);
				return;
			}
			for (const key of Object.keys(instanceView)) {
				if (!Object.hasOwn(meta, key)) Reflect.deleteProperty(instanceView, key);
			}
			Object.assign(instanceView, meta);
			miLocalStorage.setItem('instance', JSON.stringify(meta));
			miLocalStorage.setItem('instanceCachedAt', updatedAt.toString());
		},
	},
);

export function updateInstance(meta: Partial<Misskey.entities.MetaDetailed>): void {
	metaCache.set({ ...metaCache.value.value, ...meta } as Misskey.entities.MetaDetailed);
}

if (import.meta.hot) import.meta.hot.dispose(() => metaCache.dispose());

export async function clearInstanceCache(): Promise<void> {
	await queryClient.invalidateQueries({ queryKey: metaQueryKey, exact: true, refetchType: 'none' });
	miLocalStorage.removeItem('instance');
	miLocalStorage.removeItem('instanceCachedAt');
}

export async function fetchInstance(force = false): Promise<Misskey.entities.MetaDetailed> {
	if (force) {
		await queryClient.invalidateQueries({ queryKey: metaQueryKey, exact: true, refetchType: 'none' });
	}

	return metaCache.fetch();
}
