/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sql } from 'drizzle-orm';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export async function resetDb(db: MiDrizzleDatabase): Promise<void> {
	const reset = () =>
		db.transaction(async (tx) => {
			// 適用済み migration の journal と、TRUNCATE トリガが進める cache 世代は残す。
			const { rows: tables } = await tx.execute<{
				schema: string;
				table: string;
			}>(sql`SELECT quote_ident(N.nspname) AS "schema", quote_ident(C.relname) AS "table"
			FROM pg_class C LEFT JOIN pg_namespace N ON (N.oid = C.relnamespace)
			WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'drizzle')
				AND NOT (N.nspname = 'public' AND C.relname = 'cache_version')
				AND C.relkind = 'r'
				AND nspname !~ '^pg_toast';`);

			if (tables.length !== 0) {
				await tx.execute(
					sql.raw(
						`TRUNCATE TABLE ${tables.map((table) => `${table.schema}.${table.table}`).join(', ')} RESTART IDENTITY CASCADE`,
					),
				);
			}
		});

	for (let i = 1; i <= 3; i++) {
		try {
			await reset();
		} catch (e) {
			if (i === 3) {
				throw e;
			} else {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				continue;
			}
		}
		break;
	}
}
