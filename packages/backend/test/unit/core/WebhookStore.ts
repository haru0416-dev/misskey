/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { SQL as NativeSqlClient, ReservedSQL } from 'bun';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { countWebhooksByUserIdFromDatabase, createWebhookWithinLimitInDatabase } from '@/core/webhook/WebhookStore.js';
import { user } from '@/db/schema/user.js';
import { createBunSqlDatabase, createBunSqlClient } from '@/db/bun-sql.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

describe('WebhookStore', () => {
	const userId = 'webhook-limit-user';
	let blockerPool: NativeSqlClient;
	let firstPool: NativeSqlClient;
	let secondPool: NativeSqlClient;
	let firstDb: MiDrizzleDatabase;
	let secondDb: MiDrizzleDatabase;

	async function waitForTwoAdvisoryLockWaiters(blocker: ReservedSQL): Promise<void> {
		const [[count] = []] = await blocker
			.unsafe(`SELECT count(*)::text AS count FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`)
			.values();
		if (Number(count ?? 0) >= 2) {
			return;
		}
		await new Promise<void>((resolve) => setImmediate(resolve));
		return await waitForTwoAdvisoryLockWaiters(blocker);
	}

	beforeAll(async () => {
		const config = loadConfig();
		blockerPool = createBunSqlClient(config);
		firstPool = createBunSqlClient(config);
		secondPool = createBunSqlClient(config);
		firstDb = createBunSqlDatabase(firstPool, config);
		secondDb = createBunSqlDatabase(secondPool, config);
		await firstDb.insert(user).values({
			id: userId,
			username: 'webhook_limit_user',
			usernameLower: 'webhook_limit_user',
		});
	});

	afterAll(async () => {
		await Promise.all([blockerPool.close(), firstPool.close(), secondPool.close()]);
	});

	test('two concurrent creates at the limit cannot both succeed', async () => {
		const blocker = await blockerPool.reserve();
		try {
			await blocker.unsafe('BEGIN');
			await blocker.unsafe("SELECT pg_advisory_xact_lock(hashtext('webhook-limit'), hashtext($1))", [userId]);

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
			await blocker.unsafe('COMMIT');
			const results = await resultsPromise;
			expect(results.filter((result) => result != null).length).toBe(1);
			expect(await countWebhooksByUserIdFromDatabase(firstDb, userId)).toBe(1);
		} finally {
			blocker.release();
		}
	});
});
