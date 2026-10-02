/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { ReservedSQL } from 'bun';
import { loadConfig } from './config.js';
import type { Config } from './config.js';

const MIGRATION_ADVISORY_LOCK_ID = 0x4d_49_53_53;
const MIGRATION_LOCK_TIMEOUT = '60s';

type JournalEntry = {
	idx: number;
	when: number;
	tag: string;
	breakpoints: boolean;
};

type PendingMigration = {
	tag: string;
	when: number;
};

type BaselineManifest = {
	version: 1;
	migrations: (Pick<JournalEntry, 'idx' | 'when' | 'tag'> & { hash: string })[];
	files: string[];
};

type MigrationBaseline = {
	checkpoint: number;
	files: string[];
};

function defaultMigrationDirectory(): string {
	return fileURLToPath(new URL('../migration/', import.meta.url));
}

async function readJournalEntries(migrationDir: string): Promise<JournalEntry[]> {
	const raw = await readFile(resolve(migrationDir, 'meta/_journal.json'), 'utf-8');
	return (JSON.parse(raw) as { entries: JournalEntry[] }).entries;
}

async function readMigrationBaseline(
	migrationDir: string,
	entries: JournalEntry[],
): Promise<MigrationBaseline | undefined> {
	const baselineDir = resolve(migrationDir, 'baseline');
	let directory;
	try {
		directory = await lstat(baselineDir);
	} catch (error) {
		if (error != null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
			if (resolve(migrationDir) !== resolve(defaultMigrationDirectory())) return undefined;
			throw new Error(`Missing required migration baseline: ${baselineDir}`, { cause: error });
		}
		throw error;
	}
	if (!directory.isDirectory()) throw new Error(`Invalid migration baseline directory: ${baselineDir}`);

	const manifestPath = resolve(baselineDir, 'manifest.json');
	const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as BaselineManifest | null;
	if (
		manifest == null ||
		typeof manifest !== 'object' ||
		manifest.version !== 1 ||
		!Array.isArray(manifest.migrations) ||
		manifest.migrations.length === 0 ||
		manifest.migrations.length > entries.length ||
		!Array.isArray(manifest.files) ||
		manifest.files.length === 0
	) {
		throw new Error(`Invalid migration baseline manifest: ${manifestPath}`);
	}

	for (const [index, covered] of manifest.migrations.entries()) {
		const entry = entries[index]!;
		if (
			covered == null ||
			typeof covered !== 'object' ||
			!Number.isSafeInteger(covered.idx) ||
			covered.idx < 0 ||
			!Number.isSafeInteger(covered.when) ||
			covered.when <= 0 ||
			covered.idx !== entry.idx ||
			covered.when !== entry.when ||
			covered.tag !== entry.tag ||
			typeof covered.hash !== 'string' ||
			!/^[a-f0-9]{64}$/.test(covered.hash) ||
			(index > 0 && covered.when <= manifest.migrations[index - 1]!.when)
		) {
			throw new Error(`Migration baseline journal prefix mismatch at entry ${index}: ${manifestPath}`);
		}
		// 履歴の SQL は変更せず、baseline 作成時に覆った元ファイルの全バイトを照合する。
		const original = await readFile(resolve(migrationDir, `${entry.tag}.sql`));
		if (createHash('sha256').update(original).digest('hex') !== covered.hash) {
			throw new Error(`Migration baseline source hash mismatch: ${entry.tag}`);
		}
	}

	const root = await realpath(baselineDir);
	let previousPath: string | undefined;
	for (const path of manifest.files) {
		if (
			typeof path !== 'string' ||
			!path.endsWith('.sql') ||
			isAbsolute(path) ||
			path.includes('\\') ||
			path.includes('\0') ||
			path.split('/').some((part) => part === '' || part === '.' || part === '..') ||
			(previousPath != null && path <= previousPath)
		) {
			throw new Error(`Invalid migration baseline SQL path or order: ${String(path)}`);
		}
		previousPath = path;
	}

	const files: MigrationBaseline['files'] = [];
	const resolvedFiles = new Set<string>();
	for (const path of manifest.files) {
		const actualPath = await realpath(resolve(baselineDir, path));
		const fromRoot = relative(root, actualPath);
		if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
			throw new Error(`Migration baseline SQL path escapes its directory: ${path}`);
		}
		if (resolvedFiles.has(actualPath)) throw new Error(`Duplicate migration baseline SQL file: ${path}`);
		if (!(await stat(actualPath)).isFile())
			throw new Error(`Migration baseline SQL path is not a regular file: ${path}`);
		resolvedFiles.add(actualPath);
		files.push(actualPath);
	}
	return { checkpoint: manifest.migrations.at(-1)!.when, files };
}

