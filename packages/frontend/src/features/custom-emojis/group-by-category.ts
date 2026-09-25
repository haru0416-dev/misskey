/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';

export type CustomEmojisByCategory = {
	/** category の文字列そのままで引く (null は含まない)。 */
	byCategory: Map<string, Misskey.entities.EmojiSimple[]>;
	/** category が null・空・'null' の絵文字。 */
	uncategorized: Misskey.entities.EmojiSimple[];
};

/**
 * 絵文字ピッカーのフォルダごとの一覧を 1 回の走査で作る。元の並び順を保つ。
 * フォルダごとに全件を走査すると、1 万件・100 フォルダでピッカーを開くたびに約 11 ms、
 * 3 万件・300 フォルダで約 98 ms かかる。
 */
export function groupCustomEmojisByCategory(emojis: readonly Misskey.entities.EmojiSimple[]): CustomEmojisByCategory {
	const byCategory = new Map<string, Misskey.entities.EmojiSimple[]>();
	const uncategorized: Misskey.entities.EmojiSimple[] = [];
	for (const emoji of emojis) {
		const category = emoji.category;
		if (!category || category === 'null') uncategorized.push(emoji);
		if (category == null) continue;
		let list = byCategory.get(category);
		if (list == null) {
			list = [];
			byCategory.set(category, list);
		}
		list.push(emoji);
	}
	return { byCategory, uncategorized };
}
