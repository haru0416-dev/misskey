/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { formatDateTimeForFileName, formatTime } from '@/misc/format-date-time.js';

describe('format-date-time', () => {
	const date = new Date(2001, 1, 3, 4, 5, 6);

	test('formats a local time', () => {
		expect(formatTime(date)).toBe('04:05:06');
	});

	test('formats a local date and time for file names', () => {
		expect(formatDateTimeForFileName(date)).toBe('2001-02-03-04-05-06');
	});
});
