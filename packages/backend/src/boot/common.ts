/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { init } from 'slacc';
import { loadConfig } from '@/config.js';
import type { Config } from '@/config.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import type { QueueShellDependencies, QueueWorkers } from '@/queue/worker.js';

let slaccInitialized = false;

export function initExtraThreadPool(config: Config) {
	if (slaccInitialized) {
		return;
	}

	const threadPoolSize = Math.max(config.server.process.computationThreadsPerWorker ?? 1, 1);

	init(threadPoolSize);

	slaccInitialized = true;
}

export async function server(
	config = loadConfig(),
	dependencies?: RuntimeDependencies,
	options?: { daemons?: boolean },
) {
	const { launchServer } = await import('./server.js');
	return await launchServer(config, undefined, dependencies, options);
}

export type JobQueueRuntime = {
	close: () => Promise<void>;
	isReady: () => boolean;
	onReadyChange: (listener: (ready: boolean) => void) => () => void;
};

/**
 * 定期chart保存は createRuntimeDependencies 内で常に起動されるため、
 * ここで個別に起動してはならない。
 */
export async function jobQueue(config = loadConfig(), dependencies?: RuntimeDependencies): Promise<JobQueueRuntime> {
	const { createRuntimeDependencies } = await import('../runtime-dependencies.js');
	const { createQueueWorkers } = await import('../queue/worker.js');
	const { syncSystemJobSchedulers } = await import('../queue/system-job-schedulers.js');
	const { createEventPublishers } = await import('../core/events.js');

	const deps = dependencies ?? (await createRuntimeDependencies(config));
	const logger = deps.loggerService.getLogger('queue', 'orange');
	let workers: QueueWorkers | undefined;
	let closePromise: Promise<void> | undefined;
	let ready = false;
	const readinessListeners = new Set<(ready: boolean) => void>();
	const close = (): Promise<void> => {
		if (closePromise != null) return closePromise;
		closePromise = (async () => {
			const errors: unknown[] = [];
			try {
				await workers?.stop();
			} catch (error) {
				errors.push(error);
			}
			if (dependencies == null) {
				try {
					await deps.dispose();
				} catch (error) {
					errors.push(error);
				}
			}
			if (errors.length > 0) {
				throw new AggregateError(errors, 'Queue runtime shutdown failed', { cause: errors[0] });
			}
		})();
		return closePromise;
	};
	try {
		await syncSystemJobSchedulers(deps.systemQueue, deps.config);
		// publisher を渡さないと、inbox で作成したノート・通知のストリーム配信が optional チェーンで
		// 黙って無効になり、リモート発のイベントが WebSocket に流れない。
		const workerDeps = {
			config,
			db: deps.db,
			meta: deps.meta,
			redis: deps.redis,
			redisForTimelines: deps.redisForTimelines,
			chartWriters: deps.chartWriters,
			downloadService: deps.downloadService,
			emailService: deps.emailService,
			fileInfoService: deps.fileInfoService,
			httpRequestService: deps.httpRequestService,
			imageProcessingService: deps.imageProcessingService,
			internalStorageService: deps.internalStorageService,
			s3Service: deps.s3Service,
			videoProcessingService: deps.videoProcessingService,
			dbQueue: deps.dbQueue,
			deliverQueue: deps.deliverQueue,
			endedPollNotificationQueue: deps.endedPollNotificationQueue,
			objectStorageQueue: deps.objectStorageQueue,
			relationshipQueue: deps.relationshipQueue,
			systemWebhookDeliverQueue: deps.systemWebhookDeliverQueue,
			userWebhookDeliverQueue: deps.userWebhookDeliverQueue,
			...createEventPublishers({
				config,
				publish: (host, message) => deps.redisForPub.publish(host, message),
			}),
			logger,
		} satisfies QueueShellDependencies;
		workers = createQueueWorkers(workerDeps, (value) => {
			ready = value;
			for (const listener of readinessListeners) listener(value);
		});
		await workers.start();
	} catch (error) {
		try {
			await close();
		} catch (cleanupError) {
			logger.error('Failed to clean up queue runtime after startup failed', { e: cleanupError });
			throw new AggregateError([error, cleanupError], 'Queue startup and cleanup failed', { cause: cleanupError });
		}
		throw error;
	}
	return {
		close,
		isReady: () => ready,
		onReadyChange: (listener) => {
			readinessListeners.add(listener);
			listener(ready);
			return () => readinessListeners.delete(listener);
		},
	};
}
