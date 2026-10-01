/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { MiDrizzleDatabase } from '@/drizzle.js';

/**
 * EXPLAIN の行数見積もりを返し、対象の問い合わせ自体は実行しない。
 * 実際の一致件数ではないため、件数の確定には使わない。
 */
export async function estimateRows(db: MiDrizzleDatabase, query: SQL): Promise<number> {
	const result = await db.execute<{ 'QUERY PLAN': unknown }>(sql`EXPLAIN (FORMAT JSON) ${query}`);
	const plan = result.rows[0]?.['QUERY PLAN'];
	const parsed = (typeof plan === 'string' ? JSON.parse(plan) : plan) as [{ Plan: { 'Plan Rows': number } }];
	return parsed[0].Plan['Plan Rows'];
}
