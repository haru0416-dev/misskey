/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { init } from 'slacc';
import { loadConfig, type Config } from '@/config.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import type { HonoQueueShellDependencies } from '@/queue/worker.js';

let slaccInitialized = false;

export function initExtraThreadPool(config: Config) {
	if (slaccInitialized) return;

	const threadPoolSize = Math.max(config.threadPoolSize ?? 1, 1);

	init(threadPoolSize);

	slaccInitialized = true;
}

export async function server(config = loadConfig(), dependencies?: RuntimeDependencies) {
	const { launchHonoServer } = await import('./server.js');
	return await launchHonoServer(config, undefined, dependencies);
}

export type JobQueueRuntime = {
	close: () => Promise<void>;
};

/**
 * QueueProcessorService 相当。hono-queue-shell.ts の createHonoQueueWorkers が
 * 10個全てのBullMQ Workerを構築する。ChartManagementService相当の定期chart保存
 * (20分間隔) は createRuntimeDependencies 内で常に起動される (startHonoChartWriterSaveInterval)
 * ため、ここで個別に呼び出す必要はない。
 */
export async function jobQueue(config = loadConfig(), dependencies?: RuntimeDependencies): Promise<JobQueueRuntime> {
	const { createRuntimeDependencies } = await import('../runtime-dependencies.js');
	const { createHonoQueueWorkers } = await import('../queue/worker.js');
	const { syncSystemJobSchedulers } = await import('../queue/system-job-schedulers.js');
	const { createHonoEventPublishers } = await import('../server/rest/events.js');

	const deps = dependencies ?? await createRuntimeDependencies(config);
	const logger = deps.loggerService.getLogger('queue', 'orange');
	await syncSystemJobSchedulers(deps.systemQueue);
	// 原典の QueueProcessorService は DI 経由で GlobalEventService (全ストリーム配信) を持っていた。
	// publisher を渡さないと、AP受信 (inbox) で作成されたノート・通知等のストリーム配信が
	// optional チェーンで黙って無効化され、リモート発のイベントが一切WebSocketに流れなくなる
	const workerDeps = {
		config,
		db: deps.db,
		meta: deps.meta,
		meilisearch: deps.meilisearch,
		redis: deps.redis,
		redisForTimelines: deps.redisForTimelines,
		redisForReactions: deps.redisForReactions,
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
		...createHonoEventPublishers({
			config,
			publish: (host, message) => deps.redisForPub.publish(host, message),
		}),
		logger,
	} satisfies HonoQueueShellDependencies;
	const workers = createHonoQueueWorkers(workerDeps);

	// Bull.Worker#run() は内部のメインループが解決するまで (= close() されるまで) 待ち続けるため、
	// 元の QueueProcessorService#start() 同様ここでは await しない。
	void workers.start().catch(err => logger.error('Failed to start queue workers', { e: err }));

	return {
		close: async () => {
			await workers.stop();
			if (dependencies == null) await deps.dispose();
		},
	};
}
