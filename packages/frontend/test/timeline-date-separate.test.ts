/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { ref } from 'vue';
import {
	isSeparatorNeeded,
	makeDateGroupedTimelineComputedRef,
	makeDateSeparatedTimelineComputedRef,
} from '@/features/note/timeline-date-separate.js';

/** 判定は実行環境のタイムゾーンの暦で行うので、入力も同じ暦の日時から作る。 */
function localIso(year: number, month: number, day: number, hour = 12): string {
	return new Date(year, month - 1, day, hour).toISOString();
}

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

	test('日付の数字が同じでも月や年が違えば区切る', () => {
		const items = ref([
			{ id: 'a', createdAt: localIso(2026, 7, 10) },
			{ id: 'b', createdAt: localIso(2026, 6, 10) },
			{ id: 'c', createdAt: localIso(2025, 6, 10) },
			{ id: 'd', createdAt: localIso(2025, 6, 10, 1) },
		]);

		const timeline = makeDateSeparatedTimelineComputedRef(items);

		expect(timeline.value.map((item) => item.id)).toEqual(['a', 'date-a', 'b', 'date-b', 'c', 'd']);
		expect(timeline.value.filter((item) => item.type === 'date').map((item) => [item.prevText, item.nextText])).toEqual(
			[
				['7/10', '6/10'],
				['6/10', '6/10'],
			],
		);
		expect(isSeparatorNeeded(localIso(2026, 7, 10), localIso(2026, 6, 10))).toBe(true);
		expect(isSeparatorNeeded(localIso(2026, 6, 10), localIso(2025, 6, 10))).toBe(true);
		expect(isSeparatorNeeded(localIso(2026, 6, 10, 23), localIso(2026, 6, 10, 0))).toBe(false);
	});
});

describe('makeDateGroupedTimelineComputedRef', () => {
	test('同じ月でも年が違えば別の組にする', () => {
		const items = ref([
			{ id: 'a', createdAt: localIso(2026, 6, 30) },
			{ id: 'b', createdAt: localIso(2026, 6, 1) },
			{ id: 'c', createdAt: localIso(2026, 5, 31) },
			{ id: 'd', createdAt: localIso(2025, 5, 31) },
		]);

		const groups = makeDateGroupedTimelineComputedRef(items);

		expect(groups.value.map((group) => group.items.map((item) => item.id))).toEqual([['a', 'b'], ['c'], ['d']]);
	});
});
