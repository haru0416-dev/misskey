/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { countWebhooksByUserIdFromDatabase, createWebhookWithinLimitInDatabase } from '@/core/WebhookStore.js';
import { user } from '@/db/schema/user.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase, type MiDrizzlePool } from '@/drizzle.js';

describe('WebhookStore', () => {
	const userId = 'webhook-limit-user';
	let blockerPool: MiDrizzlePool;
	let firstPool: MiDrizzlePool;
	let secondPool: MiDrizzlePool;
	let firstDb: MiDrizzleDatabase;
	let secondDb: MiDrizzleDatabase;

	async function waitForTwoAdvisoryLockWaiters(blocker: PoolClient): Promise<void> {
		const waiting = await blocker.query<{ count: string }>(
			`SELECT count(*)::text AS count FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`,
		);
		if (Number(waiting.rows[0]?.count ?? 0) >= 2) return;
		await new Promise<void>((resolve) => setImmediate(resolve));
		return await waitForTwoAdvisoryLockWaiters(blocker);
	}

	beforeAll(async () => {
		const config = loadConfig();
		blockerPool = createDrizzlePool(config);
		firstPool = createDrizzlePool(config);
		secondPool = createDrizzlePool(config);
		firstDb = createDrizzleDatabase(firstPool, config);
		secondDb = createDrizzleDatabase(secondPool, config);
		await firstDb.insert(user).values({
			id: userId,
			username: 'webhook_limit_user',
			usernameLower: 'webhook_limit_user',
		});
	});

	afterAll(async () => {
		await Promise.all([blockerPool.end(), firstPool.end(), secondPool.end()]);
	});

	test('two concurrent creates at the limit cannot both succeed', async () => {
		const blocker = await blockerPool.connect();
		try {
			await blocker.query('BEGIN');
			await blocker.query("SELECT pg_advisory_xact_lock(hashtext('webhook-limit'), hashtext($1))", [userId]);

			const resultsPromise = Promise.all(
				[firstDb, secondDb].map((db, index) =>
					createWebhookWithinLimitInDatabase(
						db,
						{
							id: `webhook-limit-${index}`,
							userId,
							name: `race ${index}`,
							url: `https://example.com/webhook/${index}`,
							secret: '',
							on: ['note'],
						},
						1,
					),
				),
			);

			await waitForTwoAdvisoryLockWaiters(blocker);
			await blocker.query('COMMIT');
			const results = await resultsPromise;
			assert.strictEqual(results.filter((result) => result != null).length, 1);
			assert.strictEqual(await countWebhooksByUserIdFromDatabase(firstDb, userId), 1);
		} finally {
			blocker.release();
		}
	});
});
