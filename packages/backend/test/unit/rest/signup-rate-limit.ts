/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import type { MiMeta } from '@/models/Meta.js';
import { getSignupRateLimit } from '@/server/rest/routes/auth-account.js';

function meta(minIntervalSeconds: number, maxPerHour: number): MiMeta {
	return {
		signupRateLimitMinIntervalSeconds: minIntervalSeconds,
		signupRateLimitMaxPerHour: maxPerHour,
	} as MiMeta;
}

describe('getSignupRateLimit', () => {
	test('both zero disables the rate limit', () => {
		expect(getSignupRateLimit(meta(0, 0))).toBeNull();
	});

	test('can enable the minimum interval independently', () => {
		expect(getSignupRateLimit(meta(15, 0))).toEqual({
			minInterval: 15_000,
			duration: undefined,
			max: undefined,
		});
	});

	test('can enable the hourly maximum independently', () => {
		expect(getSignupRateLimit(meta(0, 20))).toEqual({
			minInterval: undefined,
			duration: 3_600_000,
			max: 20,
		});
	});
});
