/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import type { Config } from '@/config.js';
import { createDrizzleQueryLogger, type MiDrizzleDatabase } from '@/drizzle.js';
import MisskeyLogger from '@/logger.js';

// bun ランタイム限定のDBドライバ。`import { SQL } from 'bun'` を含むため、node で動かす経路
// (unit / e2e テストランナー) から静的に読まれてはならない。呼び出しは動的 import 経由に限る。

const logger = new MisskeyLogger('db').createSubLogger('bun-sql', 'gray');

export type BunSqlRuntime = {
	db: MiDrizzleDatabase;
	close: () => Promise<void>;
};

type BunSqlQuery = {
	values: () => Promise<unknown[][]>;
	then: <T>(onFulfilled: (rows: unknown[]) => T, onRejected?: (error: unknown) => T) => Promise<T>;
};

type DrizzleBunSqlClient = {
	unsafe: (query: string, params?: unknown[]) => BunSqlQuery;
	begin: (callback: (client: DrizzleBunSqlClient) => Promise<unknown>) => Promise<unknown>;
	savepoint: (callback: (client: DrizzleBunSqlClient) => Promise<unknown>) => Promise<unknown>;
};

function padNumber(value: number, length = 2): string {
	return String(Math.abs(value)).padStart(length, '0');
}

// Bun.sql は Date を `toString()` (例: `Fri Aug 07 2026 03:29:40 GMT+0900 (Japan Standard Time)`) で送るため
// PostgreSQL が `time zone "gmt+0900" not recognized` で拒否する。node-postgres と同じローカル時刻 +
// オフセット表記へ変換する。
function encodeDate(value: Date): string {
	const offsetMinutes = -value.getTimezoneOffset();
	const sign = offsetMinutes < 0 ? '-' : '+';
	const date = `${padNumber(value.getFullYear(), 4)}-${padNumber(value.getMonth() + 1)}-${padNumber(value.getDate())}`;
	const time = `${padNumber(value.getHours())}:${padNumber(value.getMinutes())}:${padNumber(value.getSeconds())}.${padNumber(value.getMilliseconds(), 3)}`;
	const offset = `${sign}${padNumber(Math.trunc(offsetMinutes / 60))}:${padNumber(offsetMinutes % 60)}`;
	return `${date}T${time}${offset}`;
}

