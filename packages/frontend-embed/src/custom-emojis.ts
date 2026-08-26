/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { shallowRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { isEmojiSimpleArray } from '@shared/utility/custom-emojis.js';
import { misskeyApi, misskeyApiGet } from '@/misskey-api.js';

function get(key: string): unknown {
	const value = localStorage.getItem(key);
	if (value === null) return null;
	try {
		return JSON.parse(value);
	} catch {
		localStorage.removeItem(key);
		return null;
	}
}

function set(key: string, value: unknown): void {
	localStorage.setItem(key, JSON.stringify(value));
}

const storageCache = get('emojis');
if (storageCache !== null && !isEmojiSimpleArray(storageCache)) localStorage.removeItem('emojis');
const customEmojis = shallowRef<Misskey.entities.EmojiSimple[]>(isEmojiSimpleArray(storageCache) ? storageCache : []);

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

export async function fetchCustomEmojis(force = false) {
	const now = Date.now();

	let res;
	if (force) {
		res = await misskeyApi('emojis', {});
	} else {
		const lastFetchedAt = get('lastEmojisFetchedAt');
		if (typeof lastFetchedAt === 'number' && Number.isFinite(lastFetchedAt) && now - lastFetchedAt < 1000 * 60 * 60) return;
		res = await misskeyApiGet('emojis', {});
	}

	customEmojis.value = res.emojis;
	set('emojis', res.emojis);
	set('lastEmojisFetchedAt', now);
}
