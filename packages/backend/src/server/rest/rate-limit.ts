/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

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
	// 旧実装 (microtime) と同じくマイクロ秒スケールのスコアを使う。
	// Date.now() はミリ秒精度なので、同一ミリ秒内の zadd メンバー衝突を乱数で回避する。
	const now = Date.now() * 1000 + Math.floor(Math.random() * 1000);
	const start = now - options.duration * 1000;

	const res = await options.db.multi()
		.zremrangebyscore(key, 0, start)
		.zcard(key)
		.zadd(key, now, String(now))
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
	if (!deps.config.server.http.ipRateLimit || process.env.NODE_ENV !== 'production') {
		return false;
	}

	if (limitation.minInterval != null) {
		const info = await checkLimiter({
			id: `${actor}:${limitation.key}:min`,
			duration: limitation.minInterval * factor,
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
	if (await isHonoApiRateLimited(deps, {
		...limitation,
		key: limitation.key ?? endpointName,
	}, actor, factor)) {
		throw rateLimitExceededError();
	}
}

/**
 * 元の ApiCallService と同じく、認証済みユーザーにはロールポリシーの rateLimitFactor を適用する。
 * factor <= 0 はレート制限なし、1 未満は緩和、1 超は強化 (duration/max に反映される)。
 */
export async function assertHonoApiRateLimitForUser(
	deps: HonoApiRateLimitDependencies & HonoApiRolePolicyDependencies,
	endpointName: string,
	limitation: HonoApiEndpointRateLimit,
	user: MiUser,
): Promise<void> {
	const factor = (await getHonoApiRolePolicies(deps, user)).rateLimitFactor;
	if (factor <= 0) return;

	await assertHonoApiRateLimit(deps, endpointName, limitation, user.id, factor);
}
