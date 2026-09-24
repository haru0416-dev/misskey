/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type * as Redis from 'ioredis';
import { loadConfig } from '@/config.js';
import type { Config } from '@/config.js';
import { genId } from '@/misc/id/gen-id.js';
import { createRedisClient } from '@/runtime-dependencies.js';

const { randomUUIDMock } = vi.hoisted(() => ({
	randomUUIDMock: vi.fn(),
}));

vi.mock('node:crypto', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:crypto')>()),
	randomUUID: randomUUIDMock,
}));

import { isApiRateLimited, isApiRateLimitedForUser } from '@/server/rest/rate-limit.js';

function config(ipRateLimit: boolean): Config {
	return {
		server: {
			http: { ipRateLimit },
		},
	} as Config;
}

/** Valkey の TIME をマイクロ秒で返す。 */
async function serverTimeMicroseconds(redis: Redis.Redis): Promise<bigint> {
	const [seconds, microseconds] = await redis.time();
	if (seconds == null || microseconds == null) throw new Error('TIME returned no value');
	return BigInt(seconds) * 1_000_000n + BigInt(microseconds);
}

describe('API rate limiter', () => {
	let redis: Redis.Redis;

	beforeAll(() => {
		redis = createRedisClient(loadConfig());
	});

	afterAll(() => {
		redis.disconnect();
	});

	afterEach(() => {
		process.env['NODE_ENV'] = 'test';
		vi.clearAllMocks();
	});

	test('records each request in limit:{actor}:{key} with the Valkey server time in microseconds', async () => {
		process.env['NODE_ENV'] = 'production';
		randomUUIDMock.mockReturnValue('request-1');
		const actor = genId();

		const before = await serverTimeMicroseconds(redis);
		await isApiRateLimited({ config: config(true), redis }, { key: 'test', duration: 1000, max: 2 }, actor);
		const after = await serverTimeMicroseconds(redis);

		const entries = await redis.zrange(`limit:${actor}:test`, '0', '-1', 'WITHSCORES');
		expect(entries).toHaveLength(2);
		expect(entries[0]).toBe('request-1');
		// 16 桁のマイクロ秒を丸めずに整数のまま保存している。
		expect(entries[1]).toMatch(/^\d{16}$/);
		const score = BigInt(entries[1]!);
		expect(score >= before && score <= after).toBe(true);
		const ttl = await redis.pttl(`limit:${actor}:test`);
		expect(ttl).toBeGreaterThan(0);
		expect(ttl).toBeLessThanOrEqual(1000);
	});

	test('records requests with the same server time as distinct members', async () => {
		process.env['NODE_ENV'] = 'production';
		randomUUIDMock.mockReturnValueOnce('request-1').mockReturnValueOnce('request-2');
		const actor = genId();
		const deps = { config: config(true), redis };
		const limitation = { key: 'test', duration: 60_000, max: 5 };

		await isApiRateLimited(deps, limitation, actor);
		await isApiRateLimited(deps, limitation, actor);

		expect(await redis.zrange(`limit:${actor}:test`, '0', '-1')).toEqual(['request-1', 'request-2']);
	});

	test('limits once the window holds max requests and keeps recording while limited', async () => {
		process.env['NODE_ENV'] = 'production';
		randomUUIDMock.mockImplementation(genId);
		const actor = genId();
		const deps = { config: config(true), redis };
		const limitation = { key: 'test', duration: 60_000, max: 2 };

		const results = [];
		for (let i = 0; i < 4; i++) {
			results.push(await isApiRateLimited(deps, limitation, actor));
		}

		expect(results).toEqual([false, false, true, true]);
		expect(await redis.zcard(`limit:${actor}:test`)).toBe(4);
	});

	test('drops entries that fell out of the sliding window before counting', async () => {
		process.env['NODE_ENV'] = 'production';
		randomUUIDMock.mockReturnValue('fresh');
		const actor = genId();
		const now = await serverTimeMicroseconds(redis);
		await redis.zadd(`limit:${actor}:test`, (now - 5_000_000n).toString(), 'stale');

		await expect(
			isApiRateLimited({ config: config(true), redis }, { key: 'test', duration: 1000, max: 1 }, actor),
		).resolves.toBe(false);

		expect(await redis.zrange(`limit:${actor}:test`, '0', '-1')).toEqual(['fresh']);
	});

	test.each([
		['duration', { key: 'test', minInterval: 1000, duration: Number.POSITIVE_INFINITY, max: 1 }, 1],
		['derived minInterval', { key: 'test', minInterval: Number.MAX_VALUE }, 2],
	] as const)('rejects non-finite %s before Valkey access', async (_label, limitation, factor) => {
		process.env['NODE_ENV'] = 'production';
		const actor = genId();

		await expect(isApiRateLimitedForUser({ config: config(true), redis }, limitation, actor, factor)).rejects.toThrow(
			'rate limiter duration must be finite',
		);

		expect(await redis.keys(`limit:${actor}:*`)).toEqual([]);
	});

	test('ipRateLimit=false skips IP actors but preserves authenticated user quotas', async () => {
		process.env['NODE_ENV'] = 'production';
		randomUUIDMock.mockImplementation(genId);
		const ip = `192.0.2.${Math.floor(Math.random() * 250) + 1}-${genId()}`;
		const user = genId();
		const limitation = { key: 'test', duration: 60_000, max: 1 };
		const deps = { config: config(false), redis };

		await isApiRateLimited(deps, limitation, ip);
		await expect(isApiRateLimited(deps, limitation, ip)).resolves.toBe(false);
		await isApiRateLimitedForUser(deps, limitation, user);
		await expect(isApiRateLimitedForUser(deps, limitation, user)).resolves.toBe(true);

		expect(await redis.keys(`limit:${ip}:*`)).toEqual([]);
		expect(await redis.zcard(`limit:${user}:test`)).toBe(2);
	});
});
