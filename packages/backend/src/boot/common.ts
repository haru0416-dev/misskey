/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { init } from 'slacc';
import { loadConfig, type Config } from '@/config.js';

let slaccInitialized = false;

export function initExtraThreadPool(config: Config) {
	if (slaccInitialized) return;

	const threadPoolSize = Math.max(config.threadPoolSize ?? 1, 1);

	init(threadPoolSize);

	slaccInitialized = true;
}

export async function server() {
	const { launchHonoServer } = await import('./server.js');
	return await launchHonoServer(loadConfig());
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
export async function jobQueue(): Promise<JobQueueRuntime> {
	const { createRuntimeDependencies } = await import('../runtime-dependencies.js');
	const { createHonoQueueWorkers } = await import('../queue/worker.js');

	const config = loadConfig();
	const deps = await createRuntimeDependencies(config);
	const logger = deps.loggerService.getLogger('queue', 'orange');
	const workers = createHonoQueueWorkers({
		...deps,
		logger,
	});

	// Bull.Worker#run() は内部のメインループが解決するまで (= close() されるまで) 待ち続けるため、
	// 元の QueueProcessorService#start() 同様ここでは await しない。
	void workers.start().catch(err => logger.error('Failed to start queue workers', { e: err }));

	return {
		close: async () => {
			await workers.stop();
			await deps.dispose();
		},
	};
}
