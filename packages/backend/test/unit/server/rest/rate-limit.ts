/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import type * as Redis from 'ioredis';
import type { Config } from '@/config.js';

const { randomUUIDMock } = vi.hoisted(() => ({
	randomUUIDMock: vi.fn(),
}));

vi.mock('node:crypto', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:crypto')>()),
	randomUUID: randomUUIDMock,
}));

import { isApiRateLimited, isApiRateLimitedForUser } from '@/server/rest/rate-limit.js';

type MultiResult = [Error | null, unknown][];

function createRedis(
	options: {
		time?: [string, string];
		count?: number;
	} = {},
) {
	const calls: string[] = [];
	const zremrangebyscore = vi.fn(() => {
		calls.push('zremrangebyscore');
		return multi;
	});
	const zcard = vi.fn(() => {
		calls.push('zcard');
		return multi;
	});
	const zadd = vi.fn(() => {
		calls.push('zadd');
		return multi;
	});
	const pexpire = vi.fn(() => {
		calls.push('pexpire');
		return multi;
	});
	const exec = vi.fn(async (): Promise<MultiResult> => {
		calls.push('exec');
		return [
			[null, 0],
			[null, options.count ?? 0],
			[null, 1],
			[null, 1],
		];
	});
	const multi = { zremrangebyscore, zcard, zadd, pexpire, exec };
	const time = vi.fn(async (): Promise<[string, string]> => {
		calls.push('time');
		return options.time ?? ['100', '250000'];
	});
	const redis = {
		time,
		multi: vi.fn(() => {
			calls.push('multi');
			return multi;
		}),
	} as unknown as Redis.Redis;

	return { calls, exec, multi: redis.multi, pexpire, redis, time, zadd, zcard, zremrangebyscore };
}

function config(ipRateLimit: boolean): Config {
	return {
		server: {
			http: { ipRateLimit },
		},
	} as Config;
}

describe('API rate limiter', () => {
	afterEach(() => {
		process.env['NODE_ENV'] = 'test';
		vi.clearAllMocks();
	});

	test('uses Valkey TIME for the sliding window score', async () => {
		process.env['NODE_ENV'] = 'production';
		randomUUIDMock.mockReturnValue('request-1');
		const redis = createRedis({ time: ['123', '456789'] });
		const dateNow = vi.spyOn(Date, 'now').mockReturnValue(999_999_999);

		await isApiRateLimited(
			{ config: config(true), redis: redis.redis },
			{
				key: 'test',
				duration: 1000,
				max: 2,
			},
			'actor',
		);

		expect(redis.calls).toEqual(['time', 'multi', 'zremrangebyscore', 'zcard', 'zadd', 'pexpire', 'exec']);
		expect(redis.zremrangebyscore).toHaveBeenCalledWith('limit:actor:test', 0, 122_456_789);
		expect(redis.zadd).toHaveBeenCalledWith('limit:actor:test', 123_456_789, 'request-1');
		expect(dateNow).not.toHaveBeenCalled();
	});

	test('uses a distinct ZSET member for requests with the same server time', async () => {
		process.env['NODE_ENV'] = 'production';
		randomUUIDMock.mockReturnValueOnce('request-1').mockReturnValueOnce('request-2');
		const redis = createRedis({ time: ['123', '456789'] });
		const deps = { config: config(true), redis: redis.redis };
		const limitation = { key: 'test', duration: 1000, max: 2 };

		await isApiRateLimited(deps, limitation, 'actor');
		await isApiRateLimited(deps, limitation, 'actor');

		expect(redis.zadd).toHaveBeenNthCalledWith(1, 'limit:actor:test', 123_456_789, 'request-1');
		expect(redis.zadd).toHaveBeenNthCalledWith(2, 'limit:actor:test', 123_456_789, 'request-2');
	});

	test.each([
		['duration', { key: 'test', minInterval: 1000, duration: Number.POSITIVE_INFINITY, max: 1 }, 1],
		['derived minInterval', { key: 'test', minInterval: Number.MAX_VALUE }, 2],
	] as const)('rejects non-finite %s before Valkey access', async (_label, limitation, factor) => {
		process.env['NODE_ENV'] = 'production';
		const redis = createRedis();

		await expect(
			isApiRateLimitedForUser({ config: config(true), redis: redis.redis }, limitation, 'actor', factor),
		).rejects.toThrow('rate limiter duration must be finite');

		expect(redis.time).not.toHaveBeenCalled();
		expect(redis.multi).not.toHaveBeenCalled();
	});

	test('ipRateLimit=false skips IP actors but preserves authenticated user quotas', async () => {
		process.env['NODE_ENV'] = 'production';
		randomUUIDMock.mockReturnValue('request-1');
		const ipRedis = createRedis({ count: 1 });
		const userRedis = createRedis({ count: 1 });
		const limitation = { key: 'test', duration: 1000, max: 1 };

		await expect(
			isApiRateLimited({ config: config(false), redis: ipRedis.redis }, limitation, '127.0.0.1'),
		).resolves.toBe(false);
		await expect(
			isApiRateLimitedForUser({ config: config(false), redis: userRedis.redis }, limitation, 'user-id'),
		).resolves.toBe(true);

		expect(ipRedis.time).not.toHaveBeenCalled();
		expect(ipRedis.multi).not.toHaveBeenCalled();
		expect(userRedis.time).toHaveBeenCalledOnce();
		expect(userRedis.multi).toHaveBeenCalledOnce();
	});
});
