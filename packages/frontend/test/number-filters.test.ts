/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import bytes from '@/filters/bytes.js';
import kmg from '@/filters/kmg.js';

describe('number filters', () => {
	test('formats binary byte units', () => {
		expect(bytes(0)).toBe('0');
		expect(bytes(1536, 1)).toBe('1.5KB');
		expect(bytes(-1024)).toBe('-1KB');
	});

	test('formats decimal compact units', () => {
		expect(kmg(0)).toBe('0');
		expect(kmg(1500, 1)).toBe('1.5K');
		expect(kmg(-1_000_000)).toBe('-1M');
	});
});
