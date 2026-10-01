/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { SQL as NativeSqlClient } from 'bun';
import { loadConfig } from '@/config.js';
import type { Config } from '@/config.js';
import { createBunSqlClient } from '@/db/bun-sql.js';
import { listPendingMigrations, reconcileNoteTextIndex, runMigrations } from '@/migration-runner.js';

// 本文の trigram index は更新時の書き込み負担を伴うため、search.noteTextIndex で起動時の有無を制御する。
describe('reconcileNoteTextIndex', () => {
	let config: Config;
	let pool: NativeSqlClient;
	const withIndex = (noteTextIndex: boolean): Config => ({ ...config, search: { ...config.search, noteTextIndex } });
	const indexState = async () => {
		const rows = (await pool.unsafe(
			`SELECT i.indisvalid AS valid, pg_get_indexdef(c.oid) AS def FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = 'IDX_NOTE_TEXT_TRGM'`,
		)) as { valid: boolean; def: string }[];
		return rows[0] ?? null;
	};

	beforeAll(() => {
		config = loadConfig();
		pool = createBunSqlClient(config);
	});

	afterAll(async () => {
		// 他のテストは migration が作った index がある前提なので戻す。
		await reconcileNoteTextIndex(withIndex(true));
		await pool.close();
	});

	test('無効にすると消し、有効に戻すと migration と同じ定義で作り直す', async () => {
		const fromMigration = await indexState();
		expect(fromMigration?.valid).toBe(true);
		expect(await reconcileNoteTextIndex(withIndex(false))).toBe('dropped');
		expect(await indexState()).toBeNull();
		expect(await reconcileNoteTextIndex(withIndex(false))).toBe('unchanged');

		expect(await reconcileNoteTextIndex(withIndex(true))).toBe('created');
		const created = await indexState();
		expect(created?.valid).toBe(true);
		expect(created?.def).toBe(fromMigration?.def);
		expect(await reconcileNoteTextIndex(withIndex(true))).toBe('unchanged');
	});

	// CONCURRENTLY の作成が中断されると無効な index が残り、検索には使われず書き込みの負担だけが続く。
	test('無効な index が残っていたら作り直す', async () => {
		await pool.unsafe(`UPDATE pg_index SET indisvalid = false WHERE indexrelid = '"IDX_NOTE_TEXT_TRGM"'::regclass`);
		expect((await indexState())?.valid).toBe(false);
		expect(await reconcileNoteTextIndex(withIndex(true))).toBe('created');
		expect((await indexState())?.valid).toBe(true);
	});
});

type TestJournalEntry = { idx: number; when: number; tag: string; breakpoints: boolean };
type TestBaselineManifest = {
	version: number;
	migrations: { idx: number; when: number; tag: string; hash: string }[];
	files: string[];
};

