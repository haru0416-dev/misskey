/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { createSearchUrl } from '@/features/search/search-engine.js';

describe('createSearchUrl', () => {
	test.each([
		['google', 'https://www.google.com/search?q=Misskey+%26+Fediverse'],
		['duckduckgo', 'https://duckduckgo.com/?q=Misskey+%26+Fediverse'],
		['bing', 'https://www.bing.com/search?q=Misskey+%26+Fediverse'],
		['brave', 'https://search.brave.com/search?q=Misskey+%26+Fediverse'],
	] as const)('creates an encoded URL for %s', (engine, expected) => {
		expect(createSearchUrl(engine, 'Misskey & Fediverse').href).toBe(expected);
	});
});
