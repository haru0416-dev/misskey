/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';

const migrationDirectory = fileURLToPath(new URL('../migration/', import.meta.url));
const baselineDirectory = join(migrationDirectory, 'baseline');
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const hash = (content) => createHash('sha256').update(content).digest('hex');
const identifier = (name) => `"${name.replaceAll('"', '""')}"`;

function connectionArgument() {
	if (process.argv.length !== 3) {
		throw new Error('Usage: bun scripts/generate-baseline.mjs postgresql://USER:PASSWORD@HOST:PORT/ADMIN_DATABASE');
	}
	let connection;
	try {
		connection = new URL(process.argv[2]);
	} catch {
		throw new Error('The explicit admin connection must be a PostgreSQL URL.');
	}
	if (!['postgres:', 'postgresql:'].includes(connection.protocol) || connection.pathname.length < 2) {
		throw new Error('The explicit admin connection must include a PostgreSQL admin database.');
	}
	return connection;
}

async function coveredMigrations() {
	const journal = JSON.parse(await readFile(join(migrationDirectory, 'meta/_journal.json'), 'utf8'));
	if (journal.dialect !== 'postgresql' || !Array.isArray(journal.entries) || journal.entries.length === 0) {
		throw new Error('Invalid immutable migration journal.');
	}
	return Promise.all(
		journal.entries.map(async (entry, position) => {
			if (
				entry.idx !== position ||
				!Number.isSafeInteger(entry.when) ||
				entry.when <= (journal.entries[position - 1]?.when ?? 0) ||
				!/^\d{4}_[a-z0-9_]+$/.test(entry.tag)
			) {
				throw new Error(`Invalid immutable migration journal entry ${position}.`);
			}
			return {
				idx: entry.idx,
				when: entry.when,
				tag: entry.tag,
				hash: hash(await readFile(join(migrationDirectory, `${entry.tag}.sql`))),
			};
		}),
	);
}

async function dumpDatabase(connection) {
	// 接続情報は一時的な子プロセス環境だけに渡し、生成物・pg_dump の引数には残さない。
	const environment = { ...process.env };
	for (const key of Object.keys(environment)) {
		if (key.startsWith('PG')) delete environment[key];
	}
	Object.assign(environment, {
		PGHOST: connection.hostname,
		PGPORT: connection.port || '5432',
		PGUSER: decodeURIComponent(connection.username),
		PGPASSWORD: decodeURIComponent(connection.password),
		PGDATABASE: decodeURIComponent(connection.pathname.slice(1)),
		PGCLIENTENCODING: 'UTF8',
		LC_ALL: 'C',
	});
	const options = {
		sslmode: 'PGSSLMODE',
		sslrootcert: 'PGSSLROOTCERT',
		sslcert: 'PGSSLCERT',
		sslkey: 'PGSSLKEY',
		connect_timeout: 'PGCONNECT_TIMEOUT',
	};
	for (const [name, value] of connection.searchParams) {
		if (!Object.hasOwn(options, name)) throw new Error(`Unsupported PostgreSQL connection option: ${name}`);
		environment[options[name]] = value;
	}
	const subprocess = Bun.spawn(
		[
			'pg_dump',
			'--exclude-schema=drizzle',
			'--no-owner',
			'--no-acl',
			'--quote-all-identifiers',
			'--column-inserts',
			'--rows-per-insert=1',
			'--encoding=UTF8',
			'--no-password',
		],
		{ env: environment, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
	);
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(subprocess.stdout).text(),
		new Response(subprocess.stderr).text(),
		subprocess.exited,
	]);
	if (exitCode !== 0) throw new Error(`pg_dump failed (${exitCode}): ${stderr.trim()}`);
	return stdout;
}

function blockCommentEnd(text, start) {
	let depth = 1;
	for (let position = start + 2; position < text.length; position++) {
		if (text.startsWith('/*', position)) {
			depth++;
			position++;
		} else if (text.startsWith('*/', position)) {
			depth--;
			position++;
			if (depth === 0) return position + 1;
		}
	}
	throw new Error('Unterminated SQL block comment in pg_dump.');
}

