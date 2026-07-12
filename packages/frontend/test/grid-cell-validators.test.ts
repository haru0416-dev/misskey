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

	test('stops searching after finding a duplicate value', () => {
		const validator = validators.unique();
		let trailingValueRead = false;
		const column = { setting: { bindTo: 'name' } };
		const row = { index: 0 };
		const allCells = [
			{ column, row: { index: 1 }, value: 'duplicate' },
			{
				column,
				row: { index: 2 },
				get value() {
					trailingValueRead = true;
					return 'other';
				},
			},
		] as Parameters<typeof validator.validate>[0]['allCells'];

		expect(
			validator.validate({ column, row, value: 'duplicate', allCells } as Parameters<typeof validator.validate>[0])
				.valid,
		).toBe(false);
		expect(trailingValueRead).toBe(false);
	});
});
