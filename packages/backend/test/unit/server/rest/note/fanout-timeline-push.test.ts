/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import fc from 'fast-check';
import { loadConfig } from '@/config.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import {
	FanoutTimelinePush,
	isFanoutTimelineSortReady,
	sortAllFanoutTimelineLists,
	startFanoutTimelineSort,
} from '@/core/note/fanout-timeline-push.js';

const MINUTE = 1000 * 60;

/** 書き込みスクリプトと同じ規則で list を更新する参照実装。 */
function pushToModel(list: string[], id: string, maxlen: number): string[] {
	const fresh = parseId(id).date.getTime() > Date.now() - 3 * MINUTE;
	const tail = list.at(-1);
	if (!fresh && tail != null && parseId(tail).date.getTime() >= parseId(id).date.getTime()) {
		return list;
	}
	if (list.includes(id)) {
		return list;
	}
	const next = [...list, id].sort((a, b) => (a > b ? -1 : 1)).slice(0, maxlen);
	return next.includes(id) ? next : list;
}

describe('FanoutTimelinePush', () => {
	let runtime: RuntimeDependencies;
	const usedKeys = new Set<string>();

	function timeline(name: string): string {
		const tl = `fanoutPushTest:${name}:${genId()}`;
		usedKeys.add(`list:${tl}`);
		return tl;
	}

	async function list(tl: string): Promise<string[]> {
		return await runtime.redisForTimelines.lrange(`list:${tl}`, 0, -1);
	}

	async function push(id: string, tl: string, maxlen: number): Promise<void> {
		const p = new FanoutTimelinePush(id);
		p.add(tl, maxlen);
		await p.flush(runtime.redisForTimelines);
	}

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
	});

	afterEach(async () => {
		if (usedKeys.size > 0) {
			await runtime.redisForTimelines.del(...usedKeys);
		}
		usedKeys.clear();
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('pushes a fresh note to the head of every list and keeps each list within its limit', async () => {
		const unusedRedis = new Proxy({} as Parameters<FanoutTimelinePush['flush']>[0], {
			get() {
				throw new Error('Empty fanout must not access Redis');
			},
		});
		await expect(new FanoutTimelinePush(genId()).flush(unusedRedis)).resolves.toBeUndefined();

		const home = timeline('home');
		const withFiles = timeline('withFiles');
		const ids: string[] = [];
		for (let i = 0; i < 5; i++) {
			const id = genId();
			ids.push(id);
			const p = new FanoutTimelinePush(id);
			p.add(home, 3);
			p.add(withFiles, 10);
			await p.flush(runtime.redisForTimelines);
		}

		expect(await list(home)).toEqual([ids[4], ids[3], ids[2]]);
		expect(await list(withFiles)).toEqual([...ids].reverse());
	});

	test('a stale note is inserted at its ID position only when it is newer than the tail', async () => {
		const home = timeline('home');
		const tail = genId(Date.now() - 60 * MINUTE);
		const head = genId();
		await push(head, home, 100);
		await runtime.redisForTimelines.rpush(`list:${home}`, tail);

		const older = genId(Date.now() - 120 * MINUTE);
		await push(older, home, 100);
		expect(await list(home)).toEqual([head, tail]);

		const stale = genId(Date.now() - 10 * MINUTE);
		await push(stale, home, 100);
		expect(await list(home)).toEqual([head, stale, tail]);
	});

	test('notes arriving out of order and retried deliveries keep the list descending without duplicates', async () => {
		const home = timeline('home');
		const now = Date.now();
		const ids = [0, 1, 2, 3, 4, 5].map((i) => genId(now - 1000 * (6 - i)));
		// 並行投稿の配布順の入れ替わりと、outbox の再試行による同じ投稿の再配布。
		for (const i of [1, 0, 3, 5, 2, 4, 5, 2, 0]) {
			await push(ids[i]!, home, 100);
		}
		expect(await list(home)).toEqual([...ids].reverse());
	});

	test('trimming drops the oldest notes, not newer notes that arrived before a late one', async () => {
		// 遅れて届いた古い投稿を先頭へ入れると、末尾からの切り詰めでそれより新しい投稿が先に落ちる。
		// 読み取りは Redis の最古の候補から DB へ続けるので、落ちた投稿は誰にも返されなくなる。
		const home = timeline('home');
		const now = Date.now();
		const n3 = genId(now - 20 * MINUTE);
		const late = genId(now - 10 * MINUTE);
		const n4 = genId(now - 2 * MINUTE);
		const n5 = genId(now - MINUTE);
		const n6 = genId(now);
		for (const id of [n3, n4, n5]) {
			await runtime.redisForTimelines.lpush(`list:${home}`, id);
		}
		await push(late, home, 3);
		expect(await list(home)).toEqual([n5, n4, late]);
		await push(n6, home, 3);
		expect(await list(home)).toEqual([n6, n5, n4]);
	});

	test('splits more than 500 lists across several script calls', async () => {
		const id = genId();
		const p = new FanoutTimelinePush(id);
		const timelines = Array.from({ length: 501 }, (_, i) => timeline(`many${i}`));
		for (const tl of timelines) {
			p.add(tl, 5);
		}
		await p.flush(runtime.redisForTimelines);

		expect(await list(timelines[0]!)).toEqual([id]);
		expect(await list(timelines[500]!)).toEqual([id]);
	});

	test('any sequence of fresh, stale and retried pushes matches the reference model', async () => {
		const seen = { middleInserts: 0, duplicates: 0, trims: 0, skips: 0 };
		const op = fc.oneof(
			// 直近 1 分の投稿 (配布順が入れ替わる)
			{
				weight: 3,
				arbitrary: fc.record({ kind: fc.constant('fresh' as const), ago: fc.integer({ min: 0, max: 60_000 }) }),
			},
			// 3 分より前の投稿 (遅延配信)
			{
				weight: 1,
				arbitrary: fc.record({
					kind: fc.constant('stale' as const),
					ago: fc.integer({ min: 4 * MINUTE, max: 120 * MINUTE }),
				}),
			},
			// 既に配った投稿の再配布
			{ weight: 1, arbitrary: fc.record({ kind: fc.constant('retry' as const), index: fc.nat() }) },
		);
		await fc.assert(
			fc.asyncProperty(
				fc.array(op, { minLength: 1, maxLength: 40 }),
				fc.integer({ min: 1, max: 8 }),
				async (ops, maxlen) => {
					const tl = timeline('model');
					const now = Date.now();
					const pushed: string[] = [];
					let model: string[] = [];
					for (const o of ops) {
						const id = o.kind === 'retry' ? pushed[o.index % Math.max(pushed.length, 1)] : genId(now - o.ago);
						if (id == null) {
							continue;
						}
						pushed.push(id);
						const next = pushToModel(model, id, maxlen);
						if (model.includes(id)) {
							seen.duplicates++;
						} else if (next === model) {
							seen.skips++;
						} else if (next[0] !== id && next.includes(id)) {
							seen.middleInserts++;
						}
						if (next !== model && model.length === maxlen) {
							seen.trims++;
						}
						model = next;
						await push(id, tl, maxlen);
						expect(await list(tl)).toEqual(model);
					}
					await runtime.redisForTimelines.del(`list:${tl}`);
				},
			),
			{ numRuns: 100 },
		);
		// 先頭への追加だけで終わる空振りを防ぐ。
		expect(seen.middleInserts).toBeGreaterThan(50);
		expect(seen.duplicates).toBeGreaterThan(30);
		expect(seen.trims).toBeGreaterThan(25);
		expect(seen.skips).toBeGreaterThan(30);
	});
});

