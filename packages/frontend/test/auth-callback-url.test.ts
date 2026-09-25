/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { setAuthCallbackUrlParameter } from '@/pages/auth/callback-url.js';

describe('setAuthCallbackUrlParameter', () => {
	test('preserves existing query parameters and fragment', () => {
		expect(setAuthCallbackUrlParameter('https://example.com/callback?foo=bar#result', 'session', 'a b')).toBe(
			'https://example.com/callback?foo=bar&session=a+b#result',
		);
	});

	test('replaces an existing parameter of the same name', () => {
		expect(setAuthCallbackUrlParameter('https://example.com/callback?session=old', 'session', 'new')).toBe(
			'https://example.com/callback?session=new',
		);
	});

	test('rejects unsafe protocols', () => {
		for (const url of ['javascript:alert(1)', 'ftp://example.com/callback', 'intent://callback']) {
			expect(() => setAuthCallbackUrlParameter(url, 'session', 'session')).toThrow('invalid url');
		}
	});

	test('supports native app callback schemes', () => {
		expect(setAuthCallbackUrlParameter('misskey://callback?foo=bar', 'session', 'a b')).toBe(
			'misskey://callback?foo=bar&session=a+b',
		);
	});
});
