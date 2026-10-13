/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseApiParams } from '../validation.js';

export type AdminStatsDependencies = {
	db: MiDrizzleDatabase;
};

type IndexStatsResponse = {
	tablename: string;
	indexname: string;
}[];

type TableStatsResponse = {
	databaseSize: number;
	tables: {
		name: string;
		count: number;
		dataSize: number;
		indexSize: number;
		totalSize: number;
	}[];
};

export const adminStatsParamDef = z.object({});

export async function handleApiAdminGetIndexStats(
	deps: AdminStatsDependencies,
	body: Record<string, unknown>,
): Promise<IndexStatsResponse> {
	parseApiParams(adminStatsParamDef, body);

	const result = await deps.db.execute<{
		tablename: string;
		indexname: string;
	}>(sql`SELECT * FROM pg_indexes;`);

	return result.rows.map((row) => ({
		tablename: row.tablename,
		indexname: row.indexname,
	}));
}

export async function handleApiAdminGetTableStats(
	deps: AdminStatsDependencies,
	body: Record<string, unknown>,
): Promise<TableStatsResponse> {
	parseApiParams(adminStatsParamDef, body);

	// 対象は通常・パーティション・マテリアライズドビューのテーブルだけで、シーケンスやインデックスは含めない。
	// 行数は挿入・削除のたびに進む統計 n_live_tup の推定値。ANALYZE で決まる reltuples は小さいテーブルでは
	// 一度も更新されず -1 のままになる。異常終了で統計が消え、挿入・削除の記録も 0 のときだけ reltuples を使う
	// (全行を DELETE した直後も n_live_tup は 0 になるが、削除の記録が残るのでそちらは 0 のまま出す)。
	// データの大きさ (pg_table_size) は TOAST・空き領域マップ・可視性マップを含み、インデックスと足すと合計になる。
	const [tables, database] = await Promise.all([
		deps.db.execute<{
			name: string;
			count: string;
			dataSize: string;
			indexSize: string;
			totalSize: string;
		}>(sql`
			SELECT
				C.relname AS "name",
				CASE
					WHEN pg_stat_get_live_tuples(C.oid) = 0
						AND pg_stat_get_tuples_inserted(C.oid) = 0
						AND pg_stat_get_tuples_deleted(C.oid) = 0
						AND C.reltuples > 0
					THEN C.reltuples::bigint
					ELSE pg_stat_get_live_tuples(C.oid)
				END AS "count",
				pg_table_size(C.oid) AS "dataSize",
				pg_indexes_size(C.oid) AS "indexSize",
				pg_total_relation_size(C.oid) AS "totalSize"
			FROM pg_class C JOIN pg_namespace N ON N.oid = C.relnamespace
			WHERE N.nspname NOT IN ('pg_catalog', 'information_schema')
				AND N.nspname !~ '^pg_toast'
				AND C.relkind IN ('r', 'p', 'm')
			ORDER BY pg_total_relation_size(C.oid) DESC, C.relname;`),
		deps.db.execute<{ size: string }>(sql`SELECT pg_database_size(current_database()) AS "size";`),
	]);

	return {
		databaseSize: Number(database.rows[0]?.size ?? 0),
		tables: tables.rows.map((row) => ({
			name: row.name,
			count: Number(row.count),
			dataSize: Number(row.dataSize),
			indexSize: Number(row.indexSize),
			totalSize: Number(row.totalSize),
		})),
	};
}
