/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { isKeywordIncluded } from '@/misc/is-keyword-included.js';

describe('isKeywordIncluded', () => {
	test('treats list entries as OR and space-separated words as AND', () => {
		expect(isKeywordIncluded('https://example.com/articles/1', ['example.com missing', 'example.com articles'])).toBe(
			true,
		);
		expect(isKeywordIncluded('https://example.com/articles/1', ['example.com missing'])).toBe(false);
	});

	test('supports regular expressions without accepting invalid or ReDoS-prone patterns', () => {
		expect(isKeywordIncluded('https://example.com/articles/1', ['/example\\.com\\/articles/i'])).toBe(true);
		expect(isKeywordIncluded('https://example.com/articles/1', ['/[/'])).toBe(false);
		expect(isKeywordIncluded(`${'a'.repeat(10_000)}!`, ['/^(a+)+$/'])).toBe(false);
	});

	/*
	 * この関数はサインアップ (未認証) の禁止ワード判定と URL プレビューのセンシティブ判定から
	 * 呼ばれる。パターンは管理者が設定するが、突き合わせる text は相手が自由に選べる。
	 * バックトラックする実装に差し替わると、管理者が置いた何気ないパターンで未認証の入力から
	 * サーバーを止められる。RE2 (線形時間) を通していることを、生成した入力で確かめる。
	 */
	describe('property', () => {
		// バックトラック実装なら組み合わせ爆発するパターン。RE2 なら入力長に比例した時間で終わる。
		const catastrophic = fc.constantFrom(
			'/^(a+)+$/',
			'/^(a|a)+$/',
			'/^(a*)*$/',
			'/^(a|aa)+$/',
			'/(x+x+)+y/',
			'/^(([a-z])+.)+[A-Z]([a-z])+$/',
		);
		// 構文として壊れているもの・RE2 が受け付けない構文も混ぜる (握り潰されて false になるはず)。
		const brokenPattern = fc.constantFrom('/[/', '//', '/(?<=a)b/', '/(?!a)b/', '/a{2,1}/', '/\\1(a)/', '/(?P<n>a)/');
		const keyword = fc.oneof(
			{ weight: 2, arbitrary: catastrophic },
			{ weight: 1, arbitrary: brokenPattern },
			{ weight: 2, arbitrary: fc.string({ maxLength: 20 }) },
		);
		// 上のパターンが食いつく形の長い入力。
		const text = fc.oneof(
			{ weight: 2, arbitrary: fc.integer({ min: 1_000, max: 20_000 }).map((n) => `${'a'.repeat(n)}!`) },
			{ weight: 1, arbitrary: fc.integer({ min: 1_000, max: 20_000 }).map((n) => `${'xy'.repeat(n)}z`) },
			{ weight: 1, arbitrary: fc.string({ maxLength: 200 }) },
		);

		test('敵対的なパターンと長い入力でも例外を投げず線形時間で返る', () => {
			let worst = 0;
			fc.assert(
				fc.property(text, fc.array(keyword, { minLength: 1, maxLength: 4 }), (input, keywords) => {
					const started = performance.now();
					// 戻り値は入力次第なので主張しない。ここで見るのは「返ること」と「かかる時間」。
					isKeywordIncluded(input, keywords);
					worst = Math.max(worst, performance.now() - started);
				}),
				{ numRuns: 200 },
			);

			// バックトラック実装ならここは秒どころではなくなる。RE2 なら 20,000 文字でもミリ秒台。
			expect(worst).toBeLessThan(1_000);
		});
	});
});
