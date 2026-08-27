/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 入力欄の文字列を `notes/search-by-tag` の AND 条件 1 組に変換する。
 * 先頭の `#` は付けても付けなくてもよく、サーバー側はタグを `#` 無しで持っている。
 * 条件が 1 つも取れない場合は null (検索させない)。
 *
 * サーバーはタグを NFKC + 小文字で同一視するので、こちらも先に NFKC へ寄せる。
 * IME で入力される全角の `＃` や英数字がそのままだと一致しない。
 */
export function parseHashtagQuery(input: string): string[] | null {
	const tags = input
		.normalize('NFKC')
		.split(/[\s　]+/)
		.map((tag) => tag.replace(/^#+/, '').trim())
		.filter((tag) => tag !== '');

	return tags.length === 0 ? null : tags;
}
