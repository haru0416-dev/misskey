/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { highlightCode, resolveCodeLanguage, tokenizeCodeLines } from '@/features/code/code-highlighter.js';

const typesOf = (code: string, language: string | undefined) =>
	tokenizeCodeLines(code, language)
		.flat()
		.filter((token) => token.content.trim() !== '');

describe('resolveCodeLanguage', () => {
	test.each([
		['js', 'javascript'],
		['JS', 'javascript'],
		['sh', 'shell'],
		['bash', 'shell'],
		['yml', 'yaml'],
		['py', 'python'],
		['json5', 'javascript'],
	])('%s は %s と同じ設定になる', (alias, id) => {
		expect(resolveCodeLanguage(alias)).toBe(resolveCodeLanguage(id));
	});

	test('is・ais・aiscript は AiScript の設定になる', () => {
		expect(resolveCodeLanguage('is')).toBe(resolveCodeLanguage('aiscript'));
		expect(resolveCodeLanguage('ais')).toBe(resolveCodeLanguage('aiscript'));
		expect(resolveCodeLanguage('is')).not.toBe(resolveCodeLanguage('javascript'));
	});

	test('知らない言語と未指定は色を付けない', () => {
		expect(resolveCodeLanguage('haskell')).toBe(resolveCodeLanguage('plaintext'));
		expect(resolveCodeLanguage(undefined)).toBe(resolveCodeLanguage('plaintext'));
		expect(typesOf('main :: IO ()', 'haskell').every((token) => token.type === 'identifier')).toBe(true);
	});
});

describe('highlightCode', () => {
	test.each(['html', 'javascript', 'plaintext', 'is'])('%s でもコードの文字をエスケープする', (language) => {
		const code = '<img src=x onerror="alert(1)">\n<script>alert(1)</script> & \'q\'';
		const text = highlightCode(code, language).replaceAll(/<\/?span[^>]*>/g, '');
		expect(text).not.toMatch(/[<>"]/);
		const decoded = text
			.replaceAll('&lt;', '<')
			.replaceAll('&gt;', '>')
			.replaceAll('&quot;', '"')
			.replaceAll('&#039;', "'")
			.replaceAll('&amp;', '&');
		expect(decoded).toBe(code);
	});

	test('行ごとに sh__line で包み、改行で区切る', () => {
		const html = highlightCode('let a = 1\nlet b = 2', 'is');
		expect(html.split('\n')).toHaveLength(2);
		expect(html.split('\n').every((line) => line.startsWith('<span class="sh__line">'))).toBe(true);
	});
});

describe('tokenizeCodeLines', () => {
	test('トークンをつなぐと元の行に戻り、色は種類の CSS 変数になる', () => {
		const code = 'const a = "x"; // c\n\nfunction f() { return a }';
		const lines = tokenizeCodeLines(code, 'javascript');
		expect(lines.map((line) => line.map((token) => token.content).join(''))).toEqual(code.split('\n'));
		expect(lines.flat().every((token) => token.color === `var(--sh-${token.type})`)).toBe(true);
	});

	test('AiScript のコメント・キーワード・文字列を見分ける', () => {
		const tokens = typesOf('// メモ\nlet x = "s"\nif (x == "s") { <: x }', 'is');
		expect(tokens.find((token) => token.content.includes('メモ'))?.type).toBe('comment');
		expect(tokens.filter((token) => token.type === 'keyword').map((token) => token.content)).toEqual(['let', 'if']);
		expect(
			tokens
				.filter((token) => token.type === 'string')
				.map((token) => token.content)
				.join(''),
		).toContain('s');
	});

	test('AiScript のテンプレート文字列は、埋め込みを含めて 1 つの文字列にする', () => {
		const tokens = typesOf('<: `{name}: {n}`', 'is');
		expect(tokens.find((token) => token.type === 'string')?.content).toBe('`{name}: {n}`');
	});

	test('CRLF の改行を 1 つの改行として表示する', () => {
		const html = highlightCode('let a = 1\r\nlet b = 2\rlet c = 3', 'is');
		expect(html).not.toContain('\r');
		expect(html.split('\n')).toHaveLength(3);
	});

	test('HTML のコメントは、中の語を属性名にせずコメントとして扱う', () => {
		const tokens = typesOf('<body>\n  <!-- 本文 -->\n</body>', 'html');
		expect(tokens.find((token) => token.content.includes('本文'))?.type).toBe('comment');
	});
});
