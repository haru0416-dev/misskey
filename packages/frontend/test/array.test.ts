/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { countIf, difference, intersperse, maximum } from '@/utility/array.js';

describe('array utilities', () => {
	test('counts matching values without changing the source', () => {
		const values = [1, 2, 3, 4];
		expect(countIf(value => value % 2 === 0, values)).toBe(2);
		expect(values).toEqual([1, 2, 3, 4]);
	});

	test('intersperses values while preserving empty and singleton arrays', () => {
		expect(intersperse(',', [])).toEqual([]);
		expect(intersperse(',', ['a'])).toEqual(['a']);
		expect(intersperse(',', ['a', 'b', 'c'])).toEqual(['a', ',', 'b', ',', 'c']);
	});

	test('computes differences with SameValueZero semantics', () => {
		expect(difference([1, 2, Number.NaN, 3], [2, Number.NaN])).toEqual([1, 3]);
	});

	test('finds a maximum without spreading large arrays', () => {
		expect(maximum([])).toBe(-Infinity);
		expect(maximum(Array.from({ length: 200_000 }, (_, index) => index))).toBe(199_999);
	});
});
