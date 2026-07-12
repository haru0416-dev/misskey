/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { isEmojiSimple, isEmojiSimpleArray } from '@shared/utility/custom-emojis.js';

const emoji = {
	aliases: ['party'],
	name: 'blobcat',
	category: null,
	url: 'https://example.com/blobcat.webp',
};

describe('custom emoji validation', () => {
	test('accepts a valid simple emoji', () => {
		expect(isEmojiSimple(emoji)).toBe(true);
		expect(isEmojiSimpleArray([emoji])).toBe(true);
	});

	test.each([
		null,
		{},
		{ ...emoji, aliases: [1] },
		{ ...emoji, category: undefined },
		{ ...emoji, name: null },
		{ ...emoji, url: 1 },
		{ ...emoji, localOnly: 'false' },
	])('rejects an invalid simple emoji: %j', (value) => {
		expect(isEmojiSimple(value)).toBe(false);
	});

	test('rejects an array containing an invalid emoji', () => {
		expect(isEmojiSimpleArray([emoji, { ...emoji, aliases: null }])).toBe(false);
	});
});
