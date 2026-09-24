/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, markRaw, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import { isEmojiSimpleArray } from '@shared/utility/custom-emojis.js';
import { misskeyApiGet } from '@/utility/misskey-api.js';
import { get, set } from '@/utility/idb-proxy.js';
import { queryClient } from '@/query/client.js';
import { queryKeys } from '@/query/keys.js';
import { updateEmojiQueries } from '@/query/streaming.js';
import { QueryCacheView } from '@/query/cache.js';

const [storageCache, lastEmojisFetchedAt] = await Promise.all([get('emojis'), get('lastEmojisFetchedAt')]);
const emptyEmojis: Misskey.entities.EmojiSimple[] = [];
const emojisQueryKey = queryKeys.endpoint(null, 'emojis', {});
const emojisCache = new QueryCacheView<{ emojis: Misskey.entities.EmojiSimple[] }>(emojisQueryKey, {
	initialData: { emojis: isEmojiSimpleArray(storageCache) ? storageCache : emptyEmojis },
	updatedAt: isEmojiSimpleArray(storageCache) && typeof lastEmojisFetchedAt === 'number' ? lastEmojisFetchedAt : 0,
	onUpdate: (value, updatedAt) => {
		if (value == null) return;
		void set('emojis', value.emojis);
		void set('lastEmojisFetchedAt', updatedAt);
	},
});
export const customEmojis = computed(() => emojisCache.value.value?.emojis ?? emptyEmojis);
export const customEmojiCategories = computed<[...string[], null]>(() => {
	const categories = new Set<string>();
	for (const emoji of customEmojis.value) {
		if (emoji.category && emoji.category !== 'null') {
			categories.add(emoji.category);
		}
	}
	return markRaw([...Array.from(categories), null]);
});

export const customEmojisMap = new Map<string, Misskey.entities.EmojiSimple>();
const stopEmojiMap = watch(
	customEmojis,
	(emojis) => {
		customEmojisMap.clear();
		for (const emoji of emojis) {
			customEmojisMap.set(emoji.name, emoji);
		}
	},
	{ immediate: true, flush: 'sync' },
);

export function addCustomEmoji(emoji: Misskey.entities.EmojiSimple) {
	updateEmojiQueries({ type: 'add', emoji });
}

export function updateCustomEmojis(emojis: Misskey.entities.EmojiSimple[]) {
	updateEmojiQueries({ type: 'update', emojis });
}

export function removeCustomEmojis(emojis: Misskey.entities.EmojiSimple[]) {
	updateEmojiQueries({ type: 'delete', emojis });
}

export async function fetchCustomEmojis(force = false) {
	if (force) {
		await queryClient.invalidateQueries({ queryKey: emojisQueryKey, exact: true, refetchType: 'none' });
	}
	await misskeyApiGet('emojis', {});
}

if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		stopEmojiMap();
		emojisCache.dispose();
	});
}
