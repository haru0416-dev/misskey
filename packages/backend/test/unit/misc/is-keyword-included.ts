/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { isKeywordIncluded } from '@/misc/is-keyword-included.js';

describe('isKeywordIncluded', () => {
	test('treats list entries as OR and space-separated words as AND', () => {
		expect(isKeywordIncluded('https://example.com/articles/1', ['example.com missing', 'example.com articles'])).toBe(
			true,
		);
		expect(isKeywordIncluded('https://example.com/articles/1', ['example.com missing'])).toBe(false);
	});

	test('supports regular expressions without accepting invalid or ReDoS-prone patterns', () => {
		expect(isKeywordIncluded('https://example.com/articles/1', ['/example\\.com\\/articles/i'])).toBe(true);
		expect(isKeywordIncluded('https://example.com/articles/1', ['/[/'])).toBe(false);
		expect(isKeywordIncluded(`${'a'.repeat(10_000)}!`, ['/^(a+)+$/'])).toBe(false);
	});
});
