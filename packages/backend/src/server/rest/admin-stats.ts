/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAdminStatsDependencies = {
	db: MiDrizzleDatabase;
};

type IndexStatsResponse = {
	tablename: string;
	indexname: string;
}[];

type TableStatsResponse = Record<string, {
	count: number;
	size: number;
}>;

const adminStatsParamDef = z.object({});

export async function handleHonoApiAdminGetIndexStats(
	deps: HonoApiAdminStatsDependencies,
	body: Record<string, unknown>,
): Promise<IndexStatsResponse> {
	parseHonoApiParams(adminStatsParamDef, body);

	const result = await deps.db.execute<{
		tablename: string;
		indexname: string;
	}>(sql`SELECT * FROM pg_indexes;`);

	return result.rows.map(row => ({
		tablename: row.tablename,
		indexname: row.indexname,
	}));
}

export async function handleHonoApiAdminGetTableStats(
	deps: HonoApiAdminStatsDependencies,
	body: Record<string, unknown>,
): Promise<TableStatsResponse> {
	parseHonoApiParams(adminStatsParamDef, body);

	const result = await deps.db.execute<{
		table: string;
		count: string;
		size: string;
	}>(sql`
		SELECT relname AS "table", reltuples as "count", pg_total_relation_size(C.oid) AS "size"
		FROM pg_class C LEFT JOIN pg_namespace N ON (N.oid = C.relnamespace)
		WHERE nspname NOT IN ('pg_catalog', 'information_schema')
			AND C.relkind <> 'i'
			AND nspname !~ '^pg_toast';`);

	const stats: TableStatsResponse = {};
	for (const row of result.rows) {
		stats[row.table] = {
			count: parseInt(row.count, 10),
			size: parseInt(row.size, 10),
		};
	}

	return stats;
}
