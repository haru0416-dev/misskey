/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import type { MenuItem } from '@/types/menu.js';

/**
 * ハッシュタグのミュートを表すミュートワードの 1 行を組み立てる。
 *
 * 語の配列 (AND 条件) にすると `String#includes` の素朴な部分一致になり、
 * `#cat` のミュートが `#cats` まで巻き込むうえ、大小の違い (`#Misskey` と `#misskey`)
 * も別物になる。サーバーはタグを NFKC + 小文字で同一視するので、それに寄せるため
 * 正規表現の行として持つ。
 */
export function toHashtagMute(hashtag: string): string {
	// タグに使える文字だけが後ろに続く場合を除いて一致させる (`#cat` が `#cats` を拾わないように)。
	return `/#${escapeForRegExp(hashtag.normalize('NFKC'))}(?![\\p{L}\\p{N}_])/iu`;
}

function escapeForRegExp(value: string): string {
	return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 同じハッシュタグのミュート行かどうか。旧形式 (語の配列) も外せるように見る。 */
export function isSameMute(entry: string | string[], hashtag: string): boolean {
	if (Array.isArray(entry)) return entry.length === 1 && entry[0] === `#${hashtag}`;
	return entry === toHashtagMute(hashtag);
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

	const muted = me.mutedWords.some((entry) => isSameMute(entry, hashtag));

	menu.push({
		icon: muted ? 'ti ti-eye' : 'ti ti-eye-off',
		text: muted ? i18n.ts.unmute : i18n.ts.mute,
		action: async () => {
			const mutedWords = muted
				? me.mutedWords.filter((entry) => !isSameMute(entry, hashtag))
				: [...me.mutedWords, toHashtagMute(hashtag)];

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
