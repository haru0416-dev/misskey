/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import type * as Misskey from 'misskey-js';
import { groupCustomEmojisByCategory } from '@/features/custom-emojis/group-by-category.js';

const categories = [null, '', 'null', 'a', 'b', 'a/c', 'a/c/d', 'Null'] as const;
const emojis: Misskey.entities.EmojiSimple[] = Array.from({ length: 200 }, (_, i) => ({
	name: `e${i}`,
	category: categories[(i * 7) % categories.length] ?? null,
	aliases: [],
	url: '',
}));

// 以前のピッカーが使っていたフォルダごとの絞り込み。
function topFolder(category: string) {
	return emojis.filter((e) => (category === '' ? e.category === 'null' || !e.category : e.category === category));
}

describe('groupCustomEmojisByCategory', () => {
	const grouped = groupCustomEmojisByCategory(emojis);

	test('最上位フォルダの一覧が全件の絞り込みと順序まで一致する', () => {
		for (const category of categories) {
			if (category == null) continue;
			const actual = category === '' ? grouped.uncategorized : (grouped.byCategory.get(category) ?? []);
			expect(actual).toEqual(topFolder(category));
		}
	});

	test('入れ子のフォルダは category の完全一致で引ける', () => {
		for (const category of ['a/c', 'a/c/d', 'missing']) {
			expect(grouped.byCategory.get(category) ?? []).toEqual(emojis.filter((e) => e.category === category));
		}
	});
});
