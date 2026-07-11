/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { ref } from 'vue';
import { makeDateSeparatedTimelineComputedRef } from '@/features/notes/timeline-date-separate.js';

describe('makeDateSeparatedTimelineComputedRef', () => {
	test('preserves item order and inserts separators between calendar days', () => {
		const items = ref([
			{ id: 'a', createdAt: '2026-07-11T23:00:00+09:00' },
			{ id: 'b', createdAt: '2026-07-10T23:00:00+09:00' },
			{ id: 'c', createdAt: '2026-07-10T12:00:00+09:00' },
		]);

		const timeline = makeDateSeparatedTimelineComputedRef(items);

		expect(timeline.value.map((item) => item.id)).toEqual(['a', 'date-a', 'b', 'c']);
	});
});