function encodePostgresArrayElement(value: unknown): string {
	if (value == null) return 'NULL';
	if (Array.isArray(value)) return encodePostgresArray(value);
	const text = value instanceof Date ? encodeDate(value) : String(value);
	return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function encodePostgresArray(values: readonly unknown[]): string {
	return `{${values.map(encodePostgresArrayElement).join(',')}}`;
}

// Bun.sql は JS の配列を PostgreSQL の配列パラメータへ変換しないため、`= ANY($1)` に配列を渡すと
// `malformed array literal` で落ちる。ドライバ境界で配列リテラルへ変換して node-postgres と揃える。
function toBunSqlParameter(param: unknown): unknown {
	if (Array.isArray(param)) return encodePostgresArray(param);
	if (param instanceof Date) return encodeDate(param);
	return param;
}

// node-postgres は `{ rows, rowCount }` を返すが Bun.sql は行の配列そのものを返す。
// `db.execute()` の戻り値を `result.rows` で読む既存コードのために、配列側へ形を合わせる。
function withNodePostgresResultShape(rows: unknown): unknown {
	if (!Array.isArray(rows)) return rows;
	const affected = (rows as { count?: number }).count;
	Object.defineProperty(rows, 'rows', { value: rows, configurable: true });
	Object.defineProperty(rows, 'rowCount', { value: affected ?? rows.length, configurable: true });
	return rows;
}

// Bun.sql の PostgresError は SQLSTATE を `errno` に入れ、`code` には `ERR_POSTGRES_SERVER_ERROR` を入れる。
// 一意制約違反 (23505) やタイムアウト (57014) を `code` で判定している呼び出し側のために node-postgres へ寄せる。
function normalizeDatabaseError(error: unknown): unknown {
	if (error == null || typeof error !== 'object') return error;
	const candidate = error as { code?: unknown; errno?: unknown };
	if (candidate.code !== 'ERR_POSTGRES_SERVER_ERROR' || typeof candidate.errno !== 'string') return error;
	Object.defineProperty(error, 'code', { value: candidate.errno, configurable: true, writable: true });
	return error;
}

function wrapBunSqlClient(client: SQL): DrizzleBunSqlClient {
	return {
		unsafe: (queryText, params) => {
			// Bun.sql のクエリオブジェクトは遅延実行。`.values()` と await のどちらが先に来るか
			// ドライバ側の分岐次第なので、ここでは実行せずに包むだけにする。
			const query =
				params == null || params.length === 0
					? client.unsafe(queryText)
					: client.unsafe(queryText, params.map(toBunSqlParameter) as never[]);
			return {
				values: () =>
					(query.values() as Promise<unknown[][]>).catch((error: unknown) => {
						throw normalizeDatabaseError(error);
					}),
				then: (onFulfilled, onRejected) =>
					(query.then(withNodePostgresResultShape) as Promise<unknown[]>).then(onFulfilled, (error: unknown) => {
						const normalized = normalizeDatabaseError(error);
						if (onRejected != null) return onRejected(normalized);
						throw normalized;
					}),
			};
		},
		begin: (callback) =>
			(client.begin((tx) => callback(wrapBunSqlClient(tx as unknown as SQL))) as Promise<unknown>).catch(
				(error: unknown) => {
					throw normalizeDatabaseError(error);
				},
			),
		savepoint: (callback) =>
			(client.savepoint((tx) => callback(wrapBunSqlClient(tx as unknown as SQL))) as Promise<unknown>).catch(
				(error: unknown) => {
					throw normalizeDatabaseError(error);
				},
			),
	};
}

function buildConnectionUrl(config: Config): string {
	const primary = config.database.primary;
	const url = new URL(`postgres://${primary.host}:${primary.port}/${encodeURIComponent(primary.name)}`);
	url.username = encodeURIComponent(primary.user);
	url.password = encodeURIComponent(primary.password);
	// Bun.sql には接続確立時にSQLを流すフックが無いので、statement_timeout は startup parameter で渡す。
	url.searchParams.set('statement_timeout', `${config.database.pool.statementTimeoutMs}`);
	return url.toString();
}

export function createBunSqlRuntime(config: Config): BunSqlRuntime {
	const client = new SQL(buildConnectionUrl(config), {
		max: config.database.pool.maximumConnections,
		idleTimeout: Math.ceil(config.database.pool.idleConnectionTimeoutMs / 1000),
		connectionTimeout: Math.ceil(config.database.pool.connectionTimeoutMs / 1000),
		// 名前付きprepared statementはタイムライン系の `= ANY($n)` でgeneric planに落ちて
		// 107倍遅くなる実測がある (src/db/prepared.ts 参照) ため、既定のprepareは切る。
		prepare: false,
		...(config.database.primary.ssl == null ? {} : { ssl: config.database.primary.ssl }),
	});
	const queryLogger = createDrizzleQueryLogger(config);
	const db = drizzle({
		client: wrapBunSqlClient(client) as unknown as SQL,
		...(queryLogger === undefined ? {} : { logger: queryLogger }),
	});

	logger.info(`Using Bun.sql driver (max: ${config.database.pool.maximumConnections} connections)`);

	return {
		// 結果の型マッピングは node-postgres 経路と一致することを実データで確認済 (timestamp / 配列 /
		// jsonb / bytea)。`rows` の形もラッパで揃えているため、呼び出し側の型は共通のものを使う。
		db: db as unknown as MiDrizzleDatabase,
		close: () => client.close(),
	};
}
