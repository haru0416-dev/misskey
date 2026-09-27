/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { formatDateTimeString, formatTimeString } from '@/utility/format-time-string.js';

// 置換を順に重ねると、挿入した月名 (March の M・h、September の m、August の s) が後の字句として再処理される。
describe('formatTimeString', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function inEnglish() {
		vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US');
	}

	test.each([
		[new Date(2026, 2, 5, 9, 7, 8), 'March'],
		[new Date(2026, 7, 5, 9, 7, 8), 'August'],
		[new Date(2026, 8, 5, 9, 7, 8), 'September'],
	])('inserts the long month name without reprocessing it (%s)', (date, month) => {
		inEnglish();
		expect(formatTimeString(date, 'MMMM d, yyyy HH:mm:ss')).toBe(`${month} 5, 2026 09:07:08`);
		expect(formatDateTimeString(date, 'MMMM')).toBe(month);
	});

	test('keeps the numeric tokens', () => {
		const date = new Date(2026, 0, 2, 15, 4, 5);
		expect(formatTimeString(date, 'yyyy-MM-dd HH:mm:ss')).toBe('2026-01-02 15:04:05');
		expect(formatTimeString(date, 'yy/M/d h:m:s tt')).toBe('26/1/2 3:4:5 PM');
	});
});
