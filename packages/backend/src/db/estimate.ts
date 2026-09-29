/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { MiDrizzleDatabase } from '@/drizzle.js';

/**
 * 問い合わせが返す行数のプランナーの見積もり。実行はしないので 1 ms 未満で返る。
 * LIKE の一致件数は、多い語ではよく合い、少ない語では少なめに外れる (実測は呼び出し元に書く)。
 */
export async function estimateRows(db: MiDrizzleDatabase, query: SQL): Promise<number> {
	const result = await db.execute<{ 'QUERY PLAN': unknown }>(sql`EXPLAIN (FORMAT JSON) ${query}`);
	const plan = result.rows[0]?.['QUERY PLAN'];
	const parsed = (typeof plan === 'string' ? JSON.parse(plan) : plan) as [{ Plan: { 'Plan Rows': number } }];
	return parsed[0].Plan['Plan Rows'];
}
