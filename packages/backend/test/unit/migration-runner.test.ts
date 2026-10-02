/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

describe('runMigrations', () => {
	let admin: NativeSqlClient;
	let baseConfig: Config;
	let config: Config;
	let pool: NativeSqlClient | undefined;
	let databaseName: string | undefined;
	let directory: string | undefined;
	const sourceDirectory = fileURLToPath(new URL('../../migration/', import.meta.url));
	const originalSql = [
		`CREATE TABLE "migration_probe" ("id" integer PRIMARY KEY, "value" text NOT NULL);
--> statement-breakpoint
INSERT INTO "migration_probe" ("id", "value") VALUES (1, 'initial');`,
		`ALTER TABLE "migration_probe" ADD COLUMN "enabled" boolean NOT NULL DEFAULT true;`,
	];
	const sha256 = (sql: string | Buffer) => createHash('sha256').update(sql).digest('hex');
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
		(await queryRows(`SELECT id, value, enabled FROM "migration_probe" ORDER BY id`)) as {
			id: number;
			value: string;
			enabled: boolean;
		}[];
	const pendingEntries = (entries: TestJournalEntry[]) => entries.map(({ tag, when }) => ({ tag, when }));
	const heldAdvisoryLocks = async () =>
		await queryRows(`
			SELECT count(*)::integer AS held FROM pg_locks
			WHERE locktype = 'advisory' AND granted
				AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
		`);

	/** originalSql を 0000・0001 として書き、futureSql があれば 0002 として足す。 */
	async function writeFixture(sqls: string[] = originalSql): Promise<TestJournalEntry[]> {
		await mkdir(join(directory!, 'meta'), { recursive: true });
		const entries = sqls.map((sql, idx) => ({
			idx,
			when: (idx + 1) * 100,
			tag: `000${idx}_history`,
			breakpoints: true,
		}));
		for (const [index, sql] of sqls.entries()) {
			await writeFile(join(directory!, `${entries[index]!.tag}.sql`), sql);
		}
		await writeFile(
			join(directory!, 'meta/_journal.json'),
			JSON.stringify({ version: '7', dialect: 'postgresql', entries }),
		);
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
		directory = await mkdtemp(join(tmpdir(), 'misskey-migration-runner-'));
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

	test('the shipped migrations initialize the application schema and seed, and a rerun does nothing', async () => {
		const journal = JSON.parse(await readFile(join(sourceDirectory, 'meta/_journal.json'), 'utf-8')) as {
			entries: TestJournalEntry[];
		};
		const expectedHistory = await Promise.all(
			journal.entries.map(async (entry) => ({
				hash: sha256(await readFile(join(sourceDirectory, `${entry.tag}.sql`))),
				when: entry.when,
			})),
		);

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

	test('the shipped migrations accept pg_trgm preinstalled by another role in a non-public schema', async () => {
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

	test('a fresh database applies every journal entry in order and records each file hash', async () => {
		const entries = await writeFixture();
		expect(await listPendingMigrations(config, directory)).toEqual(pendingEntries(entries));
		expect(await runMigrations(config, directory)).toEqual(pendingEntries(entries));
		expect(await probeRows()).toEqual([{ id: 1, value: 'initial', enabled: true }]);
		expect(await history()).toEqual(originalSql.map((sql, index) => ({ hash: sha256(sql), when: (index + 1) * 100 })));
		expect(await runMigrations(config, directory)).toEqual([]);
		expect(await listPendingMigrations(config, directory)).toEqual([]);
	});

	test('a migration appended later runs alone and keeps existing data', async () => {
		await writeFixture();
		await runMigrations(config, directory);
		await pool!.unsafe(`UPDATE "migration_probe" SET "value" = 'user-data' WHERE "id" = 1`);
		await pool!.unsafe(`INSERT INTO "migration_probe" ("id", "value") VALUES (2, 'another-user')`);

		const futureSql = `UPDATE "migration_probe" SET "enabled" = false WHERE "id" = 2;`;
		const entries = await writeFixture([...originalSql, futureSql]);
		expect(await runMigrations(config, directory)).toEqual(pendingEntries(entries.slice(2)));
		expect(await probeRows()).toEqual([
			{ id: 1, value: 'user-data', enabled: true },
			{ id: 2, value: 'another-user', enabled: false },
		]);
		expect(await history()).toEqual(
			[...originalSql, futureSql].map((sql, index) => ({ hash: sha256(sql), when: (index + 1) * 100 })),
		);
		expect(await runMigrations(config, directory)).toEqual([]);
	});

	test('a failed migration rolls back its DDL and history, releases its lock, and can be retried', async () => {
		const failing = `${originalSql[0]}\n--> statement-breakpoint\nSELECT 1 / 0;`;
		await writeFixture([failing]);
		await expect(runMigrations(config, directory)).rejects.toMatchObject({ cause: { code: '22012' } });
		expect(await queryRows(`SELECT to_regclass('public.migration_probe') AS relation`)).toEqual([{ relation: null }]);
		expect(await history()).toEqual([]);
		expect(await heldAdvisoryLocks()).toEqual([{ held: 0 }]);

		const entries = await writeFixture();
		expect(await runMigrations(config, directory)).toEqual(pendingEntries(entries));
		expect(await probeRows()).toEqual([{ id: 1, value: 'initial', enabled: true }]);
	});

	test('the shipped migrations refuse a schema that already has the application tables, without stamping history', async () => {
		await pool!.unsafe(`CREATE TABLE "user" (value text); INSERT INTO "user" VALUES ('keep');`).simple();
		await expect(runMigrations(config)).rejects.toMatchObject({ cause: { code: '42P07' } });
		expect(await queryRows(`SELECT value AS retained FROM "user"`)).toEqual([{ retained: 'keep' }]);
		expect(await history()).toEqual([]);
		expect(await heldAdvisoryLocks()).toEqual([{ held: 0 }]);
	});

	test('competing runners serialize on the reserved advisory-lock session', async () => {
		const blockerKey = 987654321;
		const blocked = [`SELECT pg_advisory_xact_lock(${blockerKey});\n${originalSql[0]}`, originalSql[1]!];
		const entries = await writeFixture(blocked);
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
		expect(await history()).toEqual(blocked.map((sql, index) => ({ hash: sha256(sql), when: (index + 1) * 100 })));
	});
});
