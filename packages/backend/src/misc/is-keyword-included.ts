/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const regexpPattern = /^\/(.+)\/(.*)$/;

/**
 * `/pattern/flags` 形式の設定ごとに、コンパイル済みの正規表現を使い回す (不正なものは null)。
 * 設定は管理者が変える少数の文字列なので、上限を超えたら作り直す程度で足りる。
 */
const compiled = new Map<string, RegExp | null>();
const MAX_COMPILED = 1000;

function compileFilter(filter: string, pattern: string, flags: string): RegExp | null {
	const cached = compiled.get(filter);
	if (cached !== undefined) return cached;
	let regexp: RegExp | null;
	try {
		regexp = new RegExp(pattern, flags);
	} catch {
		regexp = null;
	}
	if (compiled.size >= MAX_COMPILED) compiled.clear();
	compiled.set(filter, regexp);
	return regexp;
}

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
	if (keywords.length === 0 || text === '') {
		return false;
	}

	return keywords.some((filter) => {
		const regexp = filter.match(regexpPattern);
		if (regexp == null) {
			return filter.split(' ').every((keyword) => text.includes(keyword));
		}

		const [, pattern, flags] = regexp;
		if (pattern == null || flags == null) {
			return false;
		}
		const compiledRegexp = compileFilter(filter, pattern, flags);
		if (compiledRegexp == null) {
			return false;
		}
		// g・y フラグ付きは lastIndex が呼び出しをまたいで残るので、毎回先頭から照合する。
		compiledRegexp.lastIndex = 0;
		return compiledRegexp.test(text);
	});
}
