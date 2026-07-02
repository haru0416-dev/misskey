/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Pool, PoolClient, QueryResult } from 'pg';
import { loadConfig } from './config.js';
import { createDrizzlePool, type MiDrizzlePool } from './drizzle.js';

type MigrationQueryRunner = {
	query(query: string, parameters?: unknown[]): Promise<unknown[]>;
};

type Migration = {
	timestamp: number;
	name: string;
	transaction?: boolean;
	up(queryRunner: MigrationQueryRunner): Promise<void>;
	down(queryRunner: MigrationQueryRunner): Promise<void>;
};

type AppliedMigration = {
	timestamp: number;
	name: string;
};

class PgMigrationQueryRunner implements MigrationQueryRunner {
	constructor(private readonly client: Pool | PoolClient) {
	}

	public async query(query: string, parameters?: unknown[]): Promise<unknown[]> {
		const result = await this.client.query(query, parameters);

		if (Array.isArray(result)) {
			return result.flatMap(item => item.rows);
		}

		return (result as QueryResult).rows;
	}
}

function defaultMigrationDirectory(): string {
	return fileURLToPath(new URL('../migration/', import.meta.url));
}

function migrationTimestamp(fileName: string): number {
	const match = /^(\d+)-.+\.js$/.exec(fileName);
	if (match == null) {
		throw new Error(`Invalid migration filename: ${fileName}`);
	}

	return Number(match[1]);
}

async function loadMigration(filePath: string): Promise<Migration> {
	const timestamp = migrationTimestamp(basename(filePath));
	const module = await import(pathToFileURL(filePath).href);
	const MigrationClass = Object.values(module).find((value): value is (new () => Omit<Migration, 'timestamp'>) & { name: string } => (
		typeof value === 'function' &&
		typeof value.prototype?.up === 'function' &&
		typeof value.prototype?.down === 'function'
	));

	if (MigrationClass == null) {
		throw new Error(`Migration class was not found in ${filePath}`);
	}

	const migration = new MigrationClass();

	return {
		timestamp,
		name: migration.name ?? MigrationClass.name,
		transaction: migration.transaction,
		up: migration.up.bind(migration),
		down: migration.down.bind(migration),
	};
}

export async function loadMigrations(migrationDir = defaultMigrationDirectory()): Promise<Migration[]> {
	const files = (await readdir(migrationDir))
		.filter(file => /^\d+-.+\.js$/.test(file))
		.sort((a, b) => migrationTimestamp(a) - migrationTimestamp(b));

	return await Promise.all(files.map(file => loadMigration(resolve(migrationDir, file))));
}

export async function resetDatabase(pool: MiDrizzlePool): Promise<void> {
	await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
	await pool.query('CREATE SCHEMA public');
	await pool.query('GRANT ALL ON SCHEMA public TO public');
	await pool.query('GRANT ALL ON SCHEMA public TO CURRENT_USER');
}

async function ensureMigrationsTable(pool: MiDrizzlePool): Promise<void> {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS "migrations" (
			"id" SERIAL NOT NULL,
			"timestamp" bigint NOT NULL,
			"name" character varying NOT NULL,
			CONSTRAINT "PK_migrations_id" PRIMARY KEY ("id")
		)
	`);
}

async function listAppliedMigrations(pool: MiDrizzlePool): Promise<AppliedMigration[]> {
	await ensureMigrationsTable(pool);

	const result = await pool.query<AppliedMigration>('SELECT "timestamp", "name" FROM "migrations" ORDER BY "timestamp" ASC');
	return result.rows.map(row => ({
		timestamp: Number(row.timestamp),
		name: row.name,
	}));
}

async function insertAppliedMigration(client: Pool | PoolClient, migration: Migration): Promise<void> {
	await client.query('INSERT INTO "migrations"("timestamp", "name") VALUES ($1, $2)', [migration.timestamp, migration.name]);
}

async function deleteAppliedMigration(client: Pool | PoolClient, migration: Migration): Promise<void> {
	await client.query('DELETE FROM "migrations" WHERE "timestamp" = $1 AND "name" = $2', [migration.timestamp, migration.name]);
}

async function withTransaction(pool: MiDrizzlePool, callback: (client: PoolClient) => Promise<void>): Promise<void> {
	const client = await pool.connect();

	try {
		await client.query('BEGIN');
		await callback(client);
		await client.query('COMMIT');
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

async function runSingleMigration(pool: MiDrizzlePool, migration: Migration, direction: 'up' | 'down'): Promise<void> {
	const run = async (client: Pool | PoolClient): Promise<void> => {
		const queryRunner = new PgMigrationQueryRunner(client);

		if (direction === 'up') {
			await migration.up(queryRunner);
			await insertAppliedMigration(client, migration);
		} else {
			await migration.down(queryRunner);
			await deleteAppliedMigration(client, migration);
		}
	};

	if (migration.transaction === false) {
		await run(pool);
	} else {
		await withTransaction(pool, run);
	}
}

export async function runMigrations(pool: MiDrizzlePool, migrationDir = defaultMigrationDirectory()): Promise<Migration[]> {
	await ensureMigrationsTable(pool);

	const migrations = await loadMigrations(migrationDir);
	const applied = new Set((await listAppliedMigrations(pool)).map(migration => migration.timestamp));
	const pending = migrations.filter(migration => !applied.has(migration.timestamp));

	if (pending.length === 0) {
		return [];
	}

	const allCanShareTransaction = pending.every(migration => migration.transaction !== false);
	if (allCanShareTransaction) {
		await withTransaction(pool, async client => {
			const queryRunner = new PgMigrationQueryRunner(client);
			for (const migration of pending) {
				await migration.up(queryRunner);
				await insertAppliedMigration(client, migration);
			}
		});
	} else {
		for (const migration of pending) {
			await runSingleMigration(pool, migration, 'up');
		}
	}

	return pending;
}

export async function revertLastMigration(pool: MiDrizzlePool, migrationDir = defaultMigrationDirectory()): Promise<Migration | null> {
	const applied = await listAppliedMigrations(pool);
	const lastApplied = applied.at(-1);
	if (lastApplied == null) {
		return null;
	}

	const migration = (await loadMigrations(migrationDir)).find(item => item.timestamp === lastApplied.timestamp);
	if (migration == null) {
		throw new Error(`Applied migration file was not found: ${lastApplied.name}`);
	}

	await runSingleMigration(pool, migration, 'down');
	return migration;
}

export async function listPendingMigrations(pool: MiDrizzlePool, migrationDir = defaultMigrationDirectory()): Promise<Migration[]> {
	const migrations = await loadMigrations(migrationDir);
	const applied = new Set((await listAppliedMigrations(pool)).map(migration => migration.timestamp));

	return migrations.filter(migration => !applied.has(migration.timestamp));
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
					console.log(`Migrated: ${migration.name}`);
				}
				if (migrations.length === 0) console.log('No migrations are pending.');
				break;
			}
			case 'down': {
				const migration = await revertLastMigration(pool);
				console.log(migration == null ? 'No migrations were applied.' : `Reverted: ${migration.name}`);
				break;
			}
			case 'check': {
				const pending = await listPendingMigrations(pool);
				if (pending.length > 0) {
					for (const migration of pending) {
						console.error(`Pending migration: ${migration.name}`);
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
