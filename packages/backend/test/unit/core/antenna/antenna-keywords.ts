/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import {
	antennaKeywordMatrixSchema,
	compactAntennaKeywords,
	matchesAntennaKeywords,
} from '@/core/antenna/antenna-keywords.js';

describe('antenna keywords', () => {
	test('外側は OR、内側は AND で本文と照合する', () => {
		const matrix = [['cat', 'dog'], ['bird']];
		expect(matchesAntennaKeywords('a cat and a dog', matrix, false)).toBe(true);
		expect(matchesAntennaKeywords('only a cat', matrix, false)).toBe(false);
		expect(matchesAntennaKeywords('a bird', matrix, false)).toBe(true);
	});

	test('大文字小文字の区別は指定に従う', () => {
		expect(matchesAntennaKeywords('Hello World', [['hello']], false)).toBe(true);
		expect(matchesAntennaKeywords('hello world', [['HELLO']], false)).toBe(true);
		expect(matchesAntennaKeywords('Hello World', [['hello']], true)).toBe(false);
		expect(matchesAntennaKeywords('Hello World', [['Hello']], true)).toBe(true);
	});

	test('空の語と空のまとまりを除く', () => {
		expect(compactAntennaKeywords([['', 'a'], [''], []])).toStrictEqual([['a']]);
	});

	test('行列の大きさの上限', () => {
		const ok = Array.from({ length: 100 }, () => Array.from({ length: 10 }, () => 'x'.repeat(200)));
		expect(antennaKeywordMatrixSchema.safeParse(ok).success).toBe(true);
		expect(antennaKeywordMatrixSchema.safeParse([...ok, ['x']]).success).toBe(false);
		expect(antennaKeywordMatrixSchema.safeParse([Array.from({ length: 11 }, () => 'x')]).success).toBe(false);
		expect(antennaKeywordMatrixSchema.safeParse([['x'.repeat(201)]]).success).toBe(false);
	});
});
