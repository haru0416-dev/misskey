/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createBunSqlClient, createBunSqlDatabase } from '@/db/bun-sql.js';
import { memoizeInRequest, runInRequestScope } from '@/misc/request-scope.js';

// 接続 1 本のプールで並行に transaction を開くと、後続は接続の空き待ちを挟む。Bun.sql はその後の callback を
// 接続を返した側の非同期文脈で呼ぶため、呼び出し元の AsyncLocalStorage が callback 内で保たれるかを検査する。
describe('Bun.sql transaction callbacks keep the caller async context', () => {
	const config = loadConfig();
	const client = createBunSqlClient(config, 1);
	const db = createBunSqlDatabase(client, config);
	const context = new AsyncLocalStorage<number>();
	const callers = Array.from({ length: 8 }, (_, i) => i);

	afterAll(async () => {
		await client.close({ timeout: 0 });
	});

	test('transaction and nested transaction callbacks see the caller store', async () => {
		const observed = await Promise.all(
			callers.map((caller) =>
				context.run(caller, async () => {
					const seen: (number | undefined)[] = [];
					for (let round = 0; round < 3; round++) {
						await db.transaction(async (tx) => {
							seen.push(context.getStore());
							await tx.execute(sql`SELECT 1`);
							seen.push(context.getStore());
							await tx.transaction(async (nested) => {
								seen.push(context.getStore());
								await nested.execute(sql`SELECT 1`);
							});
							seen.push(context.getStore());
						});
					}
					return seen;
				}),
			),
		);

		expect(observed).toEqual(callers.map((caller) => Array.from({ length: 12 }, () => caller)));
	});

	test('a request-scoped memo inside a transaction belongs to its own request', async () => {
		const results = await Promise.all(
			callers.map((caller) =>
				runInRequestScope(async () => {
					await memoizeInRequest('caller', async () => caller);
					return db.transaction(async () => memoizeInRequest('caller', async () => -1));
				}),
			),
		);

		expect(results).toEqual(callers);
	});
});
