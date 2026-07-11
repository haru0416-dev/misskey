/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { resolveInitialInstanceMeta } from '@/utility/instance-cache.js';

describe('instance metadata cache', () => {
	test('uses and stores newer provided metadata', () => {
		expect(resolveInitialInstanceMeta({
			cachedMeta: '{"version":"old"}',
			cachedAt: '100',
			providedMeta: '{"version":"new"}',
			providedAt: '200',
		})).toStrictEqual({
			meta: { version: 'new' },
			cachedAt: 200,
			cacheAction: 'store',
		});
	});

	test('keeps a newer valid cache', () => {
		expect(resolveInitialInstanceMeta({
			cachedMeta: '{"version":"cached"}',
			cachedAt: '200',
			providedMeta: '{"version":"provided"}',
			providedAt: '100',
		})).toStrictEqual({
			meta: { version: 'cached' },
			cachedAt: 200,
			cacheAction: 'none',
		});
	});

	test.each(['{', '[]', 'null', '"text"'])('replaces an invalid cache with valid provided metadata: %s', (cachedMeta) => {
		expect(resolveInitialInstanceMeta({
			cachedMeta,
			cachedAt: 'invalid',
			providedMeta: '{"version":"provided"}',
			providedAt: 'invalid',
		})).toStrictEqual({
			meta: { version: 'provided' },
			cachedAt: 0,
			cacheAction: 'store',
		});
	});

	test('clears an invalid cache when no valid provided metadata exists', () => {
		expect(resolveInitialInstanceMeta({
			cachedMeta: '{',
			cachedAt: '100',
			providedMeta: '[]',
			providedAt: '200',
		})).toStrictEqual({
			meta: null,
			cachedAt: 0,
			cacheAction: 'clear',
		});
	});

	test('does nothing when no metadata exists', () => {
		expect(resolveInitialInstanceMeta({
			cachedMeta: null,
			cachedAt: null,
			providedMeta: null,
			providedAt: null,
		})).toStrictEqual({
			meta: null,
			cachedAt: 0,
			cacheAction: 'none',
		});
	});
});