function statementEnd(text, start) {
	for (let position = start; position < text.length; position++) {
		const character = text[position];
		if (text.startsWith('--', position)) {
			const newline = text.indexOf('\n', position + 2);
			position = newline === -1 ? text.length : newline;
		} else if (text.startsWith('/*', position)) {
			position = blockCommentEnd(text, position) - 1;
		} else if (character === "'" || character === '"') {
			const escaped =
				character === "'" &&
				/[eE]/.test(text[position - 1] ?? '') &&
				!/[A-Za-z0-9_$\u0080-\uFFFF]/.test(text[position - 2] ?? '');
			let closed = false;
			for (position++; position < text.length; position++) {
				if (escaped && text[position] === '\\') position++;
				else if (text[position] === character) {
					if (text[position + 1] === character) position++;
					else {
						closed = true;
						break;
					}
				}
			}
			if (!closed) throw new Error('Unterminated quoted SQL value in pg_dump.');
		} else if (character === '$' && !/[A-Za-z0-9_$\u0080-\uFFFF]/.test(text[position - 1] ?? '')) {
			const delimiter = /^\$(?:[A-Za-z_\u0080-\uFFFF][A-Za-z0-9_\u0080-\uFFFF]*)?\$/.exec(text.slice(position))?.[0];
			if (delimiter) {
				const end = text.indexOf(delimiter, position + delimiter.length);
				if (end === -1) throw new Error('Unterminated dollar-quoted SQL value in pg_dump.');
				position = end + delimiter.length - 1;
			}
		} else if (character === ';') return position + 1;
	}
	throw new Error('Unterminated SQL statement in pg_dump.');
}

function administrativeStatement(statement) {
	return (
		/^SET (?:statement_timeout|lock_timeout|idle_in_transaction_session_timeout|transaction_timeout) = 0;$/.test(
			statement,
		) ||
		/^SET (?:client_encoding = 'UTF8'|standard_conforming_strings = on|check_function_bodies = false|xmloption = content|client_min_messages = warning|row_security = off|default_tablespace = ''|default_table_access_method = "?heap"?);$/.test(
			statement,
		) ||
		/^SELECT (?:"pg_catalog"|pg_catalog)\.(?:"set_config"|set_config)\('search_path', '', false\);$/.test(statement)
	);
}

function dumpObjects(dump) {
	const objects = [];
	let current;
	const append = (text) => {
		if (current) current.parts.push(text);
		else if (text.trim() !== '') throw new Error('Unrecognized pg_dump preamble.');
	};
	// メタデータと設定を読むのは SQL 文の外側だけ。引用値・関数本体・入れ子コメントのバイト列は変更しない。
	for (let position = 0; position < dump.length;) {
		const remaining = dump.slice(position);
		const whitespace = /^\s+/.exec(remaining)?.[0];
		if (whitespace) {
			append(whitespace);
			position += whitespace.length;
			continue;
		}
		const lineStart = position === 0 || dump[position - 1] === '\n';
		const header = lineStart
			? /^--\n-- (?:Data for )?Name: (.*); Type: ([A-Z ]+); Schema: (.*); Owner: (.*)\n--\n/.exec(remaining)
			: null;
		if (header) {
			current = { name: header[1], type: header[2], schema: header[3], parts: [] };
			objects.push(current);
			position += header[0].length;
			continue;
		}
		if (remaining.startsWith('--') || remaining.startsWith('\\')) {
			const newline = dump.indexOf('\n', position);
			const end = newline === -1 ? dump.length : newline + 1;
			const line = dump.slice(position, newline === -1 ? dump.length : newline);
			if (remaining.startsWith('\\')) {
				if (!lineStart || !/^\\(?:un)?restrict [A-Za-z0-9]+$/.test(line)) {
					throw new Error('Unsupported psql directive in pg_dump.');
				}
			} else if (
				!/^--(?: PostgreSQL database dump(?: complete)?| Dumped (?:from database|by pg_dump) version .*)?$/.test(line)
			) {
				append(dump.slice(position, end));
			}
			position = end;
			continue;
		}
		if (remaining.startsWith('/*')) {
			const end = blockCommentEnd(dump, position);
			append(dump.slice(position, end));
			position = end;
			continue;
		}
		const end = statementEnd(dump, position);
		const statement = dump.slice(position, end);
		if (administrativeStatement(statement)) position = dump[end] === '\n' ? end + 1 : end;
		else {
			append(statement);
			position = end;
		}
	}
	if (objects.length === 0) throw new Error('Missing pg_dump object headers.');
	return objects.map(({ parts, ...object }) => ({ ...object, body: parts.join('').trim() }));
}

