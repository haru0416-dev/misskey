/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { SQL as NativeSqlClient } from 'bun';
import { loadConfig } from '@/config.js';
import { createBunSqlClient, createBunSqlDatabase } from '@/db/bun-sql.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { fetchOrRegisterFederatedInstance } from '@/server/rest/activitypub/federation.js';

// 初回の受信も並行して届くため、同じホストの登録は一意制約違反を起こさず同じ行を返す必要がある。
describe('fetchOrRegisterFederatedInstance', () => {
	let pool: NativeSqlClient;
	let db: MiDrizzleDatabase;

	beforeAll(() => {
		const config = loadConfig();
		pool = createBunSqlClient(config);
		db = createBunSqlDatabase(pool, config);
	});

	afterAll(async () => {
		await pool.close();
	});

	test('同じ新しいホストを並行して登録しても 1 件にまとまり、失敗しない', async () => {
		const host = `concurrent-${genId()}.example.com`;
		const results = await Promise.all(Array.from({ length: 10 }, () => fetchOrRegisterFederatedInstance({ db }, host)));
		expect(new Set(results.map((instance) => instance.id)).size).toBe(1);
		expect(results.every((instance) => instance.host === host)).toBe(true);
	});
});
