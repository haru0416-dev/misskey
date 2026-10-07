/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import fc from 'fast-check';
import type * as Redis from 'ioredis';
import { loadConfig } from '@/config.js';
import { genId } from '@/misc/id/gen-id.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserInDatabase } from '@/core/user/user-store.js';
import { createNoteInDatabase } from '@/core/note/note-store.js';
import { FanoutTimelinePush, sortAllFanoutTimelineLists } from '@/core/note/fanout-timeline-push.js';
import {
	fetchFanoutTimelineNotes,
	readWholeTimelineLists,
	SortedTimelineListsReader,
	UnsortedTimelineListError,
} from '@/server/rest/note/fanout-timeline.js';
import type { FanoutTimelineReadOptions, TimelineIdSource } from '@/server/rest/note/fanout-timeline.js';
import type { MiNote } from '@/models/Note.js';

const MARKER = 'fanoutTimelineListsSorted';
const MINUTE = 1000 * 60;

/** 大小が数値の大小と一致する、ID と同じ形 (小文字 16 進 32 桁) の文字列。 */
const hexId = (n: number) => n.toString(16).padStart(32, '0');
const descending = (a: string, b: string) => (a > b ? -1 : 1);

async function drain(source: TimelineIdSource, takes: number[]): Promise<{ ids: string[]; more: boolean }> {
	const ids: string[] = [];
	for (const n of takes) {
		ids.push(...(await source.take(n)));
	}
	return { ids, more: await source.hasMore() };
}

