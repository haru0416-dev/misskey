/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import {
	highlightCode,
	highlightCodeIfLoaded,
	renderPlainCode,
	resolveCodeLanguage,
	tokenizeCodeLines,
} from '@/features/code/code-highlighter.js';

const typesOf = async (code: string, language: string | undefined) =>
	((await tokenizeCodeLines(code, language)) ?? []).flat().filter((token) => token.content.trim() !== '');

const decode = (html: string) =>
	html
		.replaceAll(/<\/?span[^>]*>/g, '')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&#039;', "'")
		.replaceAll('&amp;', '&');

describe('resolveCodeLanguage', () => {
	test.each([
		['js', 'javascript'],
		['JS', 'javascript'],
		['sh', 'shell'],
		['bash', 'shell'],
		['yml', 'yaml'],
		['py', 'python'],
		['json5', 'json'],
		['is', 'aiscript'],
		['ais', 'aiscript'],
		['aiscript', 'aiscript'],
		['tks', 'aiscript'],
		['toneriko-script', 'aiscript'],
	])('%s は %s になる', (alias, id) => {
		expect(resolveCodeLanguage(alias)).toBe(id);
	});

	test('知らない言語・未指定・plaintext は色を付けない', () => {
		expect(resolveCodeLanguage('haskell')).toBeNull();
		expect(resolveCodeLanguage(undefined)).toBeNull();
		expect(resolveCodeLanguage('plaintext')).toBeNull();
	});
});

describe('highlightCode', () => {
	test.each(['html', 'javascript', 'haskell', 'is'])('%s でもコードの文字をエスケープする', async (language) => {
		const code = '<img src=x onerror="alert(1)">\n<script>alert(1)</script> & \'q\'';
		const html = await highlightCode(code, language);
		expect(html.replaceAll(/<\/?span[^>]*>/g, '')).not.toMatch(/[<>"]/);
		expect(decode(html)).toBe(code);
	});

	test('行ごとに sh__line で包み、改行で区切る', async () => {
		const html = await highlightCode('let a = 1\nlet b = 2', 'is');
		expect(html.split('\n')).toHaveLength(2);
		expect(html.split('\n').every((line) => line.startsWith('<span class="sh__line">'))).toBe(true);
	});

	test('色は種類ごとの CSS 変数で付ける', async () => {
		const html = await highlightCode('let a = "x"', 'is');
		expect(html).toContain('style="color: var(--sh-keyword)"');
		expect(html).toContain('style="color: var(--sh-string)"');
	});

	test('差分の追加・削除・範囲の行に印を付け、ほかの行には付けない', async () => {
		const html = await highlightCode('--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new', 'diff');
		const lines = html.split('\n');
		expect(lines[0]).toContain('data-annotations="diff-meta"');
		expect(lines[2]).toContain('data-annotations="diff-hunk"');
		expect(lines[3]).toContain('data-annotations="diff-remove"');
		expect(lines[4]).toContain('data-annotations="diff-add"');
		expect(await highlightCode('let a = 1', 'is')).not.toContain('data-annotations');
	});

	test('CRLF の改行を 1 つの改行として表示する', async () => {
		const html = await highlightCode('let a = 1\r\nlet b = 2\rlet c = 3', 'is');
		expect(html).not.toContain('\r');
		expect(html.split('\n')).toHaveLength(3);
	});
});

describe('highlightCodeIfLoaded', () => {
	test('読み込む前は null、読み込み後は同期で色を付け、色を付けない言語は色なしで返す', async () => {
		// ほかのテストが読み込まない言語を使う
		expect(highlightCodeIfLoaded('local x = 1', 'lua')).toBeNull();
		await highlightCode('local x = 1', 'lua');
		const html = highlightCodeIfLoaded('local x = 1', 'lua');
		expect(html).toContain('style="color: var(--sh-keyword)"');
		expect(highlightCodeIfLoaded('<b>', 'haskell')).toBe(renderPlainCode('<b>'));
	});
});

describe('renderPlainCode', () => {
	test('色を付けずにエスケープし、行を sh__line で包む', () => {
		const html = renderPlainCode('<b>\r\n&');
		expect(html).toBe('<span class="sh__line">&lt;b&gt;</span>\n<span class="sh__line">&amp;</span>');
	});
});

describe('tokenizeCodeLines', () => {
	test('トークンをつなぐと元の行に戻り、色は種類の CSS 変数になる', async () => {
		const code = 'const a = "x"; // c\n\nfunction f() { return a }';
		const lines = (await tokenizeCodeLines(code, 'javascript')) ?? [];
		expect(lines.map((line) => line.map((token) => token.content).join(''))).toEqual(code.split('\n'));
		expect(lines.flat().every((token) => token.color === `var(--sh-${token.type})`)).toBe(true);
	});

	test('JSON5 のキーは引用符の有無によらずプロパティの色にする', async () => {
		const tokens = await typesOf('{ name: \'a\', "quoted": .5e3 }', 'json5');
		expect(tokens.filter((token) => token.type === 'property').map((token) => token.content)).toEqual([
			'name',
			'"quoted"',
		]);
		expect(tokens.find((token) => token.content === '.5e3')?.type).toBe('class');
	});

	test('YAML のキーと引用符のない値を見分け、URL を 1 つの文字列にする', async () => {
		const tokens = await typesOf('url: https://example.com/#top\nport: 3000\nenabled: true', 'yml');
		expect(tokens.filter((token) => token.type === 'property').map((token) => token.content)).toEqual([
			'url',
			'port',
			'enabled',
		]);
		expect(tokens.find((token) => token.content === 'https://example.com/#top')?.type).toBe('string');
		expect(tokens.find((token) => token.content === '3000')?.type).toBe('class');
		expect(tokens.find((token) => token.content === 'true')?.type).toBe('keyword');
	});

	test('色を付けない言語では null', async () => {
		expect(await tokenizeCodeLines('main :: IO ()', 'haskell')).toBeNull();
	});

	test('AiScript のコメント・キーワード・文字列を見分ける', async () => {
		const tokens = await typesOf('// メモ\nlet x = "s"\nif (x == "s") { <: x }', 'is');
		expect(tokens.find((token) => token.content.includes('メモ'))?.type).toBe('comment');
		expect(tokens.filter((token) => token.type === 'keyword').map((token) => token.content)).toEqual(['let', 'if']);
		expect(
			tokens
				.filter((token) => token.type === 'string')
				.map((token) => token.content)
				.join(''),
		).toContain('s');
	});

	test('AiScript のテンプレート文字列は、埋め込みを含めて 1 つの文字列にする', async () => {
		const tokens = await typesOf('<: `{name}: {n}`', 'is');
		expect(tokens.find((token) => token.type === 'string')?.content).toBe('`{name}: {n}`');
	});

	test('HTML のコメントは、中の語を属性名にせずコメントとして扱う', async () => {
		const tokens = await typesOf('<body>\n  <!-- 本文 -->\n</body>', 'html');
		expect(tokens.find((token) => token.content.includes('本文'))?.type).toBe('comment');
	});
});
