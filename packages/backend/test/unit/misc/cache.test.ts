/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryKVCache, createMemorySingleCache } from '@/misc/cache.js';

test('MemoryKVCache permits process exit while cached values remain', async () => {
	const moduleUrl = new URL('../../../src/misc/cache.ts', import.meta.url).href;
	const { stdout } = await promisify(execFile)(
		process.execPath,
		[
			'--eval',
			`import { createMemoryKVCache } from ${JSON.stringify(moduleUrl)};
			const cache = createMemoryKVCache(60_000);
			cache.set('key', 'cached');
			console.log(cache.get('key'));`,
		],
		{ timeout: 5000 },
	);
	expect(stdout.trim()).toBe('cached');
});

describe('misc:MemoryKVCache', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test('get returns undefined after lifetime expires', () => {
		const cache = createMemoryKVCache<string>(1000);
		cache.set('key', 'value');
		vi.advanceTimersByTime(1001);
		expect(cache.get('key')).toBeUndefined();
		cache.dispose();
	});

	test('delete removes the entry', () => {
		const cache = createMemoryKVCache<string>(1000);
		cache.set('key', 'value');
		cache.delete('key');
		expect(cache.get('key')).toBeUndefined();
		cache.dispose();
	});

	test('keeps current behavior when limit is omitted', () => {
		const cache = createMemoryKVCache<number>(1000 * 60);
		cache.set('a', 1);
		cache.set('b', 2);
		cache.set('c', 3);
		expect(cache.get('a')).toBe(1);
		expect(cache.get('b')).toBe(2);
		expect(cache.get('c')).toBe(3);
		cache.dispose();
	});

	test('evicts the least recently used entry when limit is reached', () => {
		const cache = createMemoryKVCache<number>(1000 * 60, 2);
		cache.set('a', 1);
		cache.set('b', 2);
		expect(cache.get('a')).toBe(1);
		cache.set('c', 3);
		expect(cache.get('a')).toBe(1);
		expect(cache.get('b')).toBeUndefined();
		expect(cache.get('c')).toBe(3);
		cache.dispose();
	});

	test.each([0, -1, 1.5, Infinity, Number.NaN])('rejects invalid limit %s', (limit) => {
		expect(() => createMemoryKVCache(1000, limit)).toThrow(TypeError);
	});

	describe('gc()', () => {
		// Map は既存キーを更新しても挿入位置を保持するため、
		// gc() がキーを時刻順と仮定すると、更新済みの有効なキーで走査を止めて
		// 後続の期限切れキーを残す。get() の判定とは別に Map から削除されることを確認する。
		test('correctly expires old entries after a key is updated (issue #15500)', () => {
			const lifetime = 1000;
			const cache = createMemoryKVCache<string>(lifetime);

			cache.set('a', 'v1');
			cache.set('b', 'v1');

			vi.advanceTimersByTime(500);
			cache.set('a', 'v2');

			vi.advanceTimersByTime(600);

			cache.gc();

			const entries = [...cache.entries];
			expect(entries.find(([k]) => k === 'b')).toBeUndefined();
			expect(entries.find(([k]) => k === 'a')?.[1].value).toBe('v2');
			cache.dispose();
		});
	});

	test('set does not cause active entries iteration to revisit the same key', () => {
		const cache = createMemoryKVCache<{ id: string }>(1000);
		cache.set('key', { id: 'user-1' });

		let iterations = 0;
		for (const [key, { value }] of cache.entries) {
			iterations++;
			if (value.id === 'user-1') {
				cache.set(key, value);
			}

			expect(iterations).toBeLessThan(3);
		}

		expect(iterations).toBe(1);
		cache.dispose();
	});

	describe('fetch()', () => {
		test('caches fetched values and replaces values rejected by the validator', async () => {
			const cache = createMemoryKVCache<string>(1000);
			const fetcher = vi.fn().mockResolvedValueOnce('fetched').mockResolvedValueOnce('updated');

			expect(await cache.fetch('key', fetcher)).toBe('fetched');
			expect(fetcher).toHaveBeenCalledOnce();
			expect(await cache.fetch('key', fetcher)).toBe('fetched');
			expect(fetcher).toHaveBeenCalledOnce();

			expect(await cache.fetch('key', fetcher, () => false)).toBe('updated');
			expect(fetcher).toHaveBeenCalledTimes(2);
			expect(await cache.fetch('key', fetcher)).toBe('updated');
			expect(fetcher).toHaveBeenCalledTimes(2);
			cache.dispose();
		});
	});

	describe('fetchMaybe()', () => {
		test('does not cache undefined returned by fetcher', async () => {
			const cache = createMemoryKVCache<string>(1000);
			const fetcher = vi.fn().mockResolvedValue(undefined);
			const result = await cache.fetchMaybe('key', fetcher);
			expect(result).toBeUndefined();
			await cache.fetchMaybe('key', fetcher);
			expect(fetcher).toHaveBeenCalledTimes(2);
			cache.dispose();
		});

		test('shares an in-flight fetch for the same key', async () => {
			const cache = createMemoryKVCache<string>(1000);
			let resolveFetch!: (value: string) => void;
			const fetcher = vi.fn(
				() =>
					new Promise<string>((resolve) => {
						resolveFetch = resolve;
					}),
			);

			const first = cache.fetchMaybe('key', fetcher);
			const second = cache.fetchMaybe('key', fetcher);
			expect(fetcher).toHaveBeenCalledOnce();

			resolveFetch('fetched');
			await expect(Promise.all([first, second])).resolves.toEqual(['fetched', 'fetched']);
			cache.dispose();
		});
	});
});

describe('misc:MemorySingleCache', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test('set and get returns the value within lifetime', () => {
		const cache = createMemorySingleCache<string>(1000);
		cache.set('value');
		expect(cache.get()).toBe('value');
	});

	test('get returns undefined after lifetime expires', () => {
		const cache = createMemorySingleCache<string>(1000);
		cache.set('value');
		vi.advanceTimersByTime(1001);
		expect(cache.get()).toBeUndefined();
	});

	test('delete removes the cached value', () => {
		const cache = createMemorySingleCache<string>(1000);
		cache.set('value');
		cache.delete();
		expect(cache.get()).toBeUndefined();
	});

	describe('fetch()', () => {
		test('caches fetched values and replaces values rejected by the validator', async () => {
			const cache = createMemorySingleCache<string>(1000);
			const fetcher = vi.fn().mockResolvedValueOnce('fetched').mockResolvedValueOnce('updated');

			expect(await cache.fetch(fetcher)).toBe('fetched');
			expect(fetcher).toHaveBeenCalledOnce();
			expect(await cache.fetch(fetcher)).toBe('fetched');
			expect(fetcher).toHaveBeenCalledOnce();

			expect(await cache.fetch(fetcher, () => false)).toBe('updated');
			expect(fetcher).toHaveBeenCalledTimes(2);
			expect(await cache.fetch(fetcher)).toBe('updated');
			expect(fetcher).toHaveBeenCalledTimes(2);
		});
	});
});
