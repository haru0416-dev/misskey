/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { getDatabaseErrorCode, isStatementTimeoutError } from '@/misc/db-errors.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';

// drizzle は PostgreSQL のエラーを "Failed query: ..." で包むので、実際に DB で起こしたエラーで判定を確かめる。
describe('misc:db-errors', () => {
	let runtime: RuntimeDependencies;

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	async function capture(run: () => Promise<unknown>): Promise<unknown> {
		try {
			await run();
		} catch (err) {
			return err;
		}
		throw new Error('expected the query to fail');
	}

	test('statement_timeout で打ち切られた問い合わせを見分ける', async () => {
		const err = await capture(() =>
			runtime.db.transaction(async (tx) => {
				await tx.execute(sql`SET LOCAL statement_timeout = '1ms'`);
				await tx.execute(sql`SELECT pg_sleep(1)`);
			}),
		);
		expect(getDatabaseErrorCode(err)).toBe('57014');
		expect(isStatementTimeoutError(err)).toBe(true);
	});

	test('他の DB エラーは時間切れとみなさない', async () => {
		const err = await capture(() => runtime.db.execute(sql`SELECT 1 / 0`));
		expect(getDatabaseErrorCode(err)).toBe('22012');
		expect(isStatementTimeoutError(err)).toBe(false);
		expect(isStatementTimeoutError(new Error('canceling statement due to statement timeout'))).toBe(false);
	});
});
