/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { genUuidv7, parseUuidv7, parseUuidv7Full, uuidv7RegExp } from '@/misc/id/uuidv7.js';

describe('misc:id', () => {
	test('uuidv7', () => {
		const date = Date.now();
		const gotUuidv7 = genUuidv7(date);
		expect(gotUuidv7).toMatch(uuidv7RegExp);
		expect(parseUuidv7(gotUuidv7).date.getTime()).toBe(date);
		// version nibble と variant bits
		expect(gotUuidv7[12]).toBe('7');
		expect('89ab').toContain(gotUuidv7[16]);
	});

	test('uuidv7 (過去時刻の明示指定)', () => {
		const date = new Date('2020-01-23T04:56:07.890Z').getTime();
		const gotUuidv7 = genUuidv7(date);
		expect(gotUuidv7).toMatch(uuidv7RegExp);
		expect(parseUuidv7(gotUuidv7).date.getTime()).toBe(date);
	});

	test('uuidv7 (同一ミリ秒内の単調性)', () => {
		const date = Date.now();
		const ids = Array.from({ length: 100 }, () => genUuidv7(date));
		expect([...ids].sort()).toEqual(ids);
		expect(new Set(ids).size).toBe(ids.length);
		// parseFull の additional も順序を保存する
		const additionals = ids.map(id => parseUuidv7Full(id).additional);
		for (let i = 1; i < additionals.length; i++) {
			const current = additionals[i];
			const previous = additionals[i - 1];
			if (current == null || previous == null) throw new Error('Missing UUIDv7 sequence value');
			expect(current > previous).toBe(true);
		}
	});
});
