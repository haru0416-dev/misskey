/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { isSameOrigin, tryParseUrl } from '@shared/utility/url.js';

describe('tryParseUrl', () => {
	test('絶対URLをそのまま解釈する', () => {
		expect(tryParseUrl('https://example.com/path')?.href).toBe('https://example.com/path');
	});

	test('相対URLはbaseから解決する', () => {
		expect(tryParseUrl('/path', 'https://example.com/base')?.href).toBe('https://example.com/path');
	});

	test('解釈できない文字列はnullを返す', () => {
		expect(tryParseUrl('https://[invalid')).toBeNull();
	});
});

describe('isSameOrigin', () => {
	test('compares parsed origins instead of string prefixes', () => {
		expect(isSameOrigin('https://example.com/notes/1', 'https://example.com')).toBe(true);
		expect(isSameOrigin('https://example.com.evil/notes/1', 'https://example.com')).toBe(false);
		expect(isSameOrigin('https://example.com:8443/notes/1', 'https://example.com')).toBe(false);
	});
});