describe('sortAllFanoutTimelineLists', () => {
	let runtime: RuntimeDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('rewrites existing lists to descending order without duplicates once, then marks completion', async () => {
		const redis = runtime.redisForTimelines;
		const suffix = genId();
		const unsorted = `list:sortTest:unsorted:${suffix}`;
		const sorted = `list:sortTest:sorted:${suffix}`;
		const notList = `list:sortTest:string:${suffix}`;
		const ids = Array.from({ length: 2500 }, (_, i) => genId(Date.now() - i * 1000));
		const shuffled = fc.sample(fc.shuffledSubarray(ids, { minLength: ids.length }), { numRuns: 1, seed: 1 })[0]!;
		await redis.del('fanoutTimelineListsSorted');
		try {
			// 順不同と再試行の重複。スクリプト内の RPUSH 1 回分 (1000 件) を越える長さにする。
			await redis.rpush(unsorted, ...shuffled, ids[0]!, ids[5]!);
			await redis.rpush(sorted, ...ids.slice(0, 10));
			await redis.set(notList, 'x');
			const fresh = redis.duplicate();
			try {
				expect(await isFanoutTimelineSortReady(fresh)).toBe(false);
				const result = await sortAllFanoutTimelineLists(redis);
				expect(result.completed).toBe(true);
				expect(result.keys).toBeGreaterThanOrEqual(2);
				expect(result.rewritten).toBeGreaterThanOrEqual(1);
				expect(await isFanoutTimelineSortReady(fresh)).toBe(true);
			} finally {
				fresh.disconnect();
			}
			expect(await redis.lrange(unsorted, 0, -1)).toEqual(ids);
			expect(await redis.lrange(sorted, 0, -1)).toEqual(ids.slice(0, 10));
			expect(await redis.get(notList)).toBe('x');

			// 印の後に降順を保たない書き込み (旧版) が入っても、次の起動の走査で直す。
			await redis.lpush(sorted, ids[20]!);
			const again = await sortAllFanoutTimelineLists(redis);
			expect(again.completed).toBe(true);
			expect(again.rewritten).toBeGreaterThanOrEqual(1);
			expect(await redis.lrange(sorted, 0, -1)).toEqual([...ids.slice(0, 10), ids[20]]);
		} finally {
			await redis.del(unsorted, sorted, notList);
			await redis.set('fanoutTimelineListsSorted', '1');
		}
	});

	test('stopping before completion leaves the marker unset so readers keep reading whole lists', async () => {
		const redis = runtime.redisForTimelines;
		const key = `list:sortTest:stop:${genId()}`;
		await redis.del('fanoutTimelineListsSorted');
		try {
			await redis.rpush(key, genId(Date.now() - 1000), genId());
			expect(await sortAllFanoutTimelineLists(redis, () => true)).toEqual({ completed: false, keys: 0, rewritten: 0 });
			expect(await redis.exists('fanoutTimelineListsSorted')).toBe(0);
			expect((await redis.lrange(key, 0, -1))[0]! < (await redis.lrange(key, 0, -1))[1]!).toBe(true);

			const errors: unknown[] = [];
			const started = startFanoutTimelineSort(redis, { info: () => {}, error: (e) => errors.push(e) });
			await vi.waitFor(async () => expect(await redis.exists('fanoutTimelineListsSorted')).toBe(1), {
				timeout: 10_000,
			});
			await started.dispose();
			expect(errors).toEqual([]);
			const [first, second] = await redis.lrange(key, 0, -1);
			expect(first! > second!).toBe(true);
		} finally {
			await redis.del(key);
			await redis.set('fanoutTimelineListsSorted', '1');
		}
	});
});