describe('fanout timeline reading', () => {
	let runtime: RuntimeDependencies;
	let redis: Redis.Redis;
	let run = 0;
	const usedKeys = new Set<string>();

	async function writeLists(lists: string[][]): Promise<string[]> {
		run++;
		const names = lists.map((_, i) => `readerTest:${genId()}:${run}:${i}`);
		const pipeline = redis.pipeline();
		lists.forEach((ids, i) => {
			usedKeys.add(`list:${names[i]}`);
			if (ids.length > 0) {
				pipeline.rpush(`list:${names[i]}`, ...ids);
			}
		});
		await pipeline.exec();
		return names;
	}

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		redis = runtime.redisForTimelines;
		await sortAllFanoutTimelineLists(redis);
	});

	afterEach(async () => {
		if (usedKeys.size > 0) {
			await redis.del(...usedKeys);
		}
		usedKeys.clear();
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	// 1〜3 本の降順・重複なしの list。list 間では同じ ID を共有しうる (home と localTimeline など)。
	const sortedLists = fc.array(fc.uniqueArray(fc.integer({ min: 1, max: 400 }), { maxLength: 60 }), {
		minLength: 1,
		maxLength: 3,
	});

	test('ranged reads return the same IDs as sorting the whole lists', async () => {
		let deep = 0;
		await fc.assert(
			fc.asyncProperty(
				sortedLists,
				fc.option(fc.integer({ min: 1, max: 401 })),
				fc.integer({ min: 1, max: 8 }),
				fc.array(fc.integer({ min: 1, max: 12 }), { minLength: 1, maxLength: 12 }),
				async (lists, until, size, takes) => {
					const names = await writeLists(lists.map((l) => l.toSorted((a, b) => b - a).map(hexId)));
					const untilId = until == null ? null : hexId(until);
					const expected = await drain(await readWholeTimelineLists(redis, names, untilId), takes);
					const actual = await drain(new SortedTimelineListsReader(redis, names, untilId, size), takes);
					expect(actual).toEqual(expected);
					if (expected.ids.length > size * 2) {
						deep++;
					}
				},
			),
			{ numRuns: 300 },
		);
		// 1 回の読み取りで終わる空振りを防ぐ。
		expect(deep).toBeGreaterThan(40);
	});

	test('notes inserted and lists trimmed between reads are neither skipped nor repeated', async () => {
		let interleaved = 0;
		const mutation = fc.record({
			list: fc.nat(),
			kind: fc.constantFrom('insert' as const, 'trim' as const),
			value: fc.integer({ min: 1, max: 400 }),
		});
		await fc.assert(
			fc.asyncProperty(
				sortedLists,
				fc.option(fc.integer({ min: 1, max: 401 })),
				fc.integer({ min: 1, max: 6 }),
				fc.array(fc.tuple(fc.integer({ min: 1, max: 10 }), fc.array(mutation, { maxLength: 4 })), {
					minLength: 1,
					maxLength: 10,
				}),
				async (lists, until, size, steps) => {
					const names = await writeLists(lists.map((l) => l.toSorted((a, b) => b - a).map(hexId)));
					const keys = names.map((name) => `list:${name}`);
					// list ごとに、最初からあって最後まで一度も消されなかった ID。
					const kept = lists.map((l) => new Set(l.map(hexId)));
					const untilId = until == null ? null : hexId(until);
					const reader = new SortedTimelineListsReader(redis, names, untilId, size);
					const out: string[] = [];
					let mutated = false;
					for (const [n, mutations] of steps) {
						for (const m of mutations) {
							const index = m.list % keys.length;
							const key = keys[index]!;
							const current = await redis.lrange(key, 0, -1);
							if (m.kind === 'trim') {
								// 書き込みが上限を越えた分を末尾から切り詰めるのと同じ。
								const keep = Math.max(current.length - 1 - (m.value % 4), 0);
								for (const id of current.slice(keep)) {
									kept[index]!.delete(id);
								}
								await (keep === 0 ? redis.del(key) : redis.ltrim(key, 0, keep - 1));
							} else if (!current.includes(hexId(m.value))) {
								// 遅着・並行投稿の降順位置への挿入と同じ。
								const pivot = current.find((id) => id < hexId(m.value));
								if (pivot == null) {
									await redis.rpush(key, hexId(m.value));
								} else {
									await redis.linsert(key, 'BEFORE', pivot, hexId(m.value));
								}
							}
							mutated ||= out.length > 0;
						}
						out.push(...(await reader.take(n)));
					}
					const exhausted = !(await reader.hasMore());

					expect(out).toEqual([...new Set(out)].sort(descending));
					if (untilId != null) {
						expect(out.every((id) => id < untilId)).toBe(true);
					}
					const last = out.at(-1);
					const missing = kept
						.flatMap((ids) => [...ids])
						.filter(
							(id) =>
								(untilId == null || id < untilId) && (exhausted || last == null || id > last) && !out.includes(id),
						);
					expect(missing).toEqual([]);
					if (mutated && out.length > size) {
						interleaved++;
					}
				},
			),
			{ numRuns: 300 },
		);
		expect(interleaved).toBeGreaterThan(40);
	});

	test('a range that is not descending is reported instead of being merged', async () => {
		const names = await writeLists([[hexId(5), hexId(9), hexId(3)]]);
		await expect(new SortedTimelineListsReader(redis, names, null, 4).take(2)).rejects.toBeInstanceOf(
			UnsortedTimelineListError,
		);
	});

	describe('fetchFanoutTimelineNotes', () => {
		/** 公開ノートを 0〜count 番の count + 1 件作る。番号が大きいほど新しい。times を渡すとその作成時刻にする。 */
		async function createNotes(count: number, times?: number[]): Promise<string[]> {
			const userId = genId();
			await createUserInDatabase(runtime.db, {
				id: userId,
				username: `fanoutread${userId}`,
				usernameLower: `fanoutread${userId}`,
			});
			const now = Date.now();
			const ids: string[] = [];
			for (let i = 0; i <= count; i++) {
				const id = genId(times?.[i] ?? now - (count - i) * 1000);
				ids.push(id);
				await createNoteInDatabase(runtime.db, { id, text: id, userId, userHost: null, visibility: 'public' });
			}
			return ids;
		}

		function options(names: string[], overrides: Partial<FanoutTimelineReadOptions> = {}): FanoutTimelineReadOptions {
			return {
				untilId: null,
				sinceId: null,
				limit: 3,
				allowPartial: false,
				useDbFallback: true,
				redisTimelines: names,
				excludePureRenotes: false,
				dbFallback: async () => [],
				...overrides,
			};
		}

		test('sinceId goes straight to the database without reading the lists', async () => {
			const unusedRedis = new Proxy({} as Redis.Redis, {
				get() {
					throw new Error('sinceId must not read Redis');
				},
			});
			const dbFallback = vi.fn(async () => [{ id: 'x' } as MiNote]);
			const notes = await fetchFanoutTimelineNotes(
				{ db: runtime.db, meta: runtime.meta, redisForTimelines: unusedRedis },
				options(['home'], { sinceId: hexId(1), untilId: hexId(9), dbFallback }),
			);
			expect(notes.map((n) => n.id)).toEqual(['x']);
			expect(dbFallback).toHaveBeenCalledWith(hexId(9), hexId(1), 3);
		});

		test('lists that are not yet sorted are read whole until the sort marker is set', async () => {
			// 2 件ずつの範囲読みでは [n5, n2] [n9, n7] [n1] のどれも降順なので崩れに気付けず、n9 を落とす並び。
			const n = await createNotes(9);
			const names = await writeLists([[n[5]!, n[2]!, n[9]!, n[7]!, n[1]!]]);
			const fresh = redis.duplicate();
			await redis.del(MARKER);
			try {
				const notes = await fetchFanoutTimelineNotes(
					{ db: runtime.db, meta: runtime.meta, redisForTimelines: fresh },
					options(names, { limit: 1 }),
				);
				expect(notes.map((note) => note.id)).toEqual([n[9]]);
			} finally {
				await redis.set(MARKER, '1');
				fresh.disconnect();
			}
		});

		test('an unsorted list after the marker falls back to a whole read and is sorted again', async () => {
			const names = await writeLists([[hexId(5), hexId(2), hexId(9), hexId(7), hexId(1), hexId(8)]]);
			const dbFallback = vi.fn(async () => []);
			await fetchFanoutTimelineNotes(
				{ db: runtime.db, meta: runtime.meta, redisForTimelines: redis },
				options(names, { limit: 1, dbFallback }),
			);
			expect(dbFallback).toHaveBeenCalledWith(hexId(1), null, 1);
			expect(await redis.lrange(`list:${names[0]}`, 0, -1)).toEqual([9, 8, 7, 5, 2, 1].map(hexId));
		});

		test('paging through a full list returns every note, including newer ones next to a late arrival', async () => {
			const now = Date.now();
			const [n3, late, n4, n5, n6] = (await createNotes(4, [
				now - 20 * MINUTE,
				now - 10 * MINUTE,
				now - 2 * MINUTE,
				now - MINUTE,
				now,
			])) as [string, string, string, string, string];
			const all = [n6, n5, n4, late, n3];
			const [home] = await writeLists([[]]);
			// 遅れて届いた投稿を挟んで上限 3 件の list に配る。
			for (const id of [n3, n4, n5, late, n6]) {
				const push = new FanoutTimelinePush(id);
				push.add(home!, 3);
				await push.flush(redis);
			}

			const dbFallback = async (untilId: string | null, _sinceId: string | null, limit: number) =>
				all
					.filter((id) => untilId == null || id < untilId)
					.slice(0, limit)
					.map((id) => ({ id }) as MiNote);
			const seen: string[] = [];
			let untilId: string | null = null;
			for (let page = 0; page < 5; page++) {
				const notes = await fetchFanoutTimelineNotes(
					{ db: runtime.db, meta: runtime.meta, redisForTimelines: redis },
					options([home!], { untilId, limit: 2, dbFallback }),
				);
				if (notes.length === 0) {
					break;
				}
				seen.push(...notes.map((n) => n.id));
				untilId = notes.at(-1)!.id;
			}
			expect(seen).toEqual(all);
		});
	});
});
