/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { genId } from '@/misc/id/gen-id.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { FanoutTimelinePush } from '@/server/rest/note/fanout-timeline-push.js';

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
		const home = timeline('home');
		const withFiles = timeline('withFiles');
		const ids: string[] = [];
		for (let i = 0; i < 5; i++) {
			const id = genId();
			ids.push(id);
			const push = new FanoutTimelinePush(id);
			push.add(home, 3);
			push.add(withFiles, 10);
			await push.flush(runtime.redisForTimelines);
		}

		expect(await list(home)).toEqual([ids[4], ids[3], ids[2]]);
		expect(await list(withFiles)).toEqual([...ids].reverse());
	});

	test('re-pushing the same note (outbox retry) does not duplicate it', async () => {
		const home = timeline('home');
		const id = genId();
		for (let i = 0; i < 3; i++) {
			const push = new FanoutTimelinePush(id);
			push.add(home, 100);
			await push.flush(runtime.redisForTimelines);
		}

		expect(await list(home)).toEqual([id]);
	});

	test('a stale note is inserted only when it is newer than the tail', async () => {
		const home = timeline('home');
		const tail = genId(Date.now() - 1000 * 60 * 60);
		const push = new FanoutTimelinePush(genId());
		push.add(home, 100);
		await push.flush(runtime.redisForTimelines);
		await runtime.redisForTimelines.rpush(`list:${home}`, tail);

		const older = genId(Date.now() - 1000 * 60 * 60 * 2);
		const olderPush = new FanoutTimelinePush(older);
		olderPush.add(home, 100);
		await olderPush.flush(runtime.redisForTimelines);
		expect(await list(home)).not.toContain(older);

		const stale = genId(Date.now() - 1000 * 60 * 10);
		const stalePush = new FanoutTimelinePush(stale);
		stalePush.add(home, 100);
		await stalePush.flush(runtime.redisForTimelines);
		expect((await list(home))[0]).toBe(stale);
	});

	test('splits more than 500 lists across several script calls', async () => {
		const id = genId();
		const push = new FanoutTimelinePush(id);
		const timelines = Array.from({ length: 501 }, (_, i) => timeline(`many${i}`));
		for (const tl of timelines) {
			push.add(tl, 5);
		}
		await push.flush(runtime.redisForTimelines);

		expect(await list(timelines[0]!)).toEqual([id]);
		expect(await list(timelines[500]!)).toEqual([id]);
	});

	test('does nothing without targets', async () => {
		await expect(new FanoutTimelinePush(genId()).flush(runtime.redisForTimelines)).resolves.toBeUndefined();
	});
});
