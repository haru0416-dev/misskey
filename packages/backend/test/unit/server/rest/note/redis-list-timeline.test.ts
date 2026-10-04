/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { collectRedisListTimelineNotes } from '@/server/rest/note/redis-list-timeline.js';

describe('collectRedisListTimelineNotes', () => {
	// 新しいものほど大きい ID。n001 が最古、n100 が最新。
	const ids = Array.from({ length: 100 }, (_, i) => `n${String(i + 1).padStart(3, '0')}`);
	const redis = { lrange: async () => [...ids].reverse() };

	test('先頭の候補がすべて落ちても、古い候補から limit 件を集める', async () => {
		const hidden = new Set(ids.slice(80));
		const notes = await collectRedisListTimelineNotes(
			redis,
			'list:test',
			{ sinceId: null, untilId: null, limit: 10 },
			async (batch) => {
				return batch.filter((id) => !hidden.has(id)).map((id) => ({ id }));
			},
		);
		expect(notes.map((note) => note.id)).toEqual(ids.slice(70, 80).reverse());
	});

	test('途中でそろったらそこで止め、次のページの起点で抜けが出ない', async () => {
		const hidden = new Set(['n100', 'n098']);
		const filter = async (batch: string[]) => batch.filter((id) => !hidden.has(id)).map((id) => ({ id }));
		const first = await collectRedisListTimelineNotes(
			redis,
			'list:test',
			{ sinceId: null, untilId: null, limit: 5 },
			filter,
		);
		expect(first.map((note) => note.id)).toEqual(['n099', 'n097', 'n096', 'n095', 'n094']);
		const second = await collectRedisListTimelineNotes(
			redis,
			'list:test',
			{ sinceId: null, untilId: first.at(-1)!.id, limit: 5 },
			filter,
		);
		expect(second.map((note) => note.id)).toEqual(['n093', 'n092', 'n091', 'n090', 'n089']);
	});

	test('候補を全部落とされても、見るのは limit の 10 回分まで', async () => {
		let calls = 0;
		const notes = await collectRedisListTimelineNotes(
			redis,
			'list:test',
			{ sinceId: null, untilId: null, limit: 5 },
			async () => {
				calls++;
				return [];
			},
		);
		expect(notes).toEqual([]);
		expect(calls).toBe(10);
	});
});
