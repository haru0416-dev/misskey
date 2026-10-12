/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { retentionDayNumber, retentionSignupDate, retentionValuesByDay } from '@/features/chart/retention.js';

describe('retention date keys', () => {
	test('counts days after the aggregation date across month and year boundaries', () => {
		const values = retentionValuesByDay({
			dateKey: '2026-12-30',
			data: { '2026-12-31': 5, '2027-1-1': 4, '2027-1-9': 2 },
		});
		expect([...values].toSorted(([a], [b]) => a - b)).toEqual([
			[1, 5],
			[2, 4],
			[10, 2],
		]);
	});

	test('orders unpadded keys by date, not by string', () => {
		const ninth = retentionDayNumber('2026-9-30');
		const tenth = retentionDayNumber('2026-10-1');
		expect(ninth).not.toBeNull();
		expect(tenth! - ninth!).toBe(1);
	});

	test('skips keys that are not dates', () => {
		expect(retentionValuesByDay({ dateKey: '2026-10-1', data: { foo: 1, '2026-10-2': 3 } })).toEqual(new Map([[1, 3]]));
		expect(retentionValuesByDay({ dateKey: 'bar', data: { '2026-10-2': 3 } }).size).toBe(0);
	});

	test('labels the signup date as the day before the aggregation date in every time zone', () => {
		const options = { year: 'numeric', month: 'numeric', day: 'numeric' } as const;
		const expected = new Date(Date.UTC(2026, 8, 30)).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
		expect(retentionSignupDate('2026-10-1', options)).toBe(expected);
		expect(retentionSignupDate('nope', options)).toBeNull();
	});
});
