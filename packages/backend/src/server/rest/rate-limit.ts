/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import type * as Redis from 'ioredis';
import type { Config } from '@/config.js';
import type { MiUser } from '@/models/User.js';
import { rateLimitExceededError } from './error.js';
import { getApiRolePolicies } from './role/role-policy.js';
import type { ApiRolePolicyDependencies } from './role/role-policy.js';

export type ApiRateLimitDependencies = {
	config: Config;
	redis: Redis.Redis;
};

export type ApiRateLimit = {
	key: string;
	duration?: number;
	max?: number;
	minInterval?: number;
};

export type ApiEndpointRateLimit = Omit<ApiRateLimit, 'key'> & {
	key?: string;
};

function durationToMicroseconds(duration: number): number {
	const durationMicroseconds = duration * 1000;
	if (!Number.isFinite(durationMicroseconds)) {
		throw new TypeError('rate limiter duration must be finite');
	}
	return durationMicroseconds;
}

/*
 * sliding-window-log 方式と `limit:{id}` の zset キー形式を使う。
 * 窓内エントリ数を数えてから今回分を必ず追加し、制限超過中のリクエストも窓を延長する。
 *
 * 時刻は Valkey の TIME を使い、窓の掃除・計数・追加・期限設定まで 1 スクリプトで行う。
 * TIME と MULTI を別に送ると、レート制限付きの全 API で 1 リクエストあたり 2 往復になる。
 * マイクロ秒の時刻は 16 桁だが 2^53 未満なので double で誤差なく表せ、redis.call は数値を丸めずに渡す
 * (Lua の tostring は 14 桁に丸めるので、文字列化して渡さない)。
 */
const LIMIT_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000000 + tonumber(time[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - tonumber(ARGV[1]))
local count = redis.call('ZCARD', KEYS[1])
redis.call('ZADD', KEYS[1], now, ARGV[2])
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return count
`;

const COMMAND_NAME = 'tonerikoCheckRateLimit';

type LimitCommander = {
	[COMMAND_NAME]: (
		key: string,
		durationMicroseconds: number,
		member: string,
		durationMilliseconds: number,
	) => Promise<number>;
};

const definedClients = new WeakSet<Redis.Redis>();

/** ioredis の defineCommand は EVALSHA を試して NOSCRIPT なら EVAL に切り替える。接続ごとに 1 度だけ登録する。 */
function commander(redis: Redis.Redis): LimitCommander {
	if (!definedClients.has(redis)) {
		redis.defineCommand(COMMAND_NAME, { numberOfKeys: 1, lua: LIMIT_SCRIPT });
		definedClients.add(redis);
	}
	return redis as unknown as LimitCommander;
}

async function checkLimiter(options: {
	id: string;
	duration: number;
	max: number;
	db: Redis.Redis;
}): Promise<{ remaining: number }> {
	const durationMicroseconds = durationToMicroseconds(options.duration);
	const count = Number(
		await commander(options.db)[COMMAND_NAME](
			`limit:${options.id}`,
			durationMicroseconds,
			randomUUID(),
			options.duration,
		),
	);
	return { remaining: count < options.max ? options.max - count : 0 };
}

export async function isApiRateLimited(
	deps: ApiRateLimitDependencies,
	limitation: ApiRateLimit,
	actor: string,
	factor = 1,
): Promise<boolean> {
	if (!deps.config.server.http.ipRateLimit || process.env['NODE_ENV'] !== 'production') {
		return false;
	}

	return await isApiRateLimitedForUser(deps, limitation, actor, factor);
}

export async function isApiRateLimitedForUser(
	deps: ApiRateLimitDependencies,
	limitation: ApiRateLimit,
	actor: string,
	factor = 1,
): Promise<boolean> {
	if (process.env['NODE_ENV'] !== 'production') {
		return false;
	}

	const minInterval = limitation.minInterval == null ? null : limitation.minInterval * factor;
	if (minInterval != null) {
		durationToMicroseconds(minInterval);
	}
	if (limitation.duration != null && limitation.max != null) {
		durationToMicroseconds(limitation.duration);
	}

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

export async function assertApiRateLimit(
	deps: ApiRateLimitDependencies,
	endpointName: string,
	limitation: ApiEndpointRateLimit,
	actor: string,
	factor = 1,
): Promise<void> {
	if (
		await isApiRateLimited(
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
 * 認証済みユーザーにはロールポリシーの rateLimitFactor を適用する。
 * factor <= 0 はレート制限なし、1 未満は緩和、1 超は強化 (minInterval/max に反映される)。
 */
export async function assertApiRateLimitForUser(
	deps: ApiRateLimitDependencies & ApiRolePolicyDependencies,
	endpointName: string,
	limitation: ApiEndpointRateLimit,
	user: MiUser,
): Promise<void> {
	const factor = (await getApiRolePolicies(deps, user)).rateLimitFactor;
	if (factor <= 0) {
		return;
	}

	if (
		await isApiRateLimitedForUser(
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
