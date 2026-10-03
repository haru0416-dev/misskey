/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import cluster from 'node:cluster';
import { styleText } from 'node:util';
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

type LogData = Record<string, unknown> | Error | unknown[] | null;

type Emit = (
	level: Level,
	message: string,
	data: LogData | undefined,
	important: boolean,
	subContexts: Context[],
) => void;

export type Logger = {
	createSubLogger(context: string, color?: LogColor): Logger;
	error(x: string | Error, data?: LogData, important?: boolean): void;
	warn(message: string, data?: LogData, important?: boolean): void;
	succ(message: string, data?: LogData, important?: boolean): void;
	debug(message: string, data?: LogData, important?: boolean): void;
	info(message: string, data?: LogData, important?: boolean): void;
};

export function createLogger(name: string, color?: LogColor): Logger {
	return createLoggerNode({ name, ...(color === undefined ? {} : { color }) }, null);
}

/** 親があれば出力を親へ渡し、親の文脈の後ろにこのロガーの文脈を足す。出力するのは根のロガーだけ。 */
function createLoggerNode(context: Context, parentEmit: Emit | null): Logger {
	const emit: Emit = (level, message, data, important, subContexts) => {
		// NODE_ENV=test は暗黙に quiet になるが、MK_VERBOSE を明示した時だけはそれより優先させる
		// (e2e で発生したサーバー側例外を追うにはログを出せる手段が要る)。
		if ((envOption.quiet && !envOption.verbose) || !shouldLog(level)) {
			return;
		}

		if (parentEmit) {
			parentEmit(level, message, data, important, [context].concat(subContexts));
			return;
		}

		const time = formatTime(new Date());
		const worker = cluster.isPrimary ? '*' : cluster.worker!.id;
		const contextNames = [context].concat(subContexts).map((context) => context.name);
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
		const contexts = [context]
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
	};

	return {
		createSubLogger(subContext, subColor) {
			return createLoggerNode({ name: subContext, ...(subColor === undefined ? {} : { color: subColor }) }, emit);
		},

		error(x, data, important = false) {
			if (x instanceof Error) {
				const record: Record<string, unknown> & { e?: Error } =
					data instanceof Error || Array.isArray(data) ? { data } : (data ?? {});
				record.e = x;
				emit('error', x.toString(), record, important, []);
			} else {
				emit('error', `${x}`, data, important, []);
			}
		},

		warn(message, data, important = false) {
			emit('warning', message, data, important, []);
		},

		succ(message, data, important = false) {
			emit('success', message, data, important, []);
		},

		debug(message, data, important = false) {
			if (isDebugLoggingEnabled()) {
				emit('debug', message, data, important, []);
			}
		},

		info(message, data, important = false) {
			emit('info', message, data, important, []);
		},
	};
}
