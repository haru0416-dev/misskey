/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import cluster from 'node:cluster';
import { styleText } from 'node:util';
import Logger, { colorize } from '@/logger.js';
import type { Config } from '@/config.js';
import { showMachineInfo } from '@/misc/show-machine-info.js';
import { resolveHostProcessCounts } from '@/misc/process-topology.js';
import { envOption } from '@/env.js';
import { assignmentByWorkerId, workerEnvFor } from './cluster-roles.js';
import type { WorkerAssignment, WorkerRole } from './cluster-roles.js';
import { initExtraThreadPool, jobQueue, server } from './common.js';
import type { JobQueueRuntime } from './common.js';
import { queueReadyRef } from './ready.js';

const queueWorkerReadiness = new Map<number, boolean>();
let requiredQueueWorkers = 0;
let localQueueReady = true;
let rejectWorkerStartup: ((error: Error) => void) | undefined;

function publishQueueReadiness() {
	let ready = localQueueReady && queueWorkerReadiness.size >= requiredQueueWorkers;
	for (const queueReady of queueWorkerReadiness.values()) {
		if (!queueReady) ready = false;
	}
	queueReadyRef.value = ready;
	for (const worker of Object.values(cluster.workers ?? {})) {
		if (worker != null && worker.isConnected() && assignmentByWorkerId.get(worker.id)?.role === 'server') {
			worker.send({ type: 'queueReadiness', ready: queueReadyRef.value }, (error) => {
				if (error != null) bootLogger.error('Failed to send queue readiness to HTTP worker', { e: error });
			});
		}
	}
}
const logger = new Logger('core', 'cyan');
const bootLogger = logger.createSubLogger('boot', 'magenta');

const themeColor = (text: string) => colorize('#8185f2', text);

function greet(props: { version: string }) {
	if (!envOption.quiet) {
		const v = `v${props.version}`;
		console.log(themeColor('  T O N E R I K O  '));
		console.log(themeColor('  federated social platform'));
		console.log(' ' + styleText('gray', v) + '\n');

		console.log(' Toneriko is an open-source decentralized social platform based on Misskey.');

		console.log('');
		console.log(`--- ${os.hostname()} ${styleText('gray', `(PID: ${process.pid})`)} ---`);
	}

	bootLogger.info('Welcome to Toneriko!');
	bootLogger.info(`Toneriko v${props.version}`, null, true);
}

