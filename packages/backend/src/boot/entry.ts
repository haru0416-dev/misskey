/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Erebia Entry Point!
 */

import cluster from 'node:cluster';
import { EventEmitter } from 'node:events';
import { writeHeapSnapshot } from 'node:v8';
import chalk from 'chalk';
import { globalEventBus } from '@/misc/global-event-bus.js';
import Logger, { configureLogger } from '@/logger.js';
import { loadConfig } from '@/config.js';
import { envOption } from '../env.js';
import { initializeTelemetry, recordException, shutdownTelemetry } from '../telemetry.js';
import { assignmentByWorkerId } from './cluster-roles.js';
import { readyRef } from './ready.js';

const config = loadConfig();
configureLogger(config);
await initializeTelemetry(config);

process.title = `Erebia (${cluster.isPrimary ? 'master' : 'worker'})`;

Error.stackTraceLimit = Infinity;
EventEmitter.defaultMaxListeners = 128;

const logger = new Logger('core', 'cyan');
const clusterLogger = logger.createSubLogger('cluster', 'orange');
let shuttingDown = false;
let disposeRuntime: (() => Promise<void>) | undefined;

cluster.on('fork', (worker) => {
	clusterLogger.debug(`Process forked: [${worker.id}]`);
});

cluster.on('online', (worker) => {
	clusterLogger.debug(`Process is now online: [${worker.id}]`);
});

cluster.on('exit', (worker) => {
	clusterLogger.error(chalk.red(`[${worker.id}] died :(`));
	const assignment = assignmentByWorkerId.get(worker.id);
	assignmentByWorkerId.delete(worker.id);
	if (shuttingDown) return;

	// 素の cluster.fork() で復帰させると役割 (HTTP / キュー / デーモン担当) が失われるので、
	// master が割り当てたものと同じ役割で fork し直す。
	if (assignment == null) {
		clusterLogger.error(`No role recorded for worker [${worker.id}]; not respawning`);
		return;
	}
	void import('./master.js').then(({ spawnWorker }) => spawnWorker(assignment));
});

if (!envOption.quiet) {
	process.on('unhandledRejection', console.dir);
}

process.on('unhandledRejection', recordException);

process.on('uncaughtException', (err) => {
	recordException(err);
	try {
		logger.error(err);
		console.trace(err);
	} catch {
		// logger 自体が壊れていても最後の手段として素の stderr には必ず残す
		console.error(err);
	}
	void shutdownTelemetry().finally(() => process.exit(1));
});

process.on('exit', (code) => {
	logger.info(`The process is going to exit with code ${code}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.once(signal, () => {
		shuttingDown = true;
		process.once(signal, () => process.exit(1));
		void (async () => {
			const shutdown = async () => {
				await disposeRuntime?.();
				await shutdownTelemetry();
			};
			let timeout: ReturnType<typeof setTimeout> | undefined;
			await Promise.race([
				shutdown(),
				new Promise<never>((_, reject) => {
					timeout = setTimeout(
						() => reject(new Error('Graceful shutdown timed out.')),
						config.server.http.gracefulShutdownTimeoutMs,
					);
				}),
			]).finally(() => clearTimeout(timeout));
			process.exit(0);
		})().catch((error) => {
			logger.error(error);
			process.exit(1);
		});
	});
}

if (!envOption.disableClustering) {
	if (cluster.isPrimary) {
		logger.info(`Start main process... pid: ${process.pid}`);
		const { masterMain } = await import('./master.js');
		disposeRuntime = await masterMain(config);
		globalEventBus.mount();
	} else if (cluster.isWorker) {
		logger.info(`Start worker process... pid: ${process.pid}`);
		const { workerMain } = await import('./worker.js');
		disposeRuntime = await workerMain(config);
	} else {
		throw new Error('Unknown process type');
	}
} else {
	// 非clusterの場合はMasterのみが起動するため、Workerの処理は行わない(cluster.isWorker === trueの状態でこのブロックに来ることはない)
	logger.info(`Start main process... pid: ${process.pid}`);
	const { masterMain } = await import('./master.js');
	disposeRuntime = await masterMain(config);
	globalEventBus.mount();
}

process.on('message', (msg) => {
	if (msg === 'gc') {
		if (global.gc != null) {
			logger.info('Manual GC triggered');
			for (let i = 0; i < 3; i++) {
				global.gc();
			}
			if (process.send != null) process.send('gc ok');
		} else {
			logger.warn(
				'Manual GC requested but gc is not available. Start the process with --expose-gc to enable this feature.',
			);
			if (process.send != null) process.send('gc unavailable');
		}
	} else if (msg === 'memory usage') {
		if (process.send != null) {
			process.send({
				type: 'memory usage',
				value: process.memoryUsage(),
			});
		}
	} else if (
		msg != null &&
		typeof msg === 'object' &&
		'type' in msg &&
		msg.type === 'heap snapshot' &&
		'path' in msg &&
		typeof msg.path === 'string'
	) {
		if (process.send != null) {
			try {
				const path = writeHeapSnapshot(msg.path);
				process.send({
					type: 'heap snapshot',
					path,
				});
			} catch (err) {
				process.send({
					type: 'heap snapshot error',
					message: err instanceof Error ? err.message : String(err),
				});
			}
		}
	}
});

readyRef.value = true;

// ユニットテスト時にMisskeyが子プロセスで起動された時のため
// それ以外のときは process.send は使えないので弾く
if (process.send) {
	process.send('ok');
}
