/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { calculateBlurhashDimensions } from '@shared/utility/blurhash.js';

describe('calculateBlurhashDimensions', () => {
	test.each([
		[0, 64],
		[64, 0],
		[-1, 64],
		[Number.NaN, 64],
		[Number.POSITIVE_INFINITY, 64],
	])('uses safe square dimensions for invalid input %s x %s', (width, height) => {
		expect(calculateBlurhashDimensions(width, height)).toEqual({
			ratio: 1,
			canvasWidth: 64,
			canvasHeight: 64,
		});
	});

	test('bounds extreme aspect ratios', () => {
		expect(calculateBlurhashDimensions(16383, 1)).toMatchObject({ canvasWidth: 4096, canvasHeight: 64 });
		expect(calculateBlurhashDimensions(1, 16383)).toMatchObject({ canvasWidth: 64, canvasHeight: 4096 });
	});
});
