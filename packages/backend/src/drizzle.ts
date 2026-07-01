/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// https://github.com/typeorm/typeorm/issues/2400
import pg, { type Pool, type PoolConfig } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Logger as DrizzleLogger } from 'drizzle-orm/logger';
import type { Config } from '@/config.js';
import MisskeyLogger from '@/logger.js';

pg.types.setTypeParser(20, Number);

const log = process.env.NODE_ENV !== 'production';
const dbLogger = new MisskeyLogger('db');
const sqlLogger = dbLogger.createSubLogger('drizzle', 'gray');

export type MiDrizzlePool = Pool;
export type MiDrizzleDatabase = NodePgDatabase;

type LoggerProps = {
	disableQueryTruncation?: boolean;
	enableQueryParamLogging?: boolean;
};

function truncateSql(sql: string): string {
	return sql.length > 100 ? `${sql.substring(0, 100)}...` : sql;
}

function stringifyParameter(param: unknown): unknown {
	if (param instanceof Date) {
		return param.toISOString();
	} else {
		return param;
	}
}

class MyDrizzleLogger implements DrizzleLogger {
	constructor(private props: LoggerProps = {}) {
	}

	private transformQueryLog(sql: string): string {
		if (!this.props.disableQueryTruncation) {
			return truncateSql(sql);
		}

		return sql;
	}

	private transformParameters(parameters: unknown[]): unknown[] | undefined {
		if (this.props.enableQueryParamLogging && parameters.length > 0) {
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
		host: config.db.host,
		port: config.db.port,
		user: config.db.user,
		password: config.db.pass,
		database: config.db.db,
		statement_timeout: 1000 * 10,
		...config.db.extra,
	};

	return new pg.Pool(poolConfig);
}

export function createDrizzleDatabase(pool: MiDrizzlePool, config: Config): MiDrizzleDatabase {
	return drizzle({
		client: pool,
		logger: log
			? new MyDrizzleLogger({
				disableQueryTruncation: config.logging?.sql?.disableQueryTruncation,
				enableQueryParamLogging: config.logging?.sql?.enableQueryParamLogging,
			})
			: undefined,
	});
}
