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
import { groupCustomEmojisByCategory } from '@/features/custom-emojis/group-by-category.js';

const [storageCache, lastEmojisFetchedAt] = await Promise.all([get('emojis'), get('lastEmojisFetchedAt')]);
const emptyEmojis: Misskey.entities.EmojiSimple[] = [];
const emojisQueryKey = queryKeys.endpoint(null, 'emojis', {});
const storedEmojis = isEmojiSimpleArray(storageCache) ? storageCache : null;

/*
 * IndexedDB への保存は最後の更新から少し待って 1 回にまとめる。保存は全件の構造化複製で、1 万件で約 12 ms、
 * 3 万件で約 29 ms メインスレッドを止める。絵文字の一括インポートは 1 件ごとに emojiAdded が届くので、
 * 更新ごとに保存すると 1,000 件の取り込みで各クライアントが合計 12 秒ほど止まっていた。
 * 保存は次回起動の初期値にだけ使う。待っている間にページを閉じると保存されない (pagehide で書いても
 * Chromium では確定しなかった) が、古い一覧が古い取得時刻とともに残るので、取得から 30 秒 (staleTime) を過ぎていれば起動時に取り直す。
 */
const PERSIST_DELAY_MS = 1000;
let pendingPersist: { emojis: Misskey.entities.EmojiSimple[]; updatedAt: number } | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function flushPersist() {
	if (persistTimer != null) {
		clearTimeout(persistTimer);
		persistTimer = null;
	}
	if (pendingPersist == null) return;
	const { emojis, updatedAt } = pendingPersist;
	pendingPersist = null;
	void set('emojis', emojis);
	void set('lastEmojisFetchedAt', updatedAt);
}

function schedulePersist(emojis: Misskey.entities.EmojiSimple[], updatedAt: number) {
	// 起動時に保存済みの配列そのもので呼ばれる。書き直しても中身は変わらない。
	if (emojis === storedEmojis) return;
	pendingPersist = { emojis, updatedAt };
	if (persistTimer != null) clearTimeout(persistTimer);
	persistTimer = setTimeout(flushPersist, PERSIST_DELAY_MS);
}

const emojisCache = new QueryCacheView<{ emojis: Misskey.entities.EmojiSimple[] }>(emojisQueryKey, {
	initialData: { emojis: storedEmojis ?? emptyEmojis },
	updatedAt: storedEmojis != null && typeof lastEmojisFetchedAt === 'number' ? lastEmojisFetchedAt : 0,
	onUpdate: (value, updatedAt) => {
		if (value == null) return;
		schedulePersist(value.emojis, updatedAt);
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

export const customEmojisByCategory = computed(() => markRaw(groupCustomEmojisByCategory(customEmojis.value)));

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
		flushPersist();
		stopEmojiMap();
		emojisCache.dispose();
	});
}
