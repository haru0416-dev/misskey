/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { genUuidv7, parseUuidv7, parseUuidv7Full, uuidv7RegExp } from '@/misc/id/uuidv7.js';

/*
 * ID は全ページングのソートキーで、順序が崩れるとタイムラインが静かに壊れる。
 * 例で押さえられるのは代表値だけなので、生成した時刻で往復と単調性を確かめる。
 */
describe('uuidv7 (property)', () => {
	// Date が扱える範囲のうち、UUIDv7 のタイムスタンプ幅 (48bit ミリ秒) に収まる範囲。
	const timestamp = fc.integer({ min: 0, max: 2 ** 48 - 1 });

	test('生成した ID は書式を満たし、時刻を往復できる', () => {
		fc.assert(
			fc.property(timestamp, (date) => {
				const id = genUuidv7(date);
				expect(id).toMatch(uuidv7RegExp);
				expect(parseUuidv7(id).date.getTime()).toBe(date);
			}),
			{ numRuns: 1000 },
		);
	});

	test('時刻の順序が辞書順に保存される', () => {
		fc.assert(
			fc.property(timestamp, timestamp, (a, b) => {
				fc.pre(a !== b);
				const [older, newer] = a < b ? [a, b] : [b, a];
				expect(genUuidv7(older) < genUuidv7(newer)).toBe(true);
			}),
			{ numRuns: 1000 },
		);
	});

	test('同一ミリ秒内でも発行順に増加し、重複しない', () => {
		fc.assert(
			fc.property(timestamp, fc.integer({ min: 2, max: 64 }), (date, count) => {
				const ids = Array.from({ length: count }, () => genUuidv7(date));
				expect([...ids].sort()).toStrictEqual(ids);
				expect(new Set(ids).size).toBe(ids.length);

				const additionals = ids.map((id) => parseUuidv7Full(id).additional);
				for (let i = 1; i < additionals.length; i++) {
					const current = additionals[i];
					const previous = additionals[i - 1];
					if (current == null || previous == null) throw new Error('Missing UUIDv7 sequence value');
					expect(current > previous).toBe(true);
				}
			}),
			{ numRuns: 300 },
		);
	});
});
