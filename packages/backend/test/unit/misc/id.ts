/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ulid } from 'ulid';
import { describe, expect, test } from 'vitest';
import { aidRegExp, genAid, parseAid } from '@/misc/id/aid.js';
import { aidxRegExp, genAidx, parseAidx } from '@/misc/id/aidx.js';
import { genMeid, meidRegExp, parseMeid } from '@/misc/id/meid.js';
import { genMeidg, meidgRegExp, parseMeidg } from '@/misc/id/meidg.js';
import { genObjectId, objectIdRegExp, parseObjectId } from '@/misc/id/object-id.js';
import { parseUlid, ulidRegExp } from '@/misc/id/ulid.js';
import { genUuidv7, parseUuidv7, parseUuidv7Full, uuidv7RegExp } from '@/misc/id/uuidv7.js';

describe('misc:id', () => {
	test('aid', () => {
		const date = Date.now();
		const gotAid = genAid(date);
		expect(gotAid).toMatch(aidRegExp);
		expect(parseAid(gotAid).date.getTime()).toBe(date);
	});

	test('aidx', () => {
		const date = Date.now();
		const gotAidx = genAidx(date);
		expect(gotAidx).toMatch(aidxRegExp);
		expect(parseAidx(gotAidx).date.getTime()).toBe(date);
	});

	test('meid', () => {
		const date = Date.now();
		const gotMeid = genMeid(date);
		expect(gotMeid).toMatch(meidRegExp);
		expect(parseMeid(gotMeid).date.getTime()).toBe(date);
	});

	test('meidg', () => {
		const date = Date.now();
		const gotMeidg = genMeidg(date);
		expect(gotMeidg).toMatch(meidgRegExp);
		expect(parseMeidg(gotMeidg).date.getTime()).toBe(date);
	});

	test('objectid', () => {
		const date = Date.now();
		const gotObjectId = genObjectId(date);
		expect(gotObjectId).toMatch(objectIdRegExp);
		expect(Math.floor(parseObjectId(gotObjectId).date.getTime() / 1000)).toBe(Math.floor(date / 1000));
	});

	test('ulid', () => {
		const date = Date.now();
		const gotUlid = ulid(date);
		expect(gotUlid).toMatch(ulidRegExp);
		expect(parseUlid(gotUlid).date.getTime()).toBe(date);
	});

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
			expect(additionals[i] > additionals[i - 1]).toBe(true);
		}
	});
});
