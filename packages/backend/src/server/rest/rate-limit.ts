/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import type * as Redis from 'ioredis';
import type { Config } from '@/config.js';
import type { MiUser } from '@/models/User.js';
import { rateLimitExceededError } from './error.js';
import { getHonoApiRolePolicies, type HonoApiRolePolicyDependencies } from './role-policy.js';

export type HonoApiRateLimitDependencies = {
	config: Config;
	redis: Redis.Redis;
};

export type HonoApiRateLimit = {
	key: string;
	duration?: number;
	max?: number;
	minInterval?: number;
};

export type HonoApiEndpointRateLimit = Omit<HonoApiRateLimit, 'key'> & {
	key?: string;
};

function durationToMicroseconds(duration: number): number {
	const durationMicroseconds = duration * 1000;
	if (!Number.isFinite(durationMicroseconds)) {
		throw new TypeError('rate limiter duration must be finite');
	}
	return durationMicroseconds;
}

/**
 * `ratelimiter` パッケージと同じ sliding-window-log 方式・同じキー形式 (`limit:{id}` の zset)。
 * 窓内エントリ数を数えてから今回分を必ず追加する (= 制限超過中のリクエストも窓を延長する) 点も踏襲。
 */
async function checkLimiter(options: {
	id: string;
	duration: number;
	max: number;
	db: Redis.Redis;
}): Promise<{ remaining: number }> {
	const key = `limit:${options.id}`;
	const durationMicroseconds = durationToMicroseconds(options.duration);

	const [seconds, microseconds] = await options.db.time();
	const now = Number(seconds) * 1_000_000 + Number(microseconds);
	if (!Number.isFinite(now)) {
		throw new TypeError('rate limiter received invalid server time');
	}
	const start = now - durationMicroseconds;

	const res = await options.db
		.multi()
		.zremrangebyscore(key, 0, start)
		.zcard(key)
		.zadd(key, now, randomUUID())
		.pexpire(key, options.duration)
		.exec();

	if (res == null) throw new Error('rate limiter transaction failed');
	const zcard = res[1];
	if (zcard?.[0] != null) throw zcard[0];
	const count = Number(zcard?.[1] ?? 0);

	return { remaining: count < options.max ? options.max - count : 0 };
}

export async function isHonoApiRateLimited(
	deps: HonoApiRateLimitDependencies,
	limitation: HonoApiRateLimit,
	actor: string,
	factor = 1,
): Promise<boolean> {
	if (!deps.config.server.http.ipRateLimit || process.env['NODE_ENV'] !== 'production') {
		return false;
	}

	return await isHonoApiRateLimitedForUser(deps, limitation, actor, factor);
}

export async function isHonoApiRateLimitedForUser(
	deps: HonoApiRateLimitDependencies,
	limitation: HonoApiRateLimit,
	actor: string,
	factor = 1,
): Promise<boolean> {
	if (process.env['NODE_ENV'] !== 'production') {
		return false;
	}

	const minInterval = limitation.minInterval == null ? null : limitation.minInterval * factor;
	if (minInterval != null) durationToMicroseconds(minInterval);
	if (limitation.duration != null && limitation.max != null) durationToMicroseconds(limitation.duration);

	if (minInterval != null) {
		const info = await checkLimiter({
			id: `${actor}:${limitation.key}:min`,
			duration: minInterval,
			max: 1,
			db: deps.redis,
		});

		if (info.remaining === 0) {
			return true;
		}
	}

	if (limitation.duration != null && limitation.max != null) {
		const info = await checkLimiter({
			id: `${actor}:${limitation.key}`,
			duration: limitation.duration,
			max: limitation.max / factor,
			db: deps.redis,
		});

		if (info.remaining === 0) {
			return true;
		}
	}

	return false;
}

export async function assertHonoApiRateLimit(
	deps: HonoApiRateLimitDependencies,
	endpointName: string,
	limitation: HonoApiEndpointRateLimit,
	actor: string,
	factor = 1,
): Promise<void> {
	if (
		await isHonoApiRateLimited(
			deps,
			{
				...limitation,
				key: limitation.key ?? endpointName,
			},
			actor,
			factor,
		)
	) {
		throw rateLimitExceededError();
	}
}

/**
 * 元の ApiCallService と同じく、認証済みユーザーにはロールポリシーの rateLimitFactor を適用する。
 * factor <= 0 はレート制限なし、1 未満は緩和、1 超は強化 (minInterval/max に反映される)。
 */
export async function assertHonoApiRateLimitForUser(
	deps: HonoApiRateLimitDependencies & HonoApiRolePolicyDependencies,
	endpointName: string,
	limitation: HonoApiEndpointRateLimit,
	user: MiUser,
): Promise<void> {
	const factor = (await getHonoApiRolePolicies(deps, user)).rateLimitFactor;
	if (factor <= 0) return;

	if (
		await isHonoApiRateLimitedForUser(
			deps,
			{
				...limitation,
				key: limitation.key ?? endpointName,
			},
			user.id,
			factor,
		)
	) {
		throw rateLimitExceededError();
	}
}
