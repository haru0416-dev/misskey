/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { parse, render } from 'sugar-high/core';
import { lang as normalizeLanguage, languages } from 'sugar-high/lang';
import { onCommentEnd, onCommentStart } from 'sugar-high/lang/c';
import type { ParseOptions, TokenType } from 'sugar-high/core';

// AiScript は sugar-high に無いので、キーワードと C 系のコメント (// と /* */) だけで定義する。
// テンプレート文字列 (`...{x}...`) は全体を文字列として色付けする。
const aiscript: ParseOptions = {
	keywords: new Set([
		'let',
		'var',
		'if',
		'elif',
		'else',
		'return',
		'each',
		'for',
		'loop',
		'break',
		'continue',
		'match',
		'case',
		'default',
		'eval',
		'exists',
		'do',
		'while',
		'null',
		'true',
		'false',
	]),
	onCommentStart,
	onCommentEnd,
	jsx: false,
	regex: false,
	templateStrings: true,
};

const plaintext = languages.find((language) => language.id === 'plaintext')?.config;

/** コードブロックの言語名 (別名・拡張子を含む) を、色付けの設定に解決する。知らない言語は色を付けない。 */
export function resolveCodeLanguage(name: string | undefined): ParseOptions | undefined {
	if (name == null) return plaintext;
	const lowered = name.toLowerCase();
	if (lowered === 'is' || lowered === 'ais' || lowered === 'aiscript') return aiscript;
	// JSON5 はコメント・引用符なしのキー・末尾のカンマを含む JavaScript の式の書き方なので、JavaScript として色付けする。
	const id = normalizeLanguage(lowered === 'json5' ? 'javascript' : lowered);
	return (id != null ? languages.find((language) => language.id === id)?.config : undefined) ?? plaintext;
}

/** 色付けした HTML を返す。行は `\n` で区切り、文字はすべてエスケープ済み。 */
export function highlightCode(code: string, language: string | undefined): string {
	// sugar-high は \n だけで行を分けるので、CRLF の \r が行末のトークンに残る。HTML として読むと
	// その \r も改行になり空行が増えるため、先に \n へそろえる。
	return render(parse(code.replaceAll(/\r\n?/g, '\n'), resolveCodeLanguage(language)));
}

export type CodeToken = { content: string; type: TokenType; color: string };

/** 行ごとのトークンを返す。色は `--sh-*` の CSS 変数で、テーマの codeBlock* から決まる。 */
export function tokenizeCodeLines(code: string, language: string | undefined): CodeToken[][] {
	return parse(code, resolveCodeLanguage(language)).lines.map((line) =>
		line.tokens.map(({ type, value }) => ({ content: value, type, color: `var(--sh-${type})` })),
	);
}
