/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { DataSource } from 'typeorm';

export async function resetDb(db: DataSource) {
	const reset = async () => {
		await db.transaction(async entityManager => {
			const tables = await entityManager.query(`SELECT quote_ident(N.nspname) AS "schema", quote_ident(C.relname) AS "table"
			FROM pg_class C LEFT JOIN pg_namespace N ON (N.oid = C.relnamespace)
			WHERE nspname NOT IN ('pg_catalog', 'information_schema')
				AND C.relkind = 'r'
				AND nspname !~ '^pg_toast';`) as { schema: string; table: string; }[];

			if (tables.length === 0) return;

			await entityManager.query(`TRUNCATE TABLE ${tables.map(table => `${table.schema}.${table.table}`).join(', ')} RESTART IDENTITY CASCADE`);
		});
	};

	for (let i = 1; i <= 3; i++) {
		try {
			await reset();
		} catch (e) {
			if (i === 3) {
				throw e;
			} else {
				await new Promise(resolve => setTimeout(resolve, 1000));
				continue;
			}
		}
		break;
	}
}