async function withMigrationSession<T>(config: Config, operation: (client: ReservedSQL) => Promise<T>): Promise<T> {
	// Bun 専用ドライバは実行時に読み込み、Node 側のモジュール読み込みを妨げない。
	const { createBunSqlClient, normalizeDatabaseError } = await import('./db/bun-sql.js');
	// migration と index の作成は数十秒〜数分かかる。idleTimeout が有効だと実行中に接続を切られる。
	const sql = createBunSqlClient(config, 1, { idleTimeoutSeconds: 0 });
	let client: ReservedSQL | undefined;
	let locked = false;
	let statementTimeout: string | undefined;
	let failed = false;
	let failure: unknown;
	let result!: T;

	async function cleanup(action: () => unknown): Promise<void> {
		try {
			await action();
		} catch (error) {
			if (!failed) {
				failed = true;
				failure = error;
			}
		}
	}

	try {
		client = await sql.reserve();
		const timeout = (await client.unsafe('SHOW statement_timeout')) as { statement_timeout: string }[];
		statementTimeout = timeout[0]!.statement_timeout;
		await client.unsafe("SELECT set_config('statement_timeout', $1, false)", [MIGRATION_LOCK_TIMEOUT]);
		await client.unsafe('SELECT pg_advisory_lock($1)', [MIGRATION_ADVISORY_LOCK_ID]);
		locked = true;
		await client.unsafe("SELECT set_config('statement_timeout', $1, false)", [statementTimeout]);
		result = await operation(client);
	} catch (error) {
		failed = true;
		failure = error;
	} finally {
		if (client != null) {
			const session = client;
			if (locked) {
				await cleanup(() => session.unsafe('SELECT pg_advisory_unlock($1)', [MIGRATION_ADVISORY_LOCK_ID]));
			}
			if (statementTimeout != null) {
				await cleanup(() => session.unsafe("SELECT set_config('statement_timeout', $1, false)", [statementTimeout]));
			}
			await cleanup(() => session.release());
		}
		// 復元・unlock・release の失敗でも専用接続を破棄し、セッションロックを残さない。
		await cleanup(() => sql.close({ timeout: 0 }));
	}
	if (failed) {
		// Drizzle が包んだ SQLSTATE も、元の例外と cause の関係を変えずに揃える。
		let cause = failure;
		while (cause != null && typeof cause === 'object') {
			normalizeDatabaseError(cause);
			cause = 'cause' in cause ? cause.cause : undefined;
		}
		throw failure;
	}
	return result;
}

// drizzle-ormのmigrate()自体と同じ判定則(pg-core/dialect.js PgDialect.migrate)を再現する。
// hashは監査用の記録に過ぎず、適用済み判定は最新1行のcreated_atとjournalのwhenの比較のみで行われる。
async function appliedMigrationState(client: ReservedSQL): Promise<{ createdAt: number; hasRows: boolean }> {
	await client.unsafe('CREATE SCHEMA IF NOT EXISTS "drizzle"');
	await client.unsafe(`
		CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at bigint
		)
	`);

	const result = (await client.unsafe(
		'SELECT "created_at" FROM "drizzle"."__drizzle_migrations" ORDER BY "created_at" DESC LIMIT 1',
	)) as { created_at: string | null }[];

	const createdAt = result[0]?.created_at;
	// NULL や 0 の履歴行も既存 DB とみなし、fresh baseline で上書きしない。
	return { createdAt: createdAt != null ? Number(createdAt) : 0, hasRows: result.length > 0 };
}

async function pendingMigrations(client: ReservedSQL, migrationDir: string): Promise<PendingMigration[]> {
	const entries = await readJournalEntries(migrationDir);
	const { createdAt } = await appliedMigrationState(client);

	return entries.filter((entry) => entry.when > createdAt).map((entry) => ({ tag: entry.tag, when: entry.when }));
}

