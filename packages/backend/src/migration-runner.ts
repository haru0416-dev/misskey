/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
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

function defaultMigrationDirectory(): string {
	return fileURLToPath(new URL('../migration/', import.meta.url));
}

async function readJournalEntries(migrationDir: string): Promise<JournalEntry[]> {
	const raw = await readFile(resolve(migrationDir, 'meta/_journal.json'), 'utf-8');
	return (JSON.parse(raw) as { entries: JournalEntry[] }).entries;
}

async function withMigrationSession<T>(config: Config, operation: (client: ReservedSQL) => Promise<T>): Promise<T> {
	// Bun 専用ドライバは実行時に読み込み、Node 側のモジュール読み込みを妨げない。
	const { createBunSqlClient, normalizeDatabaseError } = await import('./db/bun-sql.js');
	const sql = createBunSqlClient(config, 1);
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
async function lastAppliedCreatedAt(client: ReservedSQL): Promise<number> {
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
	return createdAt != null ? Number(createdAt) : 0;
}

async function pendingMigrations(client: ReservedSQL, migrationDir: string): Promise<PendingMigration[]> {
	const entries = await readJournalEntries(migrationDir);
	const lastApplied = await lastAppliedCreatedAt(client);

	return entries.filter((entry) => entry.when > lastApplied).map((entry) => ({ tag: entry.tag, when: entry.when }));
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
		const pending = await pendingMigrations(client, migrationDir);
		if (pending.length > 0) {
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