export async function masterMain(config: Config) {
	const disposers: (() => Promise<void>)[] = [];

	try {
		bootLogger.createSubLogger('config').succ('Loaded');
		greet({ version: config.runtime.version });
		showEnvironment();
		await showMachineInfo(bootLogger);
		showNodejsVersion();
		if (config.server.process.pidFile) {
			fs.writeFileSync(config.server.process.pidFile, process.pid.toString());
		}
	} catch (e) {
		bootLogger.error('Fatal error occurred during initialization: ' + e, null, true);
		process.exit(1);
	}

	bootLogger.succ('Toneriko initialized');

	initExtraThreadPool(config);

	bootLogger.info(
		`mode: [disableClustering: ${envOption.disableClustering}, onlyServer: ${envOption.onlyServer}, onlyQueue: ${envOption.onlyQueue}]`,
	);

	const topology = resolveTopology(config);
	requiredQueueWorkers = envOption.disableClustering
		? 0
		: topology.workerAssignments.filter((assignment) => assignment.role === 'queue').length;
	localQueueReady = topology.queueWorkers === 0 || (!envOption.disableClustering && topology.masterRole !== 'queue');
	publishQueueReadiness();
	const watchQueue = (runtime: JobQueueRuntime) => {
		runtime.onReadyChange((ready) => {
			localQueueReady = ready;
			publishQueueReadiness();
		});
	};

	if (!envOption.disableClustering) {
		bootLogger.info(`topology: [http: ${topology.httpWorkers}, queue: ${topology.queueWorkers}]`);

		if (topology.masterRole === 'server') {
			const runtime = await server(config, undefined, { daemons: true });
			disposers.push(() => runtime.dispose());
		} else if (topology.masterRole === 'queue') {
			const runtime = await jobQueue(config);
			watchQueue(runtime);
			disposers.push(() => runtime.close());
		}
		// Bun の node:cluster は SO_REUSEPORT を使うため、masterRole が null ならワーカーだけが listen する。
		// 実測では httpWorkers=3 の各ワーカーが :3000 を LISTEN し、master は LISTEN しない。

		try {
			await spawnWorkers(topology.workerAssignments);
		} catch (error) {
			const stoppingWorkers = Object.values(cluster.workers ?? {}).flatMap((worker) => {
				if (worker == null || worker.isDead()) return [];
				const stopped = Promise.withResolvers<void>();
				worker.once('exit', () => stopped.resolve());
				worker.process.kill('SIGTERM');
				return [stopped.promise];
			});
			await Promise.all(stoppingWorkers);
			const cleanup = await Promise.allSettled(disposers.map((dispose) => dispose()));
			const errors = cleanup.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
			if (errors.length > 0) {
				throw new AggregateError([error, ...errors], 'Worker startup and runtime cleanup failed', { cause: error });
			}
			throw error;
		}
	} else {
		if (topology.queueWorkers === 0) {
			const runtime = await server(config, undefined, { daemons: true });
			disposers.push(() => runtime.dispose());
		} else if (topology.httpWorkers === 0) {
			const runtime = await jobQueue(config);
			watchQueue(runtime);
			disposers.push(() => runtime.close());
		} else {
			const { createRuntimeDependencies } = await import('../runtime-dependencies.js');
			const dependencies = await createRuntimeDependencies(config);
			let serverRuntime: Awaited<ReturnType<typeof server>> | undefined;
			try {
				const startedServerRuntime = (serverRuntime = await server(config, dependencies, { daemons: true }));
				const queueRuntime = await jobQueue(config, dependencies);
				watchQueue(queueRuntime);
				disposers.push(async () => {
					const results = await Promise.allSettled([queueRuntime.close(), startedServerRuntime.dispose()]);
					const errors = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
					try {
						await dependencies.dispose();
					} catch (error) {
						errors.push(error);
					}
					if (errors.length > 0) {
						throw new AggregateError(errors, 'Shared runtime shutdown failed', { cause: errors[0] });
					}
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
		const results = await Promise.allSettled(disposers.map((dispose) => dispose()));
		const errors = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
		if (errors.length > 0) {
			throw new AggregateError(errors, 'Master shutdown failed', { cause: errors[0] });
		}
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

	const masterRole: WorkerRole | null = httpWorkers === 1 ? 'server' : httpWorkers === 0 ? 'queue' : null;
	const forkedHttp = masterRole === 'server' ? httpWorkers - 1 : httpWorkers;
	const forkedQueue = masterRole === 'queue' ? queueWorkers - 1 : queueWorkers;

	const workerAssignments: WorkerAssignment[] = [
		...Array.from({ length: forkedHttp }, () => ({ role: 'server' as const, ownsDaemons: false })),
		...Array.from({ length: Math.max(forkedQueue, 0) }, () => ({ role: 'queue' as const, ownsDaemons: false })),
	];

	// デーモンは HTTP の起動処理 (boot/server.ts) の中で始まるので、HTTP ワーカーを優先して割り当てる。
	if (masterRole !== 'server') {
		const owner = workerAssignments.find((assignment) => assignment.role === 'server') ?? workerAssignments[0];
		if (owner != null) {
			owner.ownsDaemons = true;
		}
	}

	return { httpWorkers, queueWorkers, masterRole, workerAssignments };
}

async function spawnWorkers(assignments: WorkerAssignment[]) {
	if (assignments.length === 0) {
		bootLogger.info('No worker process to start');
		return;
	}

	bootLogger.info(`Starting ${assignments.length} worker${assignments.length === 1 ? '' : 's'}...`);
	const failed = Promise.withResolvers<never>();
	rejectWorkerStartup = failed.reject;
	try {
		await Promise.race([Promise.all(assignments.map(spawnWorker)), failed.promise]);
	} finally {
		rejectWorkerStartup = undefined;
	}
	bootLogger.succ('All workers started');
}

export function spawnWorker(assignment: WorkerAssignment): Promise<void> {
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	const rejectStartupGroup = rejectWorkerStartup;
	const worker = cluster.fork(workerEnvFor(assignment));
	assignmentByWorkerId.set(worker.id, assignment);
	if (assignment.role === 'queue') {
		queueWorkerReadiness.set(worker.id, false);
		publishQueueReadiness();
	}
	const startupExit = () => reject(new Error(`Worker ${worker.id} exited before becoming ready`));
	worker.once('exit', startupExit);
	worker.once('exit', () => {
		// 個別 ready 通知後も、兄弟全員の起動が終わるまでは死亡を起動失敗にする。
		if (rejectStartupGroup != null && rejectWorkerStartup === rejectStartupGroup) {
			rejectStartupGroup(new Error(`Worker ${worker.id} exited during startup`));
		}
		if (assignment.role === 'queue') {
			queueWorkerReadiness.delete(worker.id);
			publishQueueReadiness();
		}
	});
	worker.on('message', (message) => {
		if (
			assignment.role === 'queue' &&
			message != null &&
			typeof message === 'object' &&
			'type' in message &&
			message.type === 'queueReadiness' &&
			'ready' in message &&
			typeof message.ready === 'boolean'
		) {
			queueWorkerReadiness.set(worker.id, message.ready);
			publishQueueReadiness();
		}
		if (message === 'listenFailed') {
			bootLogger.error('The server Listen failed due to the previous error.');
			reject(new Error(`Worker ${worker.id} failed to listen`));
		}
		if (message !== 'ready') return;
		worker.off('exit', startupExit);
		publishQueueReadiness();
		resolve();
	});
	return promise;
}
