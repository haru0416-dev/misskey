/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import cluster from 'node:cluster';
import { styleText } from 'node:util';
import { bindThis } from '@/decorators.js';
import { formatTime } from '@/misc/format-date-time.js';
import { envOption } from './env.js';
import type { Config } from './config.js';

/** 文脈名に付ける色。CSS のカラー名で、Bun.color が解釈する。 */
export type LogColor = 'cyan' | 'gray' | 'magenta' | 'orange' | 'white' | 'yellow';

type Context = {
	name: string;
	color?: LogColor;
};

/**
 * 任意の色 (CSS のカラー名・hex) の前景色。Bun.color は styleText と同じく、端末かどうかと
 * NO_COLOR / FORCE_COLOR で色を付けるか決める (付けないときは空文字を返す)。
 */
export function colorize(color: string, text: string): string {
	const code = Bun!.color(color, 'ansi');
	return code ? `${code}${text}\u001b[39m` : text;
}

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
	if (envOption.verbose) {
		return true;
	}
	const severity = { debug: 10, info: 20, success: 20, warning: 30, error: 40 } as const;
	return severity[level] >= severity[loggingConfig.level];
}

/**
 * 高頻度の呼び出し元で debug メッセージの構築を省くための事前判定。
 * true の場合も、最終的な出力は log() のログレベル判定に従う。
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

	constructor(context: string, color?: LogColor) {
		this.context = {
			name: context,
			...(color === undefined ? {} : { color }),
		};
	}

	@bindThis
	public createSubLogger(context: string, color?: LogColor): Logger {
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
		if ((envOption.quiet && !envOption.verbose) || !shouldLog(level)) {
			return;
		}

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
					? styleText(['bgRed', 'white'], 'ERR ')
					: styleText('red', 'ERR ')
				: level === 'warning'
					? styleText('yellow', 'WARN')
					: level === 'success'
						? important
							? styleText(['bgGreen', 'white'], 'DONE')
							: styleText('green', 'DONE')
						: level === 'debug'
							? styleText('gray', 'VERB')
							: level === 'info'
								? styleText('blue', 'INFO')
								: null;
		const contexts = [this.context]
			.concat(subContexts)
			.map((d) => (d.color ? colorize(d.color, d.name) : styleText('white', d.name)));
		const m =
			level === 'error'
				? styleText('red', message)
				: level === 'warning'
					? styleText('yellow', message)
					: level === 'success'
						? styleText('green', message)
						: level === 'debug'
							? styleText('gray', message)
							: level === 'info'
								? message
								: null;

		let log = `${l} ${worker}\t[${contexts.join(' ')}]\t${m}`;
		if (envOption.withLogTime || loggingConfig.includeTimestamp) {
			log = styleText('gray', time) + ' ' + log;
		}

		const args: unknown[] = [important ? styleText('bold', log) : log];
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
