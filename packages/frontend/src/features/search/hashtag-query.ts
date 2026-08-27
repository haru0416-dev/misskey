/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 入力欄の文字列を `notes/search-by-tag` の AND 条件 1 組に変換する。
 * 先頭の `#` は付けても付けなくてもよく、サーバー側はタグを `#` 無しで持っている。
 * 条件が 1 つも取れない場合は null (検索させない)。
 */
export function parseHashtagQuery(input: string): string[] | null {
	const tags = input
		.split(/[\s　]+/)
		.map((tag) => tag.replace(/^#+/, '').trim())
		.filter((tag) => tag !== '');

	return tags.length === 0 ? null : tags;
}
