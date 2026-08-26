/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiDrizzlePool } from '@/drizzle.js';

export async function resetDb(pool: MiDrizzlePool) {
	const reset = async () => {
		const client = await pool.connect();
		try {
			await client.query('BEGIN');

			// drizzle スキーマ (適用済みマイグレーションの記帳) は消さない。テーブルや enum は
			// 残るので、記帳だけ空にすると次回起動時のマイグレーションが
			// 「type ... already exists」で失敗し、以後スキーマを作り直すまで起動できなくなる
			const { rows: tables } = await client.query<{
				schema: string;
				table: string;
			}>(`SELECT quote_ident(N.nspname) AS "schema", quote_ident(C.relname) AS "table"
			FROM pg_class C LEFT JOIN pg_namespace N ON (N.oid = C.relnamespace)
			WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'drizzle')
				AND C.relkind = 'r'
				AND nspname !~ '^pg_toast';`);

			if (tables.length !== 0) {
				await client.query(
					`TRUNCATE TABLE ${tables.map((table) => `${table.schema}.${table.table}`).join(', ')} RESTART IDENTITY CASCADE`,
				);
			}

			await client.query('COMMIT');
		} catch (err) {
			await client.query('ROLLBACK').catch(() => undefined);
			throw err;
		} finally {
			client.release();
		}
	};

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