describe('runMigrations baseline', () => {
	let admin: NativeSqlClient;
	let baseConfig: Config;
	let config: Config;
	let pool: NativeSqlClient | undefined;
	let databaseName: string | undefined;
	let directory: string | undefined;
	const sourceDirectory = fileURLToPath(new URL('../../migration/', import.meta.url));
	const originalSql = [
		`CREATE TABLE "baseline_probe" ("id" integer PRIMARY KEY, "value" text NOT NULL);
--> statement-breakpoint
INSERT INTO "baseline_probe" ("id", "value") VALUES (1, 'initial');`,
		`ALTER TABLE "baseline_probe" ADD COLUMN "enabled" boolean NOT NULL DEFAULT true;`,
	];
	const baselineTable = `CREATE TABLE "baseline_probe" ("id" integer PRIMARY KEY, "value" text NOT NULL, "enabled" boolean NOT NULL DEFAULT true);`;
	const baselineSeed = `INSERT INTO "baseline_probe" ("id", "value") VALUES (1, 'initial');`;
	const sha256 = (sql: string | Buffer) => createHash('sha256').update(sql).digest('hex');
	const manifestPath = () => join(directory!, 'baseline/manifest.json');
	const readManifest = async () => JSON.parse(await readFile(manifestPath(), 'utf-8')) as TestBaselineManifest;
	const writeManifest = (manifest: TestBaselineManifest) => writeFile(manifestPath(), JSON.stringify(manifest));
	const queryRows = async (query: string) => Array.from(await pool!.unsafe(query));
	const history = async () => {
		const [table] = (await pool!.unsafe(
			`SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present`,
		)) as { present: boolean }[];
		if (!table!.present) return [];
		return (
			(await pool!.unsafe(`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`)) as {
				hash: string;
				created_at: string;
			}[]
		).map((row) => ({ hash: row.hash, when: Number(row.created_at) }));
	};
	const probeRows = async () =>
		(await queryRows(`SELECT id, value, enabled FROM "baseline_probe" ORDER BY id`)) as {
			id: number;
			value: string;
			enabled: boolean;
		}[];
	const pendingEntries = (entries: TestJournalEntry[]) => entries.map(({ tag, when }) => ({ tag, when }));

	async function writeFixture(futureSql?: string, withBaseline = true): Promise<TestJournalEntry[]> {
		await mkdir(join(directory!, 'meta'), { recursive: true });
		const entries = originalSql.map((_, idx) => ({
			idx,
			when: (idx + 1) * 100,
			tag: `000${idx}_history`,
			breakpoints: true,
		}));
		for (const [index, sql] of originalSql.entries()) {
			await writeFile(join(directory!, `${entries[index]!.tag}.sql`), sql);
		}
		if (futureSql != null) {
			entries.push({ idx: 2, when: 300, tag: '0002_future', breakpoints: true });
			await writeFile(join(directory!, '0002_future.sql'), futureSql);
		}
		await writeFile(
			join(directory!, 'meta/_journal.json'),
			JSON.stringify({ version: '7', dialect: 'postgresql', entries }),
		);
		if (withBaseline) {
			await mkdir(join(directory!, 'baseline'), { recursive: true });
			await writeFile(join(directory!, 'baseline/00-table.sql'), baselineTable);
			await writeFile(join(directory!, 'baseline/01-seed.sql'), baselineSeed);
			await writeManifest({
				version: 1,
				migrations: entries.slice(0, originalSql.length).map(({ idx, when, tag }) => ({
					idx,
					when,
					tag,
					hash: sha256(originalSql[idx]!),
				})),
				files: ['00-table.sql', '01-seed.sql'],
			});
		}
		return entries;
	}

	beforeAll(() => {
		baseConfig = loadConfig();
		admin = createBunSqlClient(baseConfig, 1, { idleTimeoutSeconds: 0 });
	});

	beforeEach(async () => {
		// 共有テスト DB の schema やデータには触れず、このテストが作った DB だけを破棄する。
		const ownedName = `migration_runner_${randomUUID().replaceAll('-', '')}`;
		await admin.unsafe(`CREATE DATABASE "${ownedName}" TEMPLATE template0`);
		databaseName = ownedName;
		config = {
			...baseConfig,
			database: { ...baseConfig.database, primary: { ...baseConfig.database.primary, name: ownedName } },
		};
		pool = createBunSqlClient(config, 2, { idleTimeoutSeconds: 0 });
		directory = await mkdtemp(join(tmpdir(), 'misskey-migration-baseline-'));
	});

	afterEach(async () => {
		try {
			await pool?.close({ timeout: 0 });
		} finally {
			pool = undefined;
			try {
				if (databaseName != null) await admin.unsafe(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
			} finally {
				databaseName = undefined;
				if (directory != null) await rm(directory, { recursive: true, force: true });
				directory = undefined;
			}
		}
	});

	afterAll(async () => {
		await admin.close({ timeout: 0 });
	});

	test('default baseline initializes the application schema and seed with one actual content checkpoint', async () => {
		const manifest = JSON.parse(
			await readFile(join(sourceDirectory, 'baseline/manifest.json'), 'utf-8'),
		) as TestBaselineManifest;
		const journal = JSON.parse(await readFile(join(sourceDirectory, 'meta/_journal.json'), 'utf-8')) as {
			entries: TestJournalEntry[];
		};
		const hash = createHash('sha256');
		for (const file of manifest.files) hash.update(await readFile(join(sourceDirectory, 'baseline', file)));
		const checkpoint = { hash: hash.digest('hex'), when: manifest.migrations.at(-1)!.when };
		// baseline より後に追加した migration は、新規 DB でも baseline の後に通常どおり 1 本ずつ記録される。
		const expectedHistory = [
			checkpoint,
			...(await Promise.all(
				journal.entries
					.filter((entry) => entry.when > checkpoint.when)
					.map(async (entry) => ({
						hash: sha256(await readFile(join(sourceDirectory, `${entry.tag}.sql`))),
						when: entry.when,
					})),
			)),
		];

		expect(await listPendingMigrations(config)).toEqual(pendingEntries(journal.entries));
		expect(await runMigrations(config)).toEqual(pendingEntries(journal.entries));
		expect(await history()).toEqual(expectedHistory);
		expect(await queryRows(`SELECT "key", "version" FROM "cache_version"`)).toEqual([{ key: 'roles', version: 0 }]);
		expect(await queryRows(`SELECT get_birthday_date('2000-12-31') AS birthday`)).toEqual([{ birthday: 1231 }]);
		const chart = await queryRows(
			`INSERT INTO "__chart__notes" ("date") VALUES (123) RETURNING "id", "___local_total"`,
		);
		expect(chart).toEqual([{ id: 1, ___local_total: 0 }]);
		expect(
			await queryRows(`SELECT indisvalid FROM pg_index WHERE indexrelid = '"IDX_NOTE_TEXT_TRGM"'::regclass`),
		).toEqual([{ indisvalid: true }]);

		await pool!.unsafe(`UPDATE "role" SET "name" = "name" WHERE false`);
		expect(await runMigrations(config)).toEqual([]);
		expect(await listPendingMigrations(config)).toEqual([]);
		expect(await queryRows(`SELECT "key", "version" FROM "cache_version"`)).toEqual([{ key: 'roles', version: 1 }]);
		expect(await queryRows(`SELECT "id", "___local_total" FROM "__chart__notes" WHERE "date" = 123`)).toEqual([
			{ id: 1, ___local_total: 0 },
		]);
		expect(await history()).toEqual(expectedHistory);
	});

	test('default baseline accepts pg_trgm preinstalled by another role in a non-public schema', async () => {
		// マネージド PostgreSQL では管理者が拡張を先に入れ、アプリのロールは DB だけを所有する。
		const role = `migration_app_${randomUUID().replaceAll('-', '')}`;
		await admin.unsafe(`CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE`);
		try {
			await pool!
				.unsafe(`
				CREATE SCHEMA extensions;
				CREATE EXTENSION pg_trgm SCHEMA extensions;
				GRANT USAGE ON SCHEMA extensions TO "${role}";
				ALTER DATABASE "${databaseName}" OWNER TO "${role}";
				ALTER DATABASE "${databaseName}" SET search_path = "$user", public, extensions;
			`)
				.simple();
			const appConfig: Config = {
				...config,
				database: { ...config.database, primary: { ...config.database.primary, user: role } },
			};
			const journal = JSON.parse(await readFile(join(sourceDirectory, 'meta/_journal.json'), 'utf-8')) as {
				entries: TestJournalEntry[];
			};

			expect(await runMigrations(appConfig)).toEqual(pendingEntries(journal.entries));
			expect(
				await queryRows(`
					SELECT n.nspname AS schema, pg_get_userbyid(e.extowner) <> '${role}' AS foreign_owner
					FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm'
				`),
			).toEqual([{ schema: 'extensions', foreign_owner: true }]);
			expect(
				await queryRows(`
					SELECT count(*)::integer AS valid FROM pg_index
					WHERE indexrelid IN ('"IDX_NOTE_TEXT_TRGM"'::regclass, '"IDX_USER_NAME_TRGM"'::regclass) AND indisvalid
				`),
			).toEqual([{ valid: 2 }]);
		} finally {
			await pool!.close({ timeout: 0 });
			pool = undefined;
			await admin.unsafe(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
			databaseName = undefined;
			await admin.unsafe(`DROP ROLE "${role}"`);
		}
	});

	test.each([true, false])(
		'a future migration runs normally when present before baseline initialization: %s',
		async (initialFuture) => {
			const futureSql = `UPDATE "baseline_probe" SET "value" = 'future-applied' WHERE "id" = 1;`;
			if (!initialFuture) {
				await writeFixture();
				await runMigrations(config, directory);
			}
			const entries = await writeFixture(futureSql);
			expect(await runMigrations(config, directory)).toEqual(
				pendingEntries(initialFuture ? entries : entries.slice(2)),
			);
			expect(await probeRows()).toEqual([{ id: 1, value: 'future-applied', enabled: true }]);
			expect(await history()).toEqual([
				{ hash: sha256(baselineTable + baselineSeed), when: 200 },
				{ hash: sha256(futureSql), when: 300 },
			]);
			expect(await runMigrations(config, directory)).toEqual([]);
			expect(await listPendingMigrations(config, directory)).toEqual([]);
		},
	);

	test('an existing partial original history keeps its execution hashes and user data', async () => {
		const entries = await writeFixture(undefined, false);
		await writeFile(
			join(directory!, 'meta/_journal.json'),
			JSON.stringify({
				version: '7',
				dialect: 'postgresql',
				entries: entries.slice(0, 1),
			}),
		);
		await runMigrations(config, directory);
		await pool!.unsafe(`UPDATE "baseline_probe" SET "value" = 'user-data' WHERE "id" = 1`);
		await pool!.unsafe(`INSERT INTO "baseline_probe" ("id", "value") VALUES (2, 'another-user')`);

		await writeFixture();
		// SQL 本体を適用しないことを、既存 schema では必ず失敗する baseline で確認する。
		await writeFile(join(directory!, 'baseline/00-table.sql'), `SELECT 1 / 0;\n${baselineTable}`);
		expect(await listPendingMigrations(config, directory)).toEqual(pendingEntries(entries.slice(1)));
		expect(await runMigrations(config, directory)).toEqual(pendingEntries(entries.slice(1)));
		expect(await probeRows()).toEqual([
			{ id: 1, value: 'user-data', enabled: true },
			{ id: 2, value: 'another-user', enabled: true },
		]);
		expect(await history()).toEqual(originalSql.map((sql, index) => ({ hash: sha256(sql), when: (index + 1) * 100 })));
		expect(await runMigrations(config, directory)).toEqual([]);
	});

	test('custom migration directories without baseline still use the original stream', async () => {
		const entries = await writeFixture(undefined, false);
		expect(await runMigrations(config, directory)).toEqual(pendingEntries(entries));
		expect(await probeRows()).toEqual([{ id: 1, value: 'initial', enabled: true }]);
		expect(await history()).toEqual(originalSql.map((sql, index) => ({ hash: sha256(sql), when: (index + 1) * 100 })));
	});

	test('a failed split SQL rolls back DDL and checkpoint, releases its lock, and can be retried', async () => {
		const entries = await writeFixture();
		await writeFile(join(directory!, 'baseline/01-seed.sql'), `${baselineSeed}\nSELECT 1 / 0;`);
		await expect(runMigrations(config, directory)).rejects.toMatchObject({ code: '22012' });
		expect(await queryRows(`SELECT to_regclass('public.baseline_probe') AS relation`)).toEqual([{ relation: null }]);
		expect(await history()).toEqual([]);
		expect(
			await queryRows(`
			SELECT count(*)::integer AS held FROM pg_locks
			WHERE locktype = 'advisory' AND granted
				AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
		`),
		).toEqual([{ held: 0 }]);

		await writeFile(join(directory!, 'baseline/01-seed.sql'), baselineSeed);
		expect(await runMigrations(config, directory)).toEqual(pendingEntries(entries));
		expect(await probeRows()).toEqual([{ id: 1, value: 'initial', enabled: true }]);
		expect(await history()).toEqual([{ hash: sha256(baselineTable + baselineSeed), when: 200 }]);
	});

	test.each([
		[
			'table',
			`CREATE TABLE untracked (value text); INSERT INTO untracked VALUES ('keep');`,
			`SELECT value AS retained FROM untracked`,
			'keep',
		],
		['type', `CREATE TYPE untracked AS ENUM ('keep');`, `SELECT 'keep'::untracked::text AS retained`, 'keep'],
		[
			'function',
			`CREATE FUNCTION untracked() RETURNS text LANGUAGE sql AS $$ SELECT 'keep'::text $$;`,
			`SELECT untracked() AS retained`,
			'keep',
		],
	])(
		'an untracked public %s refuses baseline without altering existing data or stamping history',
		async (_, sql, query, retained) => {
			await writeFixture();
			await pool!.unsafe(sql).simple();
			await expect(runMigrations(config, directory)).rejects.toThrow('nonempty public schema');
			expect(await queryRows(query)).toEqual([{ retained }]);
			expect(await queryRows(`SELECT to_regclass('public.baseline_probe') AS relation`)).toEqual([{ relation: null }]);
			expect(await history()).toEqual([]);
		},
	);

	test('extension-owned pg_trgm objects do not make a fresh database untracked', async () => {
		await pool!.unsafe('CREATE EXTENSION pg_trgm');
		const entries = await writeFixture();
		expect(await runMigrations(config, directory)).toEqual(pendingEntries(entries));
		expect(await probeRows()).toEqual([{ id: 1, value: 'initial', enabled: true }]);
		expect(await queryRows(`SELECT similarity('misskey', 'misskey') AS similarity`)).toEqual([{ similarity: 1 }]);
	});

	test.each(['metadata', 'original SQL', 'file order', 'duplicate file', 'traversal'])(
		'rejects baseline %s drift before applying SQL',
		async (kind) => {
			await writeFixture();
			const manifest = await readManifest();
			switch (kind) {
				case 'metadata':
					manifest.migrations[0]!.when++;
					break;
				case 'original SQL':
					await writeFile(join(directory!, '0000_history.sql'), `${originalSql[0]}\nSELECT 1;`);
					break;
				case 'file order':
					manifest.files.reverse();
					break;
				case 'duplicate file':
					manifest.files.push(manifest.files.at(-1)!);
					break;
				case 'traversal':
					manifest.files[0] = '../outside.sql';
					break;
			}
			await writeManifest(manifest);
			await expect(runMigrations(config, directory)).rejects.toThrow(/baseline.*(mismatch|path|order)/);
			expect(await queryRows(`SELECT to_regclass('public.baseline_probe') AS relation`)).toEqual([{ relation: null }]);
			expect(await history()).toEqual([]);
		},
	);

	test('a present manifest is still validated for an already-applied database', async () => {
		await writeFixture();
		await runMigrations(config, directory);
		await pool!.unsafe(`UPDATE "baseline_probe" SET "value" = 'retained' WHERE "id" = 1`);
		const manifest = await readManifest();
		manifest.migrations[1]!.hash = '0'.repeat(64);
		await writeManifest(manifest);

		await expect(runMigrations(config, directory)).rejects.toThrow('source hash mismatch');
		expect(await probeRows()).toEqual([{ id: 1, value: 'retained', enabled: true }]);
		expect(await history()).toEqual([{ hash: sha256(baselineTable + baselineSeed), when: 200 }]);
	});

	test('rejects a baseline symlink escaping its directory before executing its SQL', async () => {
		await writeFixture();
		const manifest = await readManifest();
		await writeFile(join(directory!, 'outside.sql'), `CREATE TABLE escaped (id integer);`);
		await symlink(join(directory!, 'outside.sql'), join(directory!, 'baseline/02-escape.sql'));
		manifest.files.push('02-escape.sql');
		await writeManifest(manifest);
		await expect(runMigrations(config, directory)).rejects.toThrow('escapes its directory');
		expect(await queryRows(`SELECT to_regclass('public.escaped') AS relation`)).toEqual([{ relation: null }]);
		expect(await queryRows(`SELECT to_regclass('public.baseline_probe') AS relation`)).toEqual([{ relation: null }]);
		expect(await history()).toEqual([]);
	});

	test('a present baseline directory with missing manifest must not silently replay history', async () => {
		await writeFixture();
		await rm(manifestPath());
		await expect(runMigrations(config, directory)).rejects.toMatchObject({ code: 'ENOENT' });
		expect(await queryRows(`SELECT to_regclass('public.baseline_probe') AS relation`)).toEqual([{ relation: null }]);
		expect(await history()).toEqual([]);
	});

	test('competing runners serialize baseline execution on the reserved advisory-lock session', async () => {
		const entries = await writeFixture();
		const blockerKey = 987654321;
		await writeFile(
			join(directory!, 'baseline/00-table.sql'),
			`SELECT pg_advisory_xact_lock(${blockerKey});\n${baselineTable}`,
		);
		const blocker = await pool!.reserve();
		await blocker.unsafe('SELECT pg_advisory_lock($1)', [blockerKey]);
		const runners = Promise.allSettled([runMigrations(config, directory), runMigrations(config, directory)]);
		let results: Awaited<typeof runners>;
		try {
			const deadline = Date.now() + 10_000;
			for (;;) {
				const [locks] = (await pool!.unsafe(`
					SELECT count(*)::integer AS waiting FROM pg_locks
					WHERE locktype = 'advisory' AND NOT granted
						AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
				`)) as { waiting: number }[];
				if (locks!.waiting === 2) break;
				if (Date.now() >= deadline) throw new Error('Both migration runners did not reach their advisory-lock waits.');
				await delay(10);
			}
		} finally {
			try {
				await blocker.unsafe('SELECT pg_advisory_unlock($1)', [blockerKey]);
			} finally {
				blocker.release();
				results = await runners;
			}
		}
		const completed = results!.map((result) => {
			if (result.status === 'rejected') throw result.reason;
			return result.value;
		});
		expect(completed.filter((result) => result.length > 0)).toEqual([pendingEntries(entries)]);
		expect(completed.filter((result) => result.length === 0)).toEqual([[]]);
		expect(await probeRows()).toEqual([{ id: 1, value: 'initial', enabled: true }]);
		expect(await history()).toEqual([
			{
				hash: sha256(`SELECT pg_advisory_xact_lock(${blockerKey});\n${baselineTable}${baselineSeed}`),
				when: 200,
			},
		]);
	});
});
