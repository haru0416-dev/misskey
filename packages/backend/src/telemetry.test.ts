/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { shouldPropagateTraceContext } from '@/telemetry.js';

describe('shouldPropagateTraceContext', () => {
	test('denies external targets by default', () => {
		expect(shouldPropagateTraceContext('https://external.example/path', [])).toBe(false);
	});

	test('allows configured URL prefixes only on the same origin', () => {
		const targets = ['https://api.example/v1/'];
		expect(shouldPropagateTraceContext('https://api.example/v1/users', targets)).toBe(true);
		expect(shouldPropagateTraceContext('https://api.example/v2/users', targets)).toBe(false);
	});

	test('treats an origin target as an exact origin boundary', () => {
		const targets = ['https://api.example'];
		expect(shouldPropagateTraceContext('https://api.example/notes', targets)).toBe(true);
		expect(shouldPropagateTraceContext('https://api.example.evil/notes', targets)).toBe(false);
	});
});
