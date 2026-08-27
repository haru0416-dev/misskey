/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { parseHashtagQuery } from '@/features/search/hashtag-query.js';

describe('parseHashtagQuery', () => {
	test('空白区切りを AND 条件の並びにする', () => {
		expect(parseHashtagQuery('猫 写真')).toEqual(['猫', '写真']);
	});

	test('全角空白でも区切る', () => {
		expect(parseHashtagQuery('猫　写真')).toEqual(['猫', '写真']);
	});

	test('先頭の # を落とす', () => {
		expect(parseHashtagQuery('#猫 ##写真')).toEqual(['猫', '写真']);
	});

	test('タグが 1 つも取れなければ null', () => {
		expect(parseHashtagQuery('   ')).toBeNull();
		expect(parseHashtagQuery('#')).toBeNull();
	});
});
