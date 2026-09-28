/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { toDatetimeLocalValue } from '@/utility/datetime-local.js';

// 夏時間のあるタイムゾーンで、冬と夏の日時がどちらも入力欄の値から元の時刻へ戻ることを見る。
// 今日の時差を全日時に使う変換だと、今日と逆の季節の日時が 1 時間ずれる。
describe('toDatetimeLocalValue', () => {
	const originalTz = process.env['TZ'];

	beforeAll(() => {
		process.env['TZ'] = 'America/New_York';
	});

	afterAll(() => {
		// 未設定だったときに undefined を代入すると、文字列 'undefined' が入る。
		if (originalTz == null) {
			delete process.env['TZ'];
		} else {
			process.env['TZ'] = originalTz;
		}
	});

	test('冬 (UTC-5) と夏 (UTC-4) の日時をその日の時差で手元の時刻にする', () => {
		expect(new Date('2026-01-15T12:00:00Z').getTimezoneOffset()).toBe(300);
		expect(toDatetimeLocalValue(Date.parse('2026-01-15T12:00:00Z'))).toBe('2026-01-15T07:00');
		expect(toDatetimeLocalValue(Date.parse('2026-07-15T12:00:00Z'))).toBe('2026-07-15T08:00');
	});

	test('入力欄の値を new Date() で読むと、分単位で元の時刻に戻る', () => {
		for (const iso of [
			'2026-01-15T12:34:00Z',
			'2026-03-08T06:59:00Z',
			'2026-03-08T07:00:00Z',
			'2026-07-15T12:34:00Z',
		]) {
			const time = Date.parse(iso);
			expect(new Date(toDatetimeLocalValue(time)).getTime(), iso).toBe(time);
		}
	});

	test('API の ISO 文字列と Date も受け付ける', () => {
		expect(toDatetimeLocalValue('2026-07-15T12:00:00.000Z')).toBe('2026-07-15T08:00');
		expect(toDatetimeLocalValue(new Date('2026-07-15T12:00:00.000Z'))).toBe('2026-07-15T08:00');
	});
});
