/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const regexpPattern = /^\/(.+)\/(.*)$/;

/**
 * 管理者が設定した禁止ワード・センシティブワードに `text` が該当するか。
 *
 * 要素間は OR、空白で区切った語は AND。`/pattern/flags` 形式の要素は正規表現として扱い、
 * 不正なパターンは該当なしとして扱い、設定不備で投稿やサインアップを止めない。
 *
 * パターンは管理者しか書けない一方、突き合わせる text は相手が自由に選べるので、
 * 破滅的バックトラックを起こすパターンを置くと未認証の入力からサーバーを止められる。
 */
export function isKeywordIncluded(text: string, keywords: string[]): boolean {
	if (keywords.length === 0 || text === '') return false;

	return keywords.some((filter) => {
		const regexp = filter.match(regexpPattern);
		if (regexp == null) {
			return filter.split(' ').every((keyword) => text.includes(keyword));
		}

		try {
			const [, pattern, flags] = regexp;
			if (pattern == null || flags == null) return false;
			return new RegExp(pattern, flags).test(text);
		} catch {
			return false;
		}
	});
}
