/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { Logger as DrizzleLogger } from 'drizzle-orm/logger';
import type { Config } from '@/config.js';
import MisskeyLogger from '@/logger.js';

const dbLogger = new MisskeyLogger('db');
const sqlLogger = dbLogger.createSubLogger('drizzle', 'gray');

export type DatabaseQueryResult<Row> = {
	rows: Row[];
	rowCount: number | null;
};

interface DatabaseQueryResultHKT extends PgQueryResultHKT {
	type: DatabaseQueryResult<this['row']>;
}

export type MiDrizzleDatabase = PgDatabase<DatabaseQueryResultHKT>;

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
	}
	return param;
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

export function createDrizzleQueryLogger(config: Config): DrizzleLogger | undefined {
	return config.observability.logging.sql.enabled
		? new MyDrizzleLogger({
				maximumQueryLength: config.observability.logging.sql.maximumQueryLength,
				logParameters: config.observability.logging.sql.logParameters,
			})
		: undefined;
}
