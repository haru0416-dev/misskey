/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { shallowRef, computed, markRaw, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { isEmojiSimpleArray } from '@shared/utility/custom-emojis.js';
import { misskeyApiGet } from '@/utility/misskey-api.js';
import { get, set } from '@/utility/idb-proxy.js';
import { queryClient } from '@/query/client.js';
import { queryKeys } from '@/query/keys.js';
import { updateEmojiQueries } from '@/query/streaming.js';

const [storageCache, lastEmojisFetchedAt] = await Promise.all([get('emojis'), get('lastEmojisFetchedAt')]);
export const customEmojis = shallowRef<Misskey.entities.EmojiSimple[]>(
	isEmojiSimpleArray(storageCache) ? storageCache : [],
);
const emojisQueryKey = queryKeys.endpoint(null, 'emojis', {});
if (isEmojiSimpleArray(storageCache)) {
	queryClient.setQueryData(
		emojisQueryKey,
		{ emojis: storageCache },
		{ updatedAt: typeof lastEmojisFetchedAt === 'number' ? lastEmojisFetchedAt : 0 },
	);
}
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
watch(
	customEmojis,
	(emojis) => {
		customEmojisMap.clear();
		for (const emoji of emojis) {
			customEmojisMap.set(emoji.name, emoji);
		}
	},
	{ immediate: true },
);

export function addCustomEmoji(emoji: Misskey.entities.EmojiSimple) {
	customEmojis.value = [emoji, ...customEmojis.value];
	updateEmojiQueries({ type: 'add', emoji });
	set('emojis', customEmojis.value);
}

export function updateCustomEmojis(emojis: Misskey.entities.EmojiSimple[]) {
	const updatesByName = new Map(emojis.map((emoji) => [emoji.name, emoji]));
	customEmojis.value = customEmojis.value.map((item) => updatesByName.get(item.name) ?? item);
	updateEmojiQueries({ type: 'update', emojis });
	set('emojis', customEmojis.value);
}

export function removeCustomEmojis(emojis: Misskey.entities.EmojiSimple[]) {
	const removedNames = new Set(emojis.map((emoji) => emoji.name));
	customEmojis.value = customEmojis.value.filter((item) => !removedNames.has(item.name));
	updateEmojiQueries({ type: 'delete', emojis });
	set('emojis', customEmojis.value);
}

export async function fetchCustomEmojis(force = false) {
	const now = Date.now();

	if (force) {
		await queryClient.invalidateQueries({ queryKey: emojisQueryKey, exact: true, refetchType: 'none' });
	}
	const res = await misskeyApiGet('emojis', {});

	customEmojis.value = res.emojis;
	set('emojis', res.emojis);
	set('lastEmojisFetchedAt', now);
}
