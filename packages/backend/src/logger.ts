/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import cluster from 'node:cluster';
import chalk from 'chalk';
import { default as convertColor } from 'color-convert';
import { bindThis } from '@/decorators.js';
import { formatTime } from '@/misc/format-date-time.js';
import { envOption } from './env.js';
import type { Config } from './config.js';
import type { Keyword } from 'color-convert';

type Context = {
	name: string;
	color?: Keyword;
};

type Level = 'error' | 'success' | 'warning' | 'debug' | 'info';

let loggingConfig: Config['observability']['logging'] = {
	level: 'info',
	format: 'pretty',
	includeTimestamp: false,
	sql: { enabled: false, logParameters: false, maximumQueryLength: 100 },
};

export function configureLogger(config: Config): void {
	loggingConfig = config.observability.logging;
}

function shouldLog(level: Level): boolean {
	if (envOption.verbose) return true;
	const severity = { debug: 10, info: 20, success: 20, warning: 30, error: 40 } as const;
	return severity[level] >= severity[loggingConfig.level];
}

/**
 * Logger.debug が実際にログを出すかどうか。production では既定でdebugログを破棄するため、
 * 呼び出し側でメッセージ文字列の構築自体を省略したい場合 (高頻度呼び出し箇所) にこれで事前判定できる。
 */
export function isDebugLoggingEnabled(): boolean {
	return (
		(process.env['NODE_ENV'] !== 'production' || loggingConfig.level === 'debug' || envOption.verbose) &&
		!envOption.quiet
	);
}

export default class Logger {
	private context: Context;
	private parentLogger: Logger | null = null;

	constructor(context: string, color?: Keyword) {
		this.context = {
			name: context,
			...(color === undefined ? {} : { color }),
		};
	}

	@bindThis
	public createSubLogger(context: string, color?: Keyword): Logger {
		const logger = new Logger(context, color);
		logger.parentLogger = this;
		return logger;
	}

	@bindThis
	private log(
		level: Level,
		message: string,
		data?: Record<string, unknown> | Error | unknown[] | null,
		important = false,
		subContexts: Context[] = [],
	): void {
		// NODE_ENV=test は暗黙に quiet になるが、MK_VERBOSE を明示した時だけはそれより優先させる
		// (e2e で発生したサーバー側例外を追うにはログを出せる手段が要る)。
		if ((envOption.quiet && !envOption.verbose) || !shouldLog(level)) return;

		if (this.parentLogger) {
			this.parentLogger.log(level, message, data, important, [this.context].concat(subContexts));
			return;
		}

		const time = formatTime(new Date());
		const worker = cluster.isPrimary ? '*' : cluster.worker!.id;
		const contextNames = [this.context].concat(subContexts).map((context) => context.name);
		if (loggingConfig.format === 'json') {
			console.log(
				JSON.stringify({
					time: new Date().toISOString(),
					level,
					worker,
					contexts: contextNames,
					message,
					...(data == null ? {} : { data }),
				}),
			);
			return;
		}
		const l =
			level === 'error'
				? important
					? chalk.bgRed.white('ERR ')
					: chalk.red('ERR ')
				: level === 'warning'
					? chalk.yellow('WARN')
					: level === 'success'
						? important
							? chalk.bgGreen.white('DONE')
							: chalk.green('DONE')
						: level === 'debug'
							? chalk.gray('VERB')
							: level === 'info'
								? chalk.blue('INFO')
								: null;
		const contexts = [this.context]
			.concat(subContexts)
			.map((d) => (d.color ? chalk.rgb(...convertColor.keyword.rgb(d.color))(d.name) : chalk.white(d.name)));
		const m =
			level === 'error'
				? chalk.red(message)
				: level === 'warning'
					? chalk.yellow(message)
					: level === 'success'
						? chalk.green(message)
						: level === 'debug'
							? chalk.gray(message)
							: level === 'info'
								? message
								: null;

		let log = `${l} ${worker}\t[${contexts.join(' ')}]\t${m}`;
		if (envOption.withLogTime || loggingConfig.includeTimestamp) log = chalk.gray(time) + ' ' + log;

		const args: unknown[] = [important ? chalk.bold(log) : log];
		if (data != null) {
			args.push(data);
		}
		console.log(...args);
	}

	@bindThis
	public error(x: string | Error, data?: Record<string, unknown> | Error | unknown[] | null, important = false): void {
		if (x instanceof Error) {
			const record: Record<string, unknown> & { e?: Error } =
				data instanceof Error || Array.isArray(data) ? { data } : (data ?? {});
			record.e = x;
			this.log('error', x.toString(), record, important);
		} else {
			this.log('error', `${x}`, data, important);
		}
	}

	@bindThis
	public warn(message: string, data?: Record<string, unknown> | Error | unknown[] | null, important = false): void {
		this.log('warning', message, data, important);
	}

	@bindThis
	public succ(message: string, data?: Record<string, unknown> | Error | unknown[] | null, important = false): void {
		this.log('success', message, data, important);
	}

	@bindThis
	public debug(message: string, data?: Record<string, unknown> | Error | unknown[] | null, important = false): void {
		if (isDebugLoggingEnabled()) {
			this.log('debug', message, data, important);
		}
	}

	@bindThis
	public info(message: string, data?: Record<string, unknown> | Error | unknown[] | null, important = false): void {
		this.log('info', message, data, important);
	}
}