export async function splitDump(dump, sql) {
	const tables = new Set(
		(
			await sql.unsafe(`
		SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public' AND c.relkind = 'r'
	`)
		).map((row) => row.name),
	);
	const indexes = new Map(
		(
			await sql.unsafe(`
		SELECT i.relname AS name, t.relname AS table_name FROM pg_index x
		JOIN pg_class i ON i.oid = x.indexrelid JOIN pg_class t ON t.oid = x.indrelid
		JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = 'public'
	`)
		).map((row) => [row.name, row.table_name]),
	);
	const sequences = new Map(
		(
			await sql.unsafe(`
		SELECT s.relname AS name, t.relname AS table_name FROM pg_class s
		JOIN pg_namespace n ON n.oid = s.relnamespace
		LEFT JOIN pg_depend d ON d.classid = 'pg_class'::regclass AND d.objid = s.oid AND d.deptype IN ('a', 'i')
		LEFT JOIN pg_class t ON t.oid = d.refobjid
		WHERE n.nspname = 'public' AND s.relkind = 'S'
	`)
		).map((row) => [row.name, row.table_name]),
	);
	for (const name of tables) {
		if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unsupported baseline table filename: ${name}`);
	}
	const files = new Map();
	const seenTables = new Set();
	const add = (file, object) => {
		if (object.body === '') return;
		const blocks = files.get(file) ?? [];
		blocks.push(`-- ${object.type}: ${object.name}\n${object.body}\n`);
		files.set(file, blocks);
	};
	const tableName = (object) => {
		const name = object.name.split(' ')[0];
		if (!tables.has(name)) throw new Error(`Unknown table for ${object.type}: ${object.name}`);
		return name;
	};
	for (const object of dumpObjects(dump)) {
		if (object.type === 'SCHEMA' && object.name === 'public' && /^CREATE SCHEMA "public";$/.test(object.body)) continue;
		if (
			object.type === 'COMMENT' &&
			['SCHEMA public', 'SCHEMA "public"'].includes(object.name) &&
			/^COMMENT ON SCHEMA "public" IS 'standard public schema';$/.test(object.body)
		)
			continue;
		if (object.schema !== 'public' && !(object.schema === '-' && ['EXTENSION', 'COMMENT'].includes(object.type))) {
			throw new Error(`Unsupported dump object schema: ${object.schema} (${object.type}: ${object.name})`);
		}
		switch (object.type) {
			case 'EXTENSION':
			case 'TYPE':
			case 'FUNCTION':
				add('000-prerequisites.sql', object);
				break;
			case 'COMMENT':
				if (!object.body.startsWith('COMMENT ON EXTENSION '))
					throw new Error(`Unsupported dump comment: ${object.name}`);
				add('000-prerequisites.sql', object);
				break;
			case 'TABLE':
				seenTables.add(tableName(object));
				add(`100-tables/${tableName(object)}.sql`, object);
				break;
			case 'SEQUENCE':
			case 'SEQUENCE OWNED BY': {
				if (!sequences.has(object.name)) throw new Error(`Unknown sequence: ${object.name}`);
				const table = sequences.get(object.name);
				add(table ? `100-tables/${table}.sql` : '010-sequences.sql', object);
				break;
			}
			case 'DEFAULT':
				add(`100-tables/${tableName(object)}.sql`, object);
				break;
			case 'CONSTRAINT':
				add(`100-tables/${tableName(object)}.sql`, object);
				break;
			case 'FK CONSTRAINT':
				add(`200-foreign-keys/${tableName(object)}.sql`, object);
				break;
			case 'INDEX': {
				const table = indexes.get(object.name);
				if (!table) throw new Error(`Unknown index: ${object.name}`);
				add(`100-tables/${table}.sql`, object);
				break;
			}
			case 'TABLE DATA':
				if (object.body !== '' && !object.body.startsWith('INSERT INTO '))
					throw new Error(`Unsupported dump seed: ${object.name}`);
				tableName(object);
				add('300-seed.sql', object);
				break;
			case 'SEQUENCE SET':
				if (
					!sequences.has(object.name) ||
					!/^SELECT (?:"pg_catalog"|pg_catalog)\.(?:"setval"|setval)\(/.test(object.body)
				)
					throw new Error(`Unsupported sequence state: ${object.name}`);
				add('300-seed.sql', object);
				break;
			case 'TRIGGER':
				tableName(object);
				add('400-triggers.sql', object);
				break;
			default:
				throw new Error(`Unsupported pg_dump object: ${object.type} (${object.name})`);
		}
	}
	if (seenTables.size !== tables.size) throw new Error('pg_dump omitted public tables.');
	return new Map([...files].sort(([a], [b]) => compare(a, b)).map(([file, blocks]) => [file, blocks.join('\n')]));
}

async function existingManagedFiles(directory) {
	let manifest;
	try {
		manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
	} catch (error) {
		if (error.code === 'ENOENT') {
			try {
				await readdir(directory);
			} catch (missing) {
				if (missing.code === 'ENOENT') return false;
				throw missing;
			}
		}
		throw error;
	}
	if (
		manifest.version !== 1 ||
		!Array.isArray(manifest.files) ||
		manifest.files.some((file) => typeof file !== 'string' || !/^(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.sql$/.test(file))
	) {
		throw new Error('Refusing to replace an invalid existing baseline manifest.');
	}
	const managed = new Set(['manifest.json', ...manifest.files]);
	async function visit(relative = '') {
		for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
			const path = relative ? `${relative}/${entry.name}` : entry.name;
			if (entry.isDirectory()) await visit(path);
			else if (!entry.isFile() || !managed.has(path))
				throw new Error(`Refusing to replace unmanaged baseline path: ${path}`);
		}
	}
	await visit();
	return true;
}

async function publish(files, migrations) {
	const token = randomUUID();
	const staging = join(migrationDirectory, `.baseline-${token}`);
	const backup = join(migrationDirectory, `.baseline-backup-${token}`);
	let backedUp = false;
	let stagingCreated = false;
	const errors = [];
	try {
		await mkdir(staging);
		stagingCreated = true;
		for (const [file, content] of files) {
			await mkdir(dirname(join(staging, file)), { recursive: true });
			await writeFile(join(staging, file), content);
		}
		await writeFile(
			join(staging, 'manifest.json'),
			`${JSON.stringify({ version: 1, migrations, files: [...files.keys()] }, null, 2)}\n`,
		);
		if (await existingManagedFiles(baselineDirectory)) {
			await rename(baselineDirectory, backup);
			backedUp = true;
		}
		try {
			await rename(staging, baselineDirectory);
			stagingCreated = false;
		} catch (error) {
			if (backedUp) {
				try {
					await rename(backup, baselineDirectory);
					backedUp = false;
				} catch (restoreError) {
					throw new AggregateError([error, restoreError], 'Baseline publication and restoration failed.', {
						cause: restoreError,
					});
				}
			}
			throw error;
		}
		if (backedUp) await rm(backup, { recursive: true });
	} catch (error) {
		errors.push(error);
	} finally {
		if (stagingCreated) {
			try {
				await rm(staging, { recursive: true, force: true });
			} catch (error) {
				errors.push(error);
			}
		}
	}
	if (errors.length > 0) throw new AggregateError(errors, 'Baseline publication failed.');
}

async function main() {
	const connection = connectionArgument();
	const migrations = await coveredMigrations();
	const scratchName = `misskey_baseline_${randomUUID().replaceAll('-', '')}`;
	const scratchConnection = new URL(connection);
	scratchConnection.pathname = `/${scratchName}`;
	const admin = new SQL(connection.href, { max: 1, idleTimeout: 0 });
	let scratch;
	let created = false;
	let files;
	const errors = [];
	try {
		await admin.unsafe(`CREATE DATABASE ${identifier(scratchName)} TEMPLATE template0`);
		created = true;
		scratch = new SQL(scratchConnection.href, { max: 1, idleTimeout: 0 });
		await migrate(drizzle({ client: scratch }), { migrationsFolder: migrationDirectory });
		files = await splitDump(await dumpDatabase(scratchConnection), scratch);
		const currentMigrations = await coveredMigrations();
		if (JSON.stringify(migrations) !== JSON.stringify(currentMigrations))
			throw new Error('Immutable migration inputs changed during baseline generation.');
	} catch (error) {
		errors.push(error);
	} finally {
		if (scratch) {
			try {
				await scratch.close({ timeout: 0 });
			} catch (error) {
				errors.push(error);
			}
		}
		if (created) {
			try {
				// この実行が作成したランダム名だけを削除する。管理 DB や既存のアプリ DB は対象にしない。
				if (
					!/^misskey_baseline_[a-f0-9]{32}$/.test(scratchName) ||
					scratchName === decodeURIComponent(connection.pathname.slice(1))
				) {
					errors.push(new Error('Refusing to drop a database outside this generator ownership.'));
				} else {
					await admin.unsafe(`DROP DATABASE ${identifier(scratchName)} WITH (FORCE)`);
				}
			} catch (error) {
				errors.push(error);
			}
		}
		try {
			await admin.close({ timeout: 0 });
		} catch (error) {
			errors.push(error);
		}
	}
	if (errors.length > 0) throw new AggregateError(errors, 'Baseline generation failed.');
	await publish(files, migrations);
	console.log(`Generated ${files.size} baseline SQL files covering ${migrations.length} immutable migrations.`);
}

if (import.meta.main) await main();
