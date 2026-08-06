/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

const releaseLockScript = `
if redis.call('get', KEYS[1]) == ARGV[1] then
	return redis.call('del', KEYS[1])
end
return 0
`;

/**
 * 自動延長しない固定期限のleaseを取得する。
 * token付き解放により、期限切れ後の旧ownerが新しいleaseを削除することだけは防ぐ。
 */
export async function acquireDistributedLock(
	redis: Redis.Redis,
	name: string,
	timeout: number,
	maxRetries: number,
	retryInterval: number,
): Promise<() => Promise<void>> {
	const lockKey = `lock:${name}`;
	const identifier = randomUUID();

	let retries = 0;
	while (retries < maxRetries) {
		const result = await redis.set(lockKey, identifier, 'PX', timeout, 'NX');
		if (result === 'OK') {
			return async () => {
				await redis.eval(releaseLockScript, 1, lockKey, identifier);
			};
		}

		await new Promise((resolve) => setTimeout(resolve, retryInterval));
		retries++;
	}

	throw new Error(`Failed to acquire lock ${name}`);
}

export function acquireApObjectLock(redis: Redis.Redis, uri: string): Promise<() => Promise<void>> {
	return acquireDistributedLock(redis, `ap-object:${uri}`, 30 * 1000, 50, 100);
}

export function acquireChartInsertLock(redis: Redis.Redis, name: string): Promise<() => Promise<void>> {
	return acquireDistributedLock(redis, `chart-insert:${name}`, 30 * 1000, 50, 500);
}
