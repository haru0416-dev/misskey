/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { isKeywordIncluded, isSupportedKeywordFilter } from '@/misc/is-keyword-included.js';
import { adminUpdateMetaParamDef } from '@/server/rest/admin/admin-update-meta-logic.js';

describe('isKeywordIncluded', () => {
	test('リストの要素は OR、空白区切りの語は AND', () => {
		expect(isKeywordIncluded('https://example.com/articles/1', ['example.com missing', 'example.com articles'])).toBe(
			true,
		);
		expect(isKeywordIncluded('https://example.com/articles/1', ['example.com missing'])).toBe(false);
	});

	test('/pattern/flags 形式は正規表現として扱う', () => {
		expect(isKeywordIncluded('https://example.com/articles/1', ['/example\\.com\\/articles/i'])).toBe(true);
	});

	test('スラッシュ 2 個だけの `//` は正規表現ではなくリテラルの語として扱う', () => {
		// /pattern/flags 形式はスラッシュの間に 1 文字以上を要求する。
		expect(isKeywordIncluded('a//b', ['//'])).toBe(true);
		expect(isKeywordIncluded('ab', ['//'])).toBe(false);
	});

	test('キーワードが空、または text が空なら常に false', () => {
		expect(isKeywordIncluded('anything', [])).toBe(false);
		expect(isKeywordIncluded('', ['anything'])).toBe(false);
	});

	describe('property', () => {
		const brokenPattern = fc.constantFrom('/[/', '/a{2,1}/', '/(/', '/\\/', '/*/', '/(?<)/');
		const text = fc.array(fc.constantFrom(...'abcdefあいう /'), { maxLength: 40 }).map((chars) => chars.join(''));

		test('壊れたパターンは例外にせず該当なしとして扱う', () => {
			fc.assert(
				fc.property(text, brokenPattern, (input, pattern) => {
					expect(isKeywordIncluded(input, [pattern])).toBe(false);
				}),
				{ numRuns: 200 },
			);
		});

		// 正規表現の特殊文字を混ぜ、/pattern/flags 形式でない語をリテラルとして照合しているかを text.includes と
		// 突き合わせる。語は半分の確率で text の部分文字列から取り、該当する場合も十分に通す。
		const specialChars = [...'.*+?^$|()[]{}\\/-'];
		const haystack = fc
			.array(fc.constantFrom(...'abあ', ...specialChars), { minLength: 1, maxLength: 30 })
			.map((chars) => chars.join(''));
		const haystackAndNeedle = haystack.chain((input) =>
			fc.tuple(
				fc.constant(input),
				fc.oneof(
					fc
						.tuple(fc.nat({ max: input.length - 1 }), fc.integer({ min: 1, max: 5 }))
						.map(([start, length]) => input.slice(start, start + length)),
					fc
						.array(fc.constantFrom(...'abあ', ...specialChars), { minLength: 1, maxLength: 5 })
						.map((chars) => chars.join('')),
				),
			),
		);

		test('特殊文字を含む語はリテラルとして照合する', () => {
			let matched = 0;
			let checked = 0;
			fc.assert(
				fc.property(haystackAndNeedle, ([input, needle]) => {
					// /pattern/flags 形式に見える語は正規表現として扱われるので、この性質の対象外。
					if (/^\/(.+)\/(.*)$/.test(needle)) return;
					checked++;
					const expected = input.includes(needle);
					if (expected) matched++;
					expect(isKeywordIncluded(input, [needle])).toBe(expected);
				}),
				{ numRuns: 1000 },
			);
			// 早期 return と非該当ばかりで素通りしていないこと。
			expect(checked).toBeGreaterThan(800);
			expect(matched).toBeGreaterThan(300);
		});
	});

	test('g フラグ付きの正規表現も、繰り返し呼んで結果が変わらない', () => {
		for (let i = 0; i < 3; i++) {
			expect(isKeywordIncluded('spam here', ['/spam/g'])).toBe(true);
		}
		expect(isKeywordIncluded('clean', ['/spam/g'])).toBe(false);
	});

	test('破滅的なバックトラックを起こすパターンも入力長に比例する時間で照合する', () => {
		// JS の RegExp では a が 2 個増えるごとに所要時間が約 4 倍になるパターン。
		const started = performance.now();
		expect(isKeywordIncluded(`${'a'.repeat(4096)}b`, ['/(a+)+$/'])).toBe(false);
		expect(performance.now() - started).toBeLessThan(100);
	});

	test('i・m・s フラグを照合に反映する', () => {
		expect(isKeywordIncluded('SPAM', ['/spam/i'])).toBe(true);
		expect(isKeywordIncluded('SPAM', ['/spam/'])).toBe(false);
		expect(isKeywordIncluded('a\nspam', ['/^spam/m'])).toBe(true);
		expect(isKeywordIncluded('a\nspam', ['/^spam/'])).toBe(false);
		expect(isKeywordIncluded('a\nb', ['/a.b/s'])).toBe(true);
		expect(isKeywordIncluded('a\nb', ['/a.b/'])).toBe(false);
	});

	test('RE2 で扱えない正規表現は設定として受け付けない', () => {
		expect(isSupportedKeywordFilter('plain words')).toBe(true);
		expect(isSupportedKeywordFilter('/spam\\d+/i')).toBe(true);
		for (const filter of ['/(a)\\1/', '/foo(?=bar)/', '/x/v']) {
			expect(isSupportedKeywordFilter(filter), filter).toBe(false);
		}
		expect(adminUpdateMetaParamDef.safeParse({ prohibitedWords: ['/(a)\\1/'] }).success).toBe(false);
		expect(adminUpdateMetaParamDef.safeParse({ prohibitedWords: ['/spam/i', 'ng word'] }).success).toBe(true);
	});
});
