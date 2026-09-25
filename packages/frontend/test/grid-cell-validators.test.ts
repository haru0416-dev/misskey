/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { validators } from '@/components/grid/cell-validators.js';

describe('grid cell validators', () => {
	test('resets stateful regular expressions between validations', () => {
		const validator = validators.regex(/^a$/g);
		const params = { value: 'a' } as Parameters<typeof validator.validate>[0];

		expect(validator.validate(params).valid).toBe(true);
		expect(validator.validate(params).valid).toBe(true);
	});

	type Params = Parameters<ReturnType<typeof validators.unique>['validate']>[0];
	const name = { setting: { bindTo: 'name' } };
	const other = { setting: { bindTo: 'other' } };
	const cell = (column: typeof name, index: number, value: string) => ({ column, row: { index }, value });

	test('unique は別の行の同じ列の同じ値だけを重複とする', () => {
		const validator = validators.unique();
		const allCells = [
			cell(name, 0, 'a'),
			cell(name, 1, 'b'),
			cell(other, 2, 'c'),
			cell(name, 3, 'b'),
		] as Params['allCells'];
		const check = (column: typeof name, index: number, value: string) =>
			validator.validate({ column, row: { index }, value, allCells } as Params).valid;

		expect(check(name, 0, 'a')).toBe(true);
		expect(check(name, 1, 'b')).toBe(false);
		expect(check(name, 3, 'b')).toBe(false);
		expect(check(name, 0, 'c')).toBe(true);
		expect(check(name, 0, 'b')).toBe(false);
		expect(check(name, 1, 'a')).toBe(false);
	});

	// セルごとに全セルを走査すると、3,000 行 8 列の検証 1 回に 370 ms かかる (実測)。
	test('unique の検証 1 回は行数に比例した時間で終わる', () => {
		const validator = validators.unique();
		const allCells = Array.from({ length: 20_000 }, (_, i) => cell(name, i, `v${i}`)) as Params['allCells'];
		const start = performance.now();
		for (const c of allCells) validator.validate({ column: c.column, row: c.row, value: c.value, allCells } as Params);
		expect(performance.now() - start).toBeLessThan(200);
	});
});
