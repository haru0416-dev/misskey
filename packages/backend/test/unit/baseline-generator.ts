/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { SQL as NativeSqlClient } from 'bun';
import { splitDump } from '../../scripts/generate-baseline.mjs';
import { loadConfig } from '@/config.js';
import type { Config } from '@/config.js';
import { createBunSqlClient } from '@/db/bun-sql.js';

function object(name: string, type: string, sql: string): string {
	return `--\n-- Name: ${name}; Type: ${type}; Schema: public; Owner: -\n--\n\n${sql}\n\n`;
}

const headerText = '--\n-- Name: phantom; Type: TABLE; Schema: public; Owner: -\n--\n';
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const escapedLiteral = (value: string) => `E'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

// 共有テスト DB の public schema は使わず、参照 SQL と生成 SQL を別々の所有 DB で実行する。
describe('baseline generator SQL preservation', () => {
	let config: Config;
	let admin: NativeSqlClient;
	const owned: { name: string; client?: NativeSqlClient }[] = [];

	beforeAll(() => {
		config = loadConfig();
		admin = createBunSqlClient(config, 1, { idleTimeoutSeconds: 0 });
	});

	beforeEach(async () => {
		for (let index = 0; index < 2; index++) {
			const name = `baseline_generator_${randomUUID().replaceAll('-', '')}`;
			await admin.unsafe(`CREATE DATABASE "${name}" TEMPLATE template0`);
			const database: { name: string; client?: NativeSqlClient } = { name };
			owned.push(database);
			database.client = createBunSqlClient(
				{
					...config,
					database: { ...config.database, primary: { ...config.database.primary, name } },
				},
				1,
				{ idleTimeoutSeconds: 0 },
			);
		}
	});

	afterEach(async () => {
		const errors: unknown[] = [];
		for (const { name, client } of owned.splice(0)) {
			try {
				await client?.close({ timeout: 0 });
			} catch (error) {
				errors.push(error);
			}
			try {
				await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
			} catch (error) {
				errors.push(error);
			}
		}
		if (errors.length > 0) throw new AggregateError(errors, 'Owned baseline test database cleanup failed.');
	});

	afterAll(async () => {
		await admin.close({ timeout: 0 });
	});

	async function restore(statements: { name: string; type: string; sql: string }[]) {
		const source = owned[0]!.client!;
		const restored = owned[1]!.client!;
		for (const statement of statements) await source.unsafe(statement.sql);
		const dump =
			`-- PostgreSQL database dump\n\\restrict testKey\nSET statement_timeout = 0;\n` +
			statements.map((statement) => object(statement.name, statement.type, statement.sql)).join('') +
			`-- PostgreSQL database dump complete\n\\unrestrict testKey\n`;
		const files = await splitDump(dump, source);
		for (const sql of files.values()) await restored.unsafe(sql);
		return { source, restored };
	}

	test('multiline seeds retain dump-shaped headers, comment lines, psql text and escaped quotes', async () => {
		const values = [
			`before\n--\nafter\n${headerText}\\copy sensitive_data\nSET statement_timeout = 0;\nit's preserved`,
			`escaped 'quote'; \\slash\n${headerText}--\nend`,
		];
		const create = `CREATE TABLE "public"."baseline_probe" ("id" integer PRIMARY KEY,
/* outer comment
${headerText}/* nested ; 'quote' */
*/
"va""lue" text NOT NULL);`;
		const { source, restored } = await restore([
			{ name: 'baseline_probe', type: 'TABLE', sql: create },
			{
				name: 'baseline_probe',
				type: 'TABLE DATA',
				sql:
					`INSERT INTO "public"."baseline_probe" VALUES (1, ${literal(values[0]!)});\n` +
					`INSERT INTO "public"."baseline_probe" VALUES (2, ${escapedLiteral(values[1]!)});`,
			},
		]);
		const query = `SELECT "id", "va""lue" AS value FROM "public"."baseline_probe" ORDER BY "id"`;
		const expected = values.map((value, index) => ({ id: index + 1, value }));
		expect(Array.from(await source.unsafe(query))).toEqual(expected);
		expect(Array.from(await restored.unsafe(query))).toEqual(expected);
	});

	test('tagged function bodies retain executable settings and literal dump metadata', async () => {
		const value = `before\n--\n${headerText}\\copy not_a_directive\nafter`;
		const functionSql = `CREATE FUNCTION "public"."baseline_function"() RETURNS text LANGUAGE plpgsql AS $function$
BEGIN
SET statement_timeout = 0;
/* outer /* nested ; */ comment */
RETURN current_setting('statement_timeout') || ':' || $value$${value}$value$;
END;
$function$;`;
		const { source, restored } = await restore([{ name: 'baseline_function()', type: 'FUNCTION', sql: functionSql }]);
		for (const client of [source, restored]) {
			await client.unsafe("SET statement_timeout = '5s'");
			expect(Array.from(await client.unsafe('SELECT "public"."baseline_function"() AS value'))).toEqual([
				{ value: `0:${value}` },
			]);
		}
	});

	test('extension objects resolve through search_path and keep schema-qualified application objects', async () => {
		const source = owned[0]!.client!;
		await source.unsafe('CREATE EXTENSION pg_trgm SCHEMA public');
		await source.unsafe('CREATE TABLE "public"."baseline_probe" ("value" text)');
		const index =
			'CREATE INDEX "baseline_probe_trgm" ON "public"."baseline_probe" USING "gin" ("value" "public"."gin_trgm_ops");';
		await source.unsafe(index);
		const dump =
			object('pg_trgm', 'EXTENSION', 'CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";') +
			object('EXTENSION "pg_trgm"', 'COMMENT', `COMMENT ON EXTENSION "pg_trgm" IS 'trigram';`) +
			object('baseline_probe', 'TABLE', 'CREATE TABLE "public"."baseline_probe" ("value" text);') +
			object('baseline_probe_trgm', 'INDEX', index);
		const files = await splitDump(dump, source);
		// 拡張の所有者でないロールは COMMENT ON EXTENSION を実行できない。
		expect(files.get('000-prerequisites.sql')).toBe(
			'-- EXTENSION: pg_trgm\nCREATE EXTENSION IF NOT EXISTS "pg_trgm";\n',
		);
		expect(files.get('100-tables/baseline_probe.sql')).toContain(
			'ON "public"."baseline_probe" USING "gin" ("value" "gin_trgm_ops");',
		);
	});

	test('unrecognized psql directives between statements refuse generation', async () => {
		const source = owned[0]!.client!;
		await source.unsafe('CREATE TABLE "public"."baseline_probe" ("id" integer)');
		const dump =
			object('baseline_probe', 'TABLE', 'CREATE TABLE "public"."baseline_probe" ("id" integer);') +
			'\\copy baseline_probe FROM STDIN\n';
		await expect(splitDump(dump, source)).rejects.toThrow('Unsupported psql directive');
	});
});
