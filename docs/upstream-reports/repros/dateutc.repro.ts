/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// REPRO: dateUTC が Unix epoch ちょうど (Date.UTC(1970,0)===0) で誤って例外を投げる。
// upstream develop の misc/prelude/time.ts (`if (!d) throw`) を実ソースで再現。
process.env.NODE_ENV = 'test';

import { describe, expect, test } from 'vitest';
import { dateUTC } from '@/misc/prelude/time.js';

describe('REPRO upstream #2 dateUTC epoch-0', () => {
	test('Unix epoch (Date.UTC(1970,0) === 0) で例外を投げないこと', () => {
		// dateUTC([1970, 0]) → d = Date.UTC(1970, 0) = 0 → `if (!d)` が true → 誤って throw
		expect(() => dateUTC([1970, 0])).not.toThrow();
		expect(dateUTC([1970, 0]).getTime()).toBe(0);
	});
});
