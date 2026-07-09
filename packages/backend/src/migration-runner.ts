/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadConfig } from './config.js';
import { createDrizzlePool, type MiDrizzlePool } from './drizzle.js';

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

// drizzle-ormのmigrate()自体と同じ判定則(pg-core/dialect.js PgDialect.migrate)を再現する。
// hashは監査用の記録に過ぎず、適用済み判定は最新1行のcreated_atとjournalのwhenの比較のみで行われる。
async function lastAppliedCreatedAt(pool: MiDrizzlePool): Promise<number> {
	await pool.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
	await pool.query(`
		CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at bigint
		)
	`);

	const result = await pool.query<{ created_at: string | null }>(
		'SELECT "created_at" FROM "drizzle"."__drizzle_migrations" ORDER BY "created_at" DESC LIMIT 1',
	);

	const createdAt = result.rows[0]?.created_at;
	return createdAt != null ? Number(createdAt) : 0;
}

export async function listPendingMigrations(pool: MiDrizzlePool, migrationDir = defaultMigrationDirectory()): Promise<PendingMigration[]> {
	const [entries, lastApplied] = await Promise.all([
		readJournalEntries(migrationDir),
		lastAppliedCreatedAt(pool),
	]);

	return entries
		.filter(entry => entry.when > lastApplied)
		.map(entry => ({ tag: entry.tag, when: entry.when }));
}

export async function runMigrations(pool: MiDrizzlePool, migrationDir = defaultMigrationDirectory()): Promise<PendingMigration[]> {
	const pending = await listPendingMigrations(pool, migrationDir);
	if (pending.length === 0) {
		return [];
	}

	const db = drizzle(pool);
	await migrate(db, { migrationsFolder: migrationDir });

	return pending;
}

export async function resetDatabase(pool: MiDrizzlePool): Promise<void> {
	await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
	await pool.query('CREATE SCHEMA public');
	await pool.query('GRANT ALL ON SCHEMA public TO public');
	await pool.query('GRANT ALL ON SCHEMA public TO CURRENT_USER');
	// drizzleの適用済みmigrationブックキーピングは public とは別スキーマにあるため、
	// これも一緒に消さないと「public は空だがブックキーピングだけ残っている」状態になり、
	// runMigrations() が何も適用しなくなる。
	await pool.query('DROP SCHEMA IF EXISTS "drizzle" CASCADE');
}

async function main(): Promise<void> {
	const command = process.argv[2] ?? 'up';
	const config = loadConfig();
	const pool = createDrizzlePool(config);

	try {
		switch (command) {
			case 'up': {
				const migrations = await runMigrations(pool);
				for (const migration of migrations) {
					console.log(`Migrated: ${migration.tag}`);
				}
				if (migrations.length === 0) console.log('No migrations are pending.');
				break;
			}
			case 'check': {
				const pending = await listPendingMigrations(pool);
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
	} finally {
		await pool.end();
	}
}

if (process.argv[1] != null && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	await main();
}
