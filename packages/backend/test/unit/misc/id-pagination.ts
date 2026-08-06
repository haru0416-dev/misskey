/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { resolveDateIdPagination, resolveIdPagination } from '@/misc/id-pagination.js';

describe('misc:id-pagination', () => {
	test.each([
		[{}, { sinceId: null, untilId: null, order: 'desc' }],
		[{ sinceId: 'since' }, { sinceId: 'since', untilId: null, order: 'asc' }],
		[{ untilId: 'until' }, { sinceId: null, untilId: 'until', order: 'desc' }],
		[
			{ sinceId: 'since', untilId: 'until' },
			{ sinceId: 'since', untilId: 'until', order: 'desc' },
		],
	])('resolves cursor bounds %#', (options, expected) => {
		expect(resolveIdPagination(options)).toEqual(expected);
	});

	test('converts date bounds to IDs', () => {
		const idGenerator = { gen: vi.fn((time) => `id-${time}`) };

		expect(resolveDateIdPagination(idGenerator, { sinceDate: 1, untilDate: 2 })).toEqual({
			sinceId: 'id-1',
			untilId: 'id-2',
			order: 'desc',
		});
		expect(idGenerator.gen).toHaveBeenCalledTimes(2);
	});

	test('gives explicit IDs precedence over date bounds', () => {
		const idGenerator = { gen: vi.fn((time) => `id-${time}`) };

		expect(resolveDateIdPagination(idGenerator, { sinceId: 'since', untilDate: 2 })).toEqual({
			sinceId: 'since',
			untilId: null,
			order: 'asc',
		});
		expect(idGenerator.gen).not.toHaveBeenCalled();
	});
});
