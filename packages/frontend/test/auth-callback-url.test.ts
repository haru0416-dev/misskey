/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { createAuthCallbackUrl } from '@/pages/auth/callback-url.js';

describe('createAuthCallbackUrl', () => {
	test('preserves existing query parameters and fragment', () => {
		expect(createAuthCallbackUrl('https://example.com/callback?foo=bar#result', 'a b')).toBe(
			'https://example.com/callback?foo=bar&token=a+b#result',
		);
	});

	test('replaces an existing token parameter', () => {
		expect(createAuthCallbackUrl('https://example.com/callback?token=old', 'new')).toBe(
			'https://example.com/callback?token=new',
		);
	});

	test('rejects unsafe protocols', () => {
		for (const url of ['javascript:alert(1)', 'ftp://example.com/callback', 'intent://callback']) {
			expect(() => createAuthCallbackUrl(url, 'token')).toThrow('invalid url');
		}
	});

	test('supports native app callback schemes', () => {
		expect(createAuthCallbackUrl('misskey://callback', 'token')).toBe('misskey://callback?token=token');
	});
});
