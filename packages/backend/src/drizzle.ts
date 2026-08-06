/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Keep int8 values as numbers for compatibility with existing query code.
import pg, { type Pool, type PoolConfig } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Logger as DrizzleLogger } from 'drizzle-orm/logger';
import type { Config } from '@/config.js';
import MisskeyLogger from '@/logger.js';

pg.types.setTypeParser(20, Number);

const dbLogger = new MisskeyLogger('db');
const sqlLogger = dbLogger.createSubLogger('drizzle', 'gray');

export type MiDrizzlePool = Pool;
export type MiDrizzleDatabase = NodePgDatabase;

type LoggerProps = {
	maximumQueryLength: number;
	logParameters: boolean;
};

function truncateSql(sql: string, maximumLength: number): string {
	return sql.length > maximumLength ? `${sql.substring(0, maximumLength)}...` : sql;
}

function stringifyParameter(param: unknown): unknown {
	if (param instanceof Date) {
		return param.toISOString();
	} else {
		return param;
	}
}

class MyDrizzleLogger implements DrizzleLogger {
	constructor(private props: LoggerProps) {}

	private transformQueryLog(sql: string): string {
		return truncateSql(sql, this.props.maximumQueryLength);
	}

	private transformParameters(parameters: unknown[]): unknown[] | undefined {
		if (this.props.logParameters && parameters.length > 0) {
			return parameters.map(stringifyParameter);
		}

		return undefined;
	}

	public logQuery(query: string, params: unknown[]): void {
		sqlLogger.info(this.transformQueryLog(query), this.transformParameters(params));
	}
}

export function createDrizzlePool(config: Config): MiDrizzlePool {
	const poolConfig: PoolConfig = {
		host: config.database.primary.host,
		port: config.database.primary.port,
		user: config.database.primary.user,
		password: config.database.primary.password,
		database: config.database.primary.name,
		...(config.database.primary.ssl == null ? {} : { ssl: config.database.primary.ssl }),
		min: config.database.pool.minimumConnections,
		max: config.database.pool.maximumConnections,
		connectionTimeoutMillis: config.database.pool.connectionTimeoutMs,
		idleTimeoutMillis: config.database.pool.idleConnectionTimeoutMs,
		statement_timeout: config.database.pool.statementTimeoutMs,
	};

	return new pg.Pool(poolConfig);
}

export function createDrizzleDatabase(pool: MiDrizzlePool, config: Config): MiDrizzleDatabase {
	const logger = config.observability.logging.sql.enabled
		? new MyDrizzleLogger({
				maximumQueryLength: config.observability.logging.sql.maximumQueryLength,
				logParameters: config.observability.logging.sql.logParameters,
			})
		: undefined;
	return drizzle({
		client: pool,
		...(logger === undefined ? {} : { logger }),
	});
}
