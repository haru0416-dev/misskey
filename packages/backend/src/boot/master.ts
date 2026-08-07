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
import { resolveHostProcessCounts } from '@/misc/process-topology.js';
import { envOption } from '@/env.js';
import { assignmentByWorkerId, workerEnvFor, type WorkerAssignment, type WorkerRole } from './cluster-roles.js';
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

	const topology = resolveTopology(config);

	if (!envOption.disableClustering) {
		// clusterモジュール有効時
		bootLogger.info(`topology: [http: ${topology.httpWorkers}, queue: ${topology.queueWorkers}]`);

		if (topology.masterRole === 'server') {
			// HTTPが1プロセスだけで済むならメインプロセス自身がlistenする (プロセスを1つ節約できる)。
			const runtime = await server(config, undefined, { daemons: true });
			disposers.push(() => runtime.dispose());
		} else if (topology.masterRole === 'queue') {
			const runtime = await jobQueue(config);
			disposers.push(() => runtime.close());
		}
		// masterRole が null の場合、メインプロセスはforkのみに制限する(listenしない)。
		// ワーカープロセス側でlistenすると、メインプロセスでポートへの着信を受け入れてワーカープロセスへの分配を行う動作をする。
		// そのため、メインプロセスでも直接listenするとポートの競合が発生して起動に失敗してしまう。
		// see: https://nodejs.org/api/cluster.html#cluster
		//
		// なお bun の node:cluster は上記のNodeの分配モデルではなく SO_REUSEPORT で実装されている
		// (実測: httpWorkers=3 でワーカー3プロセスがそれぞれ :3000 をLISTENし、masterはLISTENしない)。
		// つまり `Bun.serve({ reusePort: true })` へ自前で置き換えても得られるものは無い。

		await spawnWorkers(topology.workerAssignments);
	} else {
		// clusterモジュール無効時

		if (topology.queueWorkers === 0) {
			const runtime = await server(config, undefined, { daemons: true });
			disposers.push(() => runtime.dispose());
		} else if (topology.httpWorkers === 0) {
			const runtime = await jobQueue(config);
			disposers.push(() => runtime.close());
		} else {
			const { createRuntimeDependencies } = await import('../runtime-dependencies.js');
			const dependencies = await createRuntimeDependencies(config);
			let serverRuntime: Awaited<ReturnType<typeof server>> | undefined;
			try {
				const startedServerRuntime = (serverRuntime = await server(config, dependencies, { daemons: true }));
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

	if (topology.httpWorkers === 0) {
		bootLogger.succ('Queue started', null, true);
	} else {
		const listen = config.server.listen;
		bootLogger.succ(
			'unixSocket' in listen
				? `Now listening on socket ${listen.unixSocket.path} on ${config.instance.url}`
				: `Now listening on ${listen.tcp.address}:${listen.tcp.port} on ${config.instance.url}`,
			null,
			true,
		);
	}

	return async () => {
		if (!envOption.disableClustering) {
			await Promise.all(
				Object.values(cluster.workers ?? {})
					.filter((worker) => worker != null)
					.map(
						(worker) =>
							new Promise<void>((resolve) => {
								worker!.once('exit', () => resolve());
								worker!.process.kill('SIGTERM');
							}),
					),
			);
		}
		await Promise.allSettled(disposers.map((dispose) => dispose()));
	};
}

function showEnvironment(): void {
	const env = process.env['NODE_ENV'];
	const logger = bootLogger.createSubLogger('env');
	logger.info(env === undefined ? 'NODE_ENV is not set' : `NODE_ENV: ${env}`);

	if (env !== 'production') {
		logger.warn('The environment is not in production mode.');
		logger.warn('DO NOT USE FOR PRODUCTION PURPOSE!', null, true);
	}
}

function showNodejsVersion(): void {
	const nodejsLogger = bootLogger.createSubLogger('nodejs');

	nodejsLogger.info(`Version ${process.version} detected.`);
}

type Topology = {
	httpWorkers: number;
	queueWorkers: number;
	/** メインプロセス自身が担う役割。null なら fork のみ行い、自分では何も捌かない。 */
	masterRole: WorkerRole | null;
	workerAssignments: WorkerAssignment[];
};

/**
 * プロセス数 (resolveHostProcessCounts) から実際の役割の割り当てを決める。
 *
 * - HTTPが1プロセスで済むならメインプロセスがそれを兼ねる (プロセスを1つ節約)
 * - HTTPが2プロセス以上なら、メインプロセスはlistenせず全HTTPをワーカーへ出す
 * - queue-stats / server-stats デーモンはホスト全体で1プロセスだけが持つ
 */
function resolveTopology(config: Config): Topology {
	const { http: httpWorkers, queue: queueWorkers } = resolveHostProcessCounts(config);

	// メインプロセスが自分で捌けるのは1役だけ。HTTPを優先し、HTTPが無いならキューを担う。
	const masterRole: WorkerRole | null = httpWorkers === 1 ? 'server' : httpWorkers === 0 ? 'queue' : null;
	const forkedHttp = masterRole === 'server' ? httpWorkers - 1 : httpWorkers;
	const forkedQueue = masterRole === 'queue' ? queueWorkers - 1 : queueWorkers;

	const workerAssignments: WorkerAssignment[] = [
		...Array.from({ length: forkedHttp }, () => ({ role: 'server' as const, ownsDaemons: false })),
		...Array.from({ length: Math.max(forkedQueue, 0) }, () => ({ role: 'queue' as const, ownsDaemons: false })),
	];

	// デーモンはHTTPを捌くプロセスに持たせる (ストリーム配信先と同じプロセスに置くのが素直)。
	// メインプロセスがHTTPを持つならそちら、持たないなら最初のHTTPワーカーへ。
	if (masterRole !== 'server') {
		const owner = workerAssignments.find((assignment) => assignment.role === 'server') ?? workerAssignments[0];
		if (owner != null) owner.ownsDaemons = true;
	}

	return { httpWorkers, queueWorkers, masterRole, workerAssignments };
}

async function spawnWorkers(assignments: WorkerAssignment[]) {
	if (assignments.length === 0) {
		bootLogger.info('No worker process to start');
		return;
	}

	bootLogger.info(`Starting ${assignments.length} worker${assignments.length === 1 ? '' : 's'}...`);
	await Promise.all(assignments.map(spawnWorker));
	bootLogger.succ('All workers started');
}

export function spawnWorker(assignment: WorkerAssignment): Promise<void> {
	return new Promise((res) => {
		const worker = cluster.fork(workerEnvFor(assignment));
		assignmentByWorkerId.set(worker.id, assignment);
		worker.on('message', (message) => {
			if (message === 'listenFailed') {
				bootLogger.error('The server Listen failed due to the previous error.');
				process.exit(1);
			}
			if (message !== 'ready') return;
			res();
		});
	});
}