async function applyMigrationBaseline(client: ReservedSQL, baseline: MigrationBaseline): Promise<void> {
	const [schema] = (await client.unsafe(`
		SELECT EXISTS (
			SELECT 1 FROM pg_depend AS namespace_dependency
			JOIN pg_namespace AS namespace ON namespace.oid = namespace_dependency.refobjid
			WHERE namespace_dependency.refclassid = 'pg_namespace'::regclass
				AND namespace.nspname = 'public'
				AND namespace_dependency.classid <> 'pg_extension'::regclass
				AND NOT EXISTS (
					SELECT 1 FROM pg_depend AS extension_dependency
					WHERE extension_dependency.classid = namespace_dependency.classid
						AND extension_dependency.objid = namespace_dependency.objid
						AND extension_dependency.refclassid = 'pg_extension'::regclass
						AND extension_dependency.deptype = 'e'
				)
		) AS nonempty
	`)) as { nonempty: boolean }[];
	if (schema!.nonempty) {
		throw new Error('Cannot apply migration baseline to a nonempty public schema without migration history.');
	}

	// pg_trgm などの拡張所有オブジェクトだけなら既存の CREATE EXTENSION IF NOT EXISTS で再利用できる。
	// 分割 SQL と checkpoint は、advisory lock を持つ同一セッションの transaction で確定する。
	await client.begin(async (transaction) => {
		const hash = createHash('sha256');
		for (const path of baseline.files) {
			const sql = await readFile(path);
			hash.update(sql);
			// 関数本文のセミコロンを壊さず、各ファイルを複数文のまま実行する。
			await transaction.unsafe(sql.toString('utf-8')).simple();
		}
		await transaction.unsafe('INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)', [
			hash.digest('hex'),
			baseline.checkpoint,
		]);
	});
}

export async function listPendingMigrations(
	config: Config,
	migrationDir = defaultMigrationDirectory(),
): Promise<PendingMigration[]> {
	// 初回の管理テーブル作成も migration と同じロックで直列化する。
	return withMigrationSession(config, (client) => pendingMigrations(client, migrationDir));
}

export async function runMigrations(
	config: Config,
	migrationDir = defaultMigrationDirectory(),
): Promise<PendingMigration[]> {
	return withMigrationSession(config, async (client) => {
		const entries = await readJournalEntries(migrationDir);
		const baseline = await readMigrationBaseline(migrationDir, entries);
		const { createdAt, hasRows } = await appliedMigrationState(client);
		const pending = entries
			.filter((entry) => entry.when > createdAt)
			.map((entry) => ({ tag: entry.tag, when: entry.when }));
		let appliedThrough = createdAt;
		if (!hasRows && baseline != null) {
			await applyMigrationBaseline(client, baseline);
			appliedThrough = baseline.checkpoint;
		}
		if (pending.some((entry) => entry.when > appliedThrough)) {
			// このモジュール自体は Node からも読み込まれるため、Bun 専用 migrator は遅延読み込みする。
			const [{ drizzle }, { migrate }] = await Promise.all([
				import('drizzle-orm/bun-sql'),
				import('drizzle-orm/bun-sql/migrator'),
			]);
			await migrate(drizzle({ client }), { migrationsFolder: migrationDir });
		}
		return pending;
	});
}

const NOTE_TEXT_INDEX = 'IDX_NOTE_TEXT_TRGM';

/**
 * 本文の trigram index を設定 (search.noteTextIndex) に合わせて作る・消す。index は migration で作るので、
 * 無効にした環境ではここで消す。作成・削除は CONCURRENTLY で行い、投稿の書き込みを止めない。
 * CONCURRENTLY の作成が中断されると無効な index が残り、書き込みの負担だけが続くので作り直す。
 * 数十万件の投稿で作成に数分かかるため、文の時間制限は外す。
 */
