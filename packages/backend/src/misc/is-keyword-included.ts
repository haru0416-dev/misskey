/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { RE2JS } from 're2js';

const regexpPattern = /^\/(.+)\/(.*)$/;

/**
 * `/pattern/flags` 形式の設定ごとに、コンパイル済みの正規表現を使い回す (扱えないものは null)。
 * 設定は管理者が変える少数の文字列なので、上限を超えたら作り直す程度で足りる。
 */
const compiled = new Map<string, RE2JS | null>();
const MAX_COMPILED = 1000;

/**
 * 突き合わせる text は相手が自由に選べるので、線形時間の RE2 で照合する。JS の RegExp では
 * `(a+)+$` のような設定で a が 2 個増えるごとに約 4 倍 (24 個で 174 ms) になり、未認証の入力からサーバーを
 * 止められた。フラグは照合に効く i・m・s だけを対応させ、g・y・u は照合結果に影響しないので無視する。
 */
function compileRegexp(pattern: string, flags: string): RE2JS | null {
	let options = 0;
	for (const flag of flags) {
		if (flag === 'i') options |= RE2JS.CASE_INSENSITIVE;
		else if (flag === 'm') options |= RE2JS.MULTILINE;
		else if (flag === 's') options |= RE2JS.DOTALL;
		else if (flag !== 'g' && flag !== 'y' && flag !== 'u') return null;
	}
	try {
		return RE2JS.compile(pattern, options);
	} catch {
		// 後方参照・先読みなど RE2 に無い構文。
		return null;
	}
}

function compileFilter(filter: string, pattern: string, flags: string): RE2JS | null {
	const cached = compiled.get(filter);
	if (cached !== undefined) return cached;
	const regexp = compileRegexp(pattern, flags);
	if (compiled.size >= MAX_COMPILED) compiled.clear();
	compiled.set(filter, regexp);
	return regexp;
}

/** 設定として受け付けられるか。`/pattern/flags` 形式は RE2 で扱えるものに限る。 */
export function isSupportedKeywordFilter(filter: string): boolean {
	const regexp = filter.match(regexpPattern);
	if (regexp == null) return true;
	const [, pattern, flags] = regexp;
	return pattern != null && flags != null && compileRegexp(pattern, flags) != null;
}

/**
 * 管理者が設定した禁止ワード・センシティブワードに `text` が該当するか。
 *
 * 要素間は OR、空白で区切った語は AND。`/pattern/flags` 形式の要素は正規表現として扱い、
 * 扱えないパターンは該当なしとして扱い、設定不備で投稿やサインアップを止めない。
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
		return compiledRegexp != null && compiledRegexp.test(text);
	});
}
