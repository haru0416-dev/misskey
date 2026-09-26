/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import type { Config } from '@/config.js';
import { createBunSqlClient } from '@/db/bun-sql.js';

// Bun.sql の idleTimeout は応答待ちのクエリの途中でも接続を切る。migration の接続は無効にしないと、
// 数十秒かかる DDL (30 万件の投稿への trigram index の作成など) が途中で失敗する。
describe('createBunSqlClient idle timeout', () => {
	const config = loadConfig();
	const withIdleTimeout = (ms: number): Config => ({
		...config,
		database: { ...config.database, pool: { ...config.database.pool, idleConnectionTimeoutMs: ms } },
	});

	const sleepOnReserved = async (sql: ReturnType<typeof createBunSqlClient>) => {
		const reserved = await sql.reserve();
		try {
			await reserved.unsafe('SELECT pg_sleep(1.5)');
		} finally {
			reserved.release();
			await sql.close({ timeout: 0 });
		}
	};

	test('the pool idle timeout cuts a running query', async () => {
		await expect(sleepOnReserved(createBunSqlClient(withIdleTimeout(1000), 1))).rejects.toThrow(/idle timeout/i);
	});

	test('idleTimeoutSeconds 0 lets a long statement finish', async () => {
		await expect(
			sleepOnReserved(createBunSqlClient(withIdleTimeout(1000), 1, { idleTimeoutSeconds: 0 })),
		).resolves.toBeUndefined();
	});
});