export async function reconcileNoteTextIndex(config: Config): Promise<'created' | 'dropped' | 'unchanged'> {
	return withMigrationSession(config, async (client) => {
		const rows = (await client.unsafe(
			'SELECT i.indisvalid AS valid FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = $1',
			[NOTE_TEXT_INDEX],
		)) as { valid: boolean }[];
		const existing = rows[0];
		const wanted = config.search.noteTextIndex;
		if (wanted && existing?.valid === true) return 'unchanged';
		if (!wanted && existing == null) return 'unchanged';

		await client.unsafe("SELECT set_config('statement_timeout', '0', false)");
		if (existing != null) {
			await client.unsafe(`DROP INDEX CONCURRENTLY IF EXISTS "${NOTE_TEXT_INDEX}"`);
		}
		if (!wanted) return 'dropped';
		// 式は検索側 (NoteStore の LOWER("note"."text") LIKE) と完全に一致させる。fastupdate=off は、保留リストの
		// 反映で投稿の挿入が秒単位で止まるのを避けるため。
		await client.unsafe(
			`CREATE INDEX CONCURRENTLY IF NOT EXISTS "${NOTE_TEXT_INDEX}" ON "note" USING gin (lower("text") gin_trgm_ops) WITH (fastupdate = off)`,
		);
		return 'created';
	});
}

export async function resetDatabase(config: Config): Promise<void> {
	if (process.env['NODE_ENV'] !== 'test') {
		throw new Error('Database reset is only allowed in the test environment.');
	}
	await withMigrationSession(config, async (client) => {
		await client.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
		await client.unsafe('CREATE SCHEMA public');
		await client.unsafe('GRANT ALL ON SCHEMA public TO public');
		await client.unsafe('GRANT ALL ON SCHEMA public TO CURRENT_USER');
		// public と別スキーマの適用履歴も消し、次の migration で全テーブルを再作成する。
		await client.unsafe('DROP SCHEMA IF EXISTS "drizzle" CASCADE');
	});
}

/** migration 直後に行が入っているテーブルの内容 (migration が入れる初期データ)。 */
export type DatabaseSeed = { table: string; rows: string }[];

const listPublicTablesQuery =
	"SELECT format('%I', tablename) AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename";

export async function captureDatabaseSeed(config: Config): Promise<DatabaseSeed> {
	return await withMigrationSession(config, async (client) => {
		const tables = (await client.unsafe(listPublicTablesQuery)) as { name: string }[];
		const seed: DatabaseSeed = [];
		for (const { name } of tables) {
			// eslint-disable-next-line no-await-in-loop
			const [row] = (await client.unsafe(`SELECT json_agg(t)::text AS rows FROM ${name} AS t`)) as {
				rows: string | null;
			}[];
			if (row?.rows != null) seed.push({ table: name, rows: row.rows });
		}
		return seed;
	});
}

/**
 * スキーマを作り直さずに全テーブルを空にし、初期データを戻す。migration 済みの同じスキーマでの初期化に限る。
 * 作り直し (DROP + migration) より速い。
 */
export async function truncateDatabase(config: Config, seed: DatabaseSeed): Promise<void> {
	if (process.env['NODE_ENV'] !== 'test') {
		throw new Error('Database reset is only allowed in the test environment.');
	}
	await withMigrationSession(config, async (client) => {
		const tables = (await client.unsafe(listPublicTablesQuery)) as { name: string }[];
		await client.unsafe(`TRUNCATE ${tables.map(({ name }) => name).join(', ')} RESTART IDENTITY CASCADE`);
		for (const { table, rows } of seed) {
			// eslint-disable-next-line no-await-in-loop
			await client.unsafe(`INSERT INTO ${table} SELECT * FROM json_populate_recordset(NULL::${table}, $1::json)`, [
				rows,
			]);
		}
	});
}

async function main(): Promise<void> {
	const command = process.argv[2] ?? 'up';
	const config = loadConfig();

	switch (command) {
		case 'up': {
			const migrations = await runMigrations(config);
			for (const migration of migrations) {
				console.log(`Migrated: ${migration.tag}`);
			}
			if (migrations.length === 0) {
				console.log('No migrations are pending.');
			}
			const noteTextIndex = await reconcileNoteTextIndex(config);
			if (noteTextIndex !== 'unchanged') {
				console.log(`Note text index (${NOTE_TEXT_INDEX}): ${noteTextIndex}`);
			}
			break;
		}
		case 'check': {
			const pending = await listPendingMigrations(config);
			if (pending.length > 0) {
				for (const migration of pending) {
					console.error(`Pending migration: ${migration.tag}`);
				}
				process.exitCode = 1;
			} else {
				console.log('All migrations are clean.');
			}
			break;
		}
		default:
			throw new Error(`Unknown migration command: ${command}`);
	}
}

if (process.argv[1] != null && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	await main();
}
