/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as dns from 'node:dns';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createCachedResolver } from '@/core/net/dns-cache.js';

describe('core:net:dns-cache', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	const mockLookup = (impl: (hostname: string) => Promise<{ address: string; family: number }[]>) =>
		vi.spyOn(dns.promises, 'lookup').mockImplementation(
			// all: true のときの戻り値だけを使う。
			((hostname: string) => impl(hostname)) as unknown as typeof dns.promises.lookup,
		);

	test('解決結果を返す', async () => {
		mockLookup(async () => [{ address: '93.184.216.34', family: 4 }]);
		const resolver = createCachedResolver({ successTtlMs: 1000, failureTtlMs: 1000 });

		await expect(resolver.resolve('example.com')).resolves.toStrictEqual([{ address: '93.184.216.34', family: 4 }]);
	});

	test('TTL の間は問い合わせ直さない', async () => {
		const spy = mockLookup(async () => [{ address: '1.2.3.4', family: 4 }]);
		const resolver = createCachedResolver({ successTtlMs: 10_000, failureTtlMs: 1000 });

		await resolver.resolve('example.com');
		await resolver.resolve('example.com');
		expect(spy).toHaveBeenCalledTimes(1);
	});

	test('TTL を過ぎたら問い合わせ直す', async () => {
		const spy = mockLookup(async () => [{ address: '1.2.3.4', family: 4 }]);
		const resolver = createCachedResolver({ successTtlMs: 0, failureTtlMs: 0 });

		await resolver.resolve('example.com');
		await resolver.resolve('example.com');
		expect(spy).toHaveBeenCalledTimes(2);
	});

	test('失敗も覚えるので短時間に問い合わせが集中しない', async () => {
		const spy = mockLookup(async () => {
			throw new Error('ENOTFOUND');
		});
		const resolver = createCachedResolver({ successTtlMs: 10_000, failureTtlMs: 10_000 });

		await expect(resolver.resolve('nope.invalid')).rejects.toThrow();
		await expect(resolver.resolve('nope.invalid')).rejects.toThrow();
		expect(spy).toHaveBeenCalledTimes(1);
	});

	test('空の結果は失敗として扱う', async () => {
		mockLookup(async () => []);
		const resolver = createCachedResolver({ successTtlMs: 1000, failureTtlMs: 1000 });

		await expect(resolver.resolve('empty.invalid')).rejects.toThrow(/Failed to resolve/);
	});

	describe('lookup (http.Agent 用)', () => {
		test('コールバック形式で先頭の結果を返す', async () => {
			mockLookup(async () => [
				{ address: '1.2.3.4', family: 4 },
				{ address: '5.6.7.8', family: 4 },
			]);
			const resolver = createCachedResolver({ successTtlMs: 1000, failureTtlMs: 1000 });

			const result = await new Promise<[string, number]>((resolve, reject) => {
				resolver.lookup('example.com', {}, (err, address, family) => {
					if (err) reject(err);
					else resolve([address as string, family as number]);
				});
			});
			expect(result).toStrictEqual(['1.2.3.4', 4]);
		});

		test('all: true では全件返す', async () => {
			mockLookup(async () => [
				{ address: '1.2.3.4', family: 4 },
				{ address: '::1', family: 6 },
			]);
			const resolver = createCachedResolver({ successTtlMs: 1000, failureTtlMs: 1000 });

			const result = await new Promise<unknown>((resolve, reject) => {
				resolver.lookup('example.com', { all: true }, (err, addresses) => {
					if (err) reject(err);
					else resolve(addresses);
				});
			});
			expect(result).toStrictEqual([
				{ address: '1.2.3.4', family: 4 },
				{ address: '::1', family: 6 },
			]);
		});

		test('family 指定で絞る', async () => {
			mockLookup(async () => [
				{ address: '1.2.3.4', family: 4 },
				{ address: '::1', family: 6 },
			]);
			const resolver = createCachedResolver({ successTtlMs: 1000, failureTtlMs: 1000 });

			const result = await new Promise<[string, number]>((resolve, reject) => {
				resolver.lookup('example.com', { family: 6 }, (err, address, family) => {
					if (err) reject(err);
					else resolve([address as string, family as number]);
				});
			});
			expect(result).toStrictEqual(['::1', 6]);
		});

		test('失敗はコールバックへ渡す (例外にしない)', async () => {
			mockLookup(async () => {
				throw new Error('ENOTFOUND');
			});
			const resolver = createCachedResolver({ successTtlMs: 1000, failureTtlMs: 1000 });

			const err = await new Promise<Error | null>((resolve) => {
				resolver.lookup('nope.invalid', {}, (e) => resolve(e));
			});
			expect(err).toBeInstanceOf(Error);
		});
	});
});
