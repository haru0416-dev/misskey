/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import type { MenuItem } from '@/types/menu.js';

/**
 * ミュートワードの 1 行は、正規表現なら文字列、通常の語なら空白で分割した配列 (AND 条件)。
 * ハッシュタグは 1 語なので、要素 1 つの配列として持つ。
 */
export function isSameMute(entry: string | string[], word: string): boolean {
	return Array.isArray(entry) && entry.length === 1 && entry[0] === word;
}

export function getHashtagMenu(hashtag: string): MenuItem[] {
	const word = `#${hashtag}`;
	const menu: MenuItem[] = [
		{
			type: 'label',
			text: word,
		},
		{
			icon: 'ti ti-clipboard',
			text: i18n.ts.copy,
			action: async () => {
				// copy-to-clipboard も `@/os.js` を引くので、同じ理由で操作時に読む。
				const { copyToClipboard } = await import('@/utility/copy-to-clipboard.js');
				copyToClipboard(word);
			},
		},
	];

	const me = $i;
	if (me == null) return menu;

	const muted = me.mutedWords.some((entry) => isSameMute(entry, word));

	menu.push({
		icon: muted ? 'ti ti-eye' : 'ti ti-eye-off',
		text: muted ? i18n.ts.unmute : i18n.ts.mute,
		action: async () => {
			const mutedWords = muted ? me.mutedWords.filter((entry) => !isSameMute(entry, word)) : [...me.mutedWords, [word]];

			// `@/os.js` を module scope で読むと MkMfm 経由で循環 import になり、
			// MFM が何も描画されなくなる。操作時に読む。
			const os = await import('@/os.js');
			await os.apiWithDialog('i/update', { mutedWords });
			// 反映を待たずに次の判定へ入ると古い値を見るので、手元も合わせておく。
			me.mutedWords = mutedWords;
		},
	});

	return menu;
}
