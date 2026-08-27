/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { isKeywordIncluded } from '@/misc/is-keyword-included.js';

// 正規表現形式 (/…/) と誤認されず、空白 AND 区切りとも衝突しない語だけを作る。
const word = fc
	.array(fc.constantFrom(...'abcdefあいう'), { minLength: 1, maxLength: 6 })
	.map((chars) => chars.join(''));

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
		const keyword = fc.oneof(
			{ weight: 3, arbitrary: word },
			{ weight: 2, arbitrary: fc.tuple(word, word).map(([a, b]) => `${a} ${b}`) },
			{ weight: 2, arbitrary: word.map((w) => `/${w}/i`) },
			{ weight: 1, arbitrary: brokenPattern },
		);
		const text = fc.array(fc.constantFrom(...'abcdefあいう /'), { maxLength: 40 }).map((chars) => chars.join(''));

		test('リスト全体の判定は、要素を 1 つずつ判定した OR に一致する', () => {
			// 要素が互いに干渉しないこと。false になる組み合わせも通るよう、当たり外れ両方を数える。
			let hits = 0;
			let misses = 0;
			fc.assert(
				fc.property(text, fc.array(keyword, { minLength: 1, maxLength: 4 }), (input, keywords) => {
					const whole = isKeywordIncluded(input, keywords);
					const perElement = keywords.some((k) => isKeywordIncluded(input, [k]));
					expect(whole).toBe(perElement);
					if (whole) hits++;
					else misses++;
				}),
				{ numRuns: 500 },
			);
			// 常に false を返す実装でも通ってしまう空振りを防ぐ。
			expect(hits).toBeGreaterThan(20);
			expect(misses).toBeGreaterThan(20);
		});

		test('空白区切りは、全ての語を含むときだけ該当する', () => {
			let reached = 0;
			fc.assert(
				fc.property(text, fc.array(word, { minLength: 1, maxLength: 3 }), (input, words) => {
					if (input === '') return;
					reached++;
					const expected = words.every((w) => input.includes(w));
					expect(isKeywordIncluded(input, [words.join(' ')])).toBe(expected);
				}),
				{ numRuns: 500 },
			);
			expect(reached).toBeGreaterThan(400);
		});

		test('正規表現形式の判定は RegExp と一致する', () => {
			let matched = 0;
			fc.assert(
				fc.property(text, word, fc.constantFrom('', 'i', 'm', 's'), (input, pattern, flags) => {
					const expected = new RegExp(pattern, flags).test(input);
					expect(isKeywordIncluded(input, [`/${pattern}/${flags}`])).toBe(expected);
					if (expected) matched++;
				}),
				{ numRuns: 500 },
			);
			expect(matched).toBeGreaterThan(20);
		});

		test('壊れたパターンは例外にせず該当なしとして扱う', () => {
			fc.assert(
				fc.property(text, brokenPattern, (input, pattern) => {
					expect(isKeywordIncluded(input, [pattern])).toBe(false);
				}),
				{ numRuns: 200 },
			);
		});
	});
});
