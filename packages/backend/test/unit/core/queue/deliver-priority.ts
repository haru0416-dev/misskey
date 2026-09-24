/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type * as Redis from 'ioredis';
import { loadConfig } from '@/config.js';
import { DELIVER_HOST_IDLE_RESET_MS, HostFairDeliverQueue } from '@/core/queue/deliver-priority.js';
import { genId } from '@/misc/id/gen-id.js';
import { baseQueueOptions, QUEUE } from '@/queue/const.js';
import type { DeliverJobData } from '@/queue/types.js';

function job(host: string): { name: string; data: DeliverJobData } {
	return {
		name: host,
		data: { user: { id: 'sender' }, content: '{}', digest: 'digest', to: `https://${host}/inbox`, isSharedInbox: true },
	};
}

describe('HostFairDeliverQueue', () => {
	let queue: HostFairDeliverQueue;
	let redis: Redis.Redis;

	beforeAll(async () => {
		// 実キューと同じ接続設定で、他のテストと共有しない名前のキューを使う。
		queue = new HostFairDeliverQueue(`deliver-priority-${genId()}`, baseQueueOptions(loadConfig(), QUEUE.DELIVER));
		redis = (await queue.getBackend().client) as unknown as Redis.Redis;
	});

	afterAll(async () => {
		await queue.obliterate({ force: true });
		await queue.close();
	});

	test('宛先ホストへの投入数が 2 倍になるごとに優先度が 1 段下がる', async () => {
		const host = `${genId()}.example`;
		const [first] = await queue.addBulk([job(host)]);
		const next = await queue.addBulk([job(host), job(host), job(host)]);
		const single = await queue.add(host, job(host).data);

		// 優先度は 1 + floor(log2(投入数)) で、投入数は 1 → 4 → 5。
		expect(first!.opts.priority).toBe(1);
		expect(next.map((added) => added.opts.priority)).toStrictEqual([3, 3, 3]);
		expect(single.opts.priority).toBe(3);
	});

	test('大量投入中のホストの滞留を、静かなホスト宛てが追い越す', async () => {
		const busy = `${genId()}.example`;
		const quiet = `${genId()}.example`;
		const flood = await queue.addBulk(Array.from({ length: 100 }, () => job(busy)));
		const [probe] = await queue.addBulk([job(quiet)]);

		expect(new Set(flood.map((added) => added.opts.priority))).toStrictEqual(new Set([7]));
		expect(probe!.opts.priority).toBe(1);
		const order = await queue.getJobs(['prioritized'], 0, -1, true);
		const ids = order.map((queued) => queued.id);
		expect(ids.indexOf(probe!.id)).toBeLessThan(Math.min(...flood.map((added) => ids.indexOf(added.id))));
	});

	test('同じ投入内の同一ホストはまとめて数え、ホストごとに独立して数える', async () => {
		const a = `${genId()}.example`;
		const b = `${genId()}.example`;
		const added = await queue.addBulk([job(a), job(b), job(a), job(a), job(a)]);
		expect(added.map((queued) => queued.opts.priority)).toStrictEqual([3, 1, 3, 3, 3]);
	});

	test('同じホスト宛ては投入が途切れるまで優先度が戻らず、後から積んだジョブが先の滞留を追い越さない', async () => {
		const host = `${genId()}.example`;
		const key = queue.toKey(`host-enqueued:${host}`);
		const burst = await queue.addBulk(Array.from({ length: 64 }, () => job(host)));
		const later = await queue.add(host, job(host).data);

		expect(later.opts.priority).toBeGreaterThanOrEqual(Math.max(...burst.map((added) => added.opts.priority!)));
		const order = (await queue.getJobs(['prioritized'], 0, -1, true)).map((queued) => queued.id);
		expect(order.indexOf(later.id)).toBeGreaterThan(Math.max(...burst.map((added) => order.indexOf(added.id))));
		expect(await redis.pttl(key)).toBeGreaterThan(DELIVER_HOST_IDLE_RESET_MS - 60_000);

		// 投入が途切れて数え直した後は最優先に戻る。
		await redis.del(key);
		const [afterIdle] = await queue.addBulk([job(host)]);
		expect(afterIdle!.opts.priority).toBe(1);
	});
});
