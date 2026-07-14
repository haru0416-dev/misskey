/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import cluster from 'node:cluster';
import chalk from 'chalk';
import Logger from '@/logger.js';
import type { Config } from '@/config.js';
import { showMachineInfo } from '@/misc/show-machine-info.js';
import { envOption } from '@/env.js';
import { initExtraThreadPool, jobQueue, server } from './common.js';

const logger = new Logger('core', 'cyan');
const bootLogger = logger.createSubLogger('boot', 'magenta');

const themeColor = chalk.hex('#8185f2');

function greet(props: { version: string }) {
	if (!envOption.quiet) {
		const v = `v${props.version}`;
		console.log(themeColor('  E R E B I A  '));
		console.log(themeColor('  federated social platform'));
		console.log(' ' + chalk.gray(v) + '\n');

		console.log(' Erebia is an open-source decentralized social platform based on Misskey.');

		console.log('');
		console.log(`--- ${os.hostname()} ${chalk.gray(`(PID: ${process.pid})`)} ---`);
	}

	bootLogger.info('Welcome to Erebia!');
	bootLogger.info(`Erebia v${props.version}`, null, true);
}

/**
 * Init master process
 */
export async function masterMain(config: Config) {
	const disposers: Array<() => Promise<void>> = [];

	try {
		bootLogger.createSubLogger('config').succ('Loaded');
		greet({ version: config.runtime.version });
		showEnvironment();
		await showMachineInfo(bootLogger);
		showNodejsVersion();
		if (config.server.process.pidFile) fs.writeFileSync(config.server.process.pidFile, process.pid.toString());
	} catch (e) {
		bootLogger.error('Fatal error occurred during initialization: ' + e, null, true);
		process.exit(1);
	}

	bootLogger.succ('Erebia initialized');

	initExtraThreadPool(config);

	bootLogger.info(
		`mode: [disableClustering: ${envOption.disableClustering}, onlyServer: ${envOption.onlyServer}, onlyQueue: ${envOption.onlyQueue}]`,
	);

	if (!envOption.disableClustering) {
		// clusterモジュール有効時

		if (envOption.onlyServer) {
			// onlyServer かつ enableCluster な場合、メインプロセスはforkのみに制限する(listenしない)。
			// ワーカープロセス側でlistenすると、メインプロセスでポートへの着信を受け入れてワーカープロセスへの分配を行う動作をする。
			// そのため、メインプロセスでも直接listenするとポートの競合が発生して起動に失敗してしまう。
			// see: https://nodejs.org/api/cluster.html#cluster
		} else if (envOption.onlyQueue) {
			const runtime = await jobQueue(config);
			disposers.push(() => runtime.close());
		} else {
			const runtime = await server(config);
			disposers.push(() => runtime.dispose());
		}

		await spawnWorkers(config.server.process.workers);
	} else {
		// clusterモジュール無効時

		if (envOption.onlyServer) {
			const runtime = await server(config);
			disposers.push(() => runtime.dispose());
		} else if (envOption.onlyQueue) {
			const runtime = await jobQueue(config);
			disposers.push(() => runtime.close());
		} else {
			const { createRuntimeDependencies } = await import('../runtime-dependencies.js');
			const dependencies = await createRuntimeDependencies(config);
			let serverRuntime: Awaited<ReturnType<typeof server>> | undefined;
			try {
				const startedServerRuntime = serverRuntime = await server(config, dependencies);
				const queueRuntime = await jobQueue(config, dependencies);
					disposers.push(async () => {
						await Promise.allSettled([queueRuntime.close(), startedServerRuntime.dispose()]);
						await dependencies.dispose();
					});
			} catch (error) {
				try {
					await serverRuntime?.dispose();
				} catch (cleanupError) {
					bootLogger.error('Failed to stop server after queue startup failed', { e: cleanupError });
				}
				try {
					await dependencies.dispose();
				} catch (cleanupError) {
					bootLogger.error('Failed to dispose shared runtime dependencies after startup failed', { e: cleanupError });
				}
				throw error;
			}
		}
	}

	if (envOption.onlyQueue) {
		bootLogger.succ('Queue started', null, true);
	} else {
		const listen = config.server.listen;
		bootLogger.succ('unixSocket' in listen
			? `Now listening on socket ${listen.unixSocket.path} on ${config.instance.url}`
			: `Now listening on ${listen.tcp.address}:${listen.tcp.port} on ${config.instance.url}`, null, true);
	}

	return async () => {
		if (!envOption.disableClustering) {
			await Promise.all(Object.values(cluster.workers ?? {}).filter(worker => worker != null).map(worker => new Promise<void>(resolve => {
				worker!.once('exit', () => resolve());
				worker!.process.kill('SIGTERM');
			})));
		}
		await Promise.allSettled(disposers.map(dispose => dispose()));
	};
}

function showEnvironment(): void {
	const env = process.env.NODE_ENV;
	const logger = bootLogger.createSubLogger('env');
	logger.info(typeof env === 'undefined' ? 'NODE_ENV is not set' : `NODE_ENV: ${env}`);

	if (env !== 'production') {
		logger.warn('The environment is not in production mode.');
		logger.warn('DO NOT USE FOR PRODUCTION PURPOSE!', null, true);
	}
}

function showNodejsVersion(): void {
	const nodejsLogger = bootLogger.createSubLogger('nodejs');

	nodejsLogger.info(`Version ${process.version} detected.`);
}

async function spawnWorkers(limit = 1) {
	const workers = Math.min(limit, os.cpus().length);
	bootLogger.info(`Starting ${workers} worker${workers === 1 ? '' : 's'}...`);
	await Promise.all([...Array(workers)].map(spawnWorker));
	bootLogger.succ('All workers started');
}

function spawnWorker(): Promise<void> {
	return new Promise(res => {
		const worker = cluster.fork();
		worker.on('message', message => {
			if (message === 'listenFailed') {
				bootLogger.error('The server Listen failed due to the previous error.');
				process.exit(1);
			}
			if (message !== 'ready') return;
			res();
		});
	});
}
