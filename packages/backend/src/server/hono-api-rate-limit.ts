/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Limiter from 'ratelimiter';
import type * as Redis from 'ioredis';
import type { Config } from '@/config.js';

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

async function checkLimiter(options: Limiter.LimiterOption): Promise<Limiter.LimiterInfo> {
	return await new Promise<Limiter.LimiterInfo>((resolve, reject) => {
		new Limiter(options).get((err, info) => {
			if (err) {
				reject(err);
				return;
			}
			resolve(info);
		});
	});
}

export async function isHonoApiRateLimited(
	deps: HonoApiRateLimitDependencies,
	limitation: HonoApiRateLimit,
	actor: string,
	factor = 1,
): Promise<boolean> {
	if (!deps.config.enableIpRateLimit || process.env.NODE_ENV !== 'production') {
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
