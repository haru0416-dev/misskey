/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import * as mfm from 'mfm-js';
import { extractUrlFromMfm } from '@/utility/extract-url-from-mfm.js';

describe('extractUrlFromMfm', () => {
	test('keeps the first URL for each hashless URL in source order', () => {
		const nodes = mfm.parse('https://a.example/path#first https://b.example/ https://a.example/path#second https://b.example/');

		expect(extractUrlFromMfm(nodes)).toEqual([
			'https://a.example/path#first',
			'https://b.example/',
		]);
	});
});
