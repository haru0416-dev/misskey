/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { genId } from '@/misc/id/gen-id.js';
import { createRedisClient } from '@/runtime-dependencies.js';
import { tryLockFetchInstanceMetadata, unlockFetchInstanceMetadata } from '@/server/rest/activitypub/federation.js';

describe('federation metadata lock', () => {
	test('独立したクライアントのうち一方だけが取得でき、解除後は再取得できる', async () => {
		const config = loadConfig();
		const first = createRedisClient(config);
		const second = createRedisClient(config);
		const host = `mutex-${genId()}.example.test`;

		try {
			const results = await Promise.all([
				tryLockFetchInstanceMetadata({ redis: first }, host),
				tryLockFetchInstanceMetadata({ redis: second }, host),
			]);
			expect(results.filter((result) => result === null)).toHaveLength(1);
			// 取得したプロセスが解除前に落ちても、ロックは期限で消える。
			const ttl = await first.ttl(`fetchInstanceMetadata:mutex:v2:${host}`);
			expect(ttl).toBeGreaterThan(0);
			expect(ttl).toBeLessThanOrEqual(30);
			expect(await tryLockFetchInstanceMetadata({ redis: first }, host)).not.toBeNull();
			expect(await tryLockFetchInstanceMetadata({ redis: second }, host)).not.toBeNull();

			await unlockFetchInstanceMetadata({ redis: first }, host);
			expect(await tryLockFetchInstanceMetadata({ redis: second }, host)).toBeNull();
		} finally {
			try {
				await unlockFetchInstanceMetadata({ redis: first }, host);
			} finally {
				first.disconnect();
				second.disconnect();
			}
		}
	});
});
