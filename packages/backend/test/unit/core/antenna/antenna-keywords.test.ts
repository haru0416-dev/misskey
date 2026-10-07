/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import {
	antennaKeywordMatrixSchema,
	compactAntennaKeywords,
	compileAntennaKeywords,
	matchesCompiledAntennaKeywords,
} from '@/core/antenna/antenna-keywords.js';

describe('antenna keywords', () => {
	// 区別しない場合、本文は呼び出し側が小文字にして渡す。
	const matches = (text: string, matrix: string[][], caseSensitive: boolean) =>
		matchesCompiledAntennaKeywords(
			caseSensitive ? text : text.toLowerCase(),
			compileAntennaKeywords(matrix, caseSensitive),
		);

	test('外側は OR、内側は AND で本文と照合する', () => {
		const matrix = [['cat', 'dog'], ['bird']];
		expect(matches('a cat and a dog', matrix, false)).toBe(true);
		expect(matches('only a cat', matrix, false)).toBe(false);
		expect(matches('a bird', matrix, false)).toBe(true);
	});

	test('大文字小文字の区別は指定に従う', () => {
		expect(matches('Hello World', [['hello']], false)).toBe(true);
		expect(matches('hello world', [['HELLO']], false)).toBe(true);
		expect(matches('Hello World', [['hello']], true)).toBe(false);
		expect(matches('Hello World', [['Hello']], true)).toBe(true);
	});

	test('空の語と空のまとまりを除く', () => {
		expect(compactAntennaKeywords([['', 'a'], [''], []])).toStrictEqual([['a']]);
		expect(compileAntennaKeywords([['', 'A'], [''], []], false)).toStrictEqual([['a']]);
		expect(compileAntennaKeywords([['', 'A'], [''], []], true)).toStrictEqual([['A']]);
		// 空の語が残ると、どの本文にも含まれる扱いになる。
		expect(matches('anything', [['']], false)).toBe(false);
	});

	test('行列の大きさの上限', () => {
		const ok = Array.from({ length: 100 }, () => Array.from({ length: 10 }, () => 'x'.repeat(200)));
		expect(antennaKeywordMatrixSchema.safeParse(ok).success).toBe(true);
		expect(antennaKeywordMatrixSchema.safeParse([...ok, ['x']]).success).toBe(false);
		expect(antennaKeywordMatrixSchema.safeParse([Array.from({ length: 11 }, () => 'x')]).success).toBe(false);
		expect(antennaKeywordMatrixSchema.safeParse([['x'.repeat(201)]]).success).toBe(false);
	});
});
