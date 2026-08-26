/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { SystemQueue } from '@/core/queue/queues.js';
import type { Config } from '@/config.js';
import { queueRetentionOptions } from '@/queue/const.js';

export const systemJobSchedulers = [
	{ name: 'tickCharts', pattern: '55 * * * *' },
	{ name: 'resyncCharts', pattern: '0 0 * * *' },
	{ name: 'cleanCharts', pattern: '0 0 * * *' },
	{ name: 'aggregateRetention', pattern: '0 0 * * *' },
	{ name: 'clean', pattern: '0 0 * * *' },
	{ name: 'checkExpiredMutings', pattern: '*/5 * * * *' },
	{ name: 'bakeBufferedReactions', pattern: '0 0 * * *' },
	{ name: 'checkModeratorsActivity', pattern: '30 * * * *' },
	{ name: 'cleanRemoteNotes', pattern: '0 4 * * *' },
] as const;

export type SystemJobName = (typeof systemJobSchedulers)[number]['name'];

const schedulerKeys = new Set<string>(systemJobSchedulers.map((scheduler) => scheduler.name));

export async function syncSystemJobSchedulers(systemQueue: SystemQueue, config: Pick<Config, 'queues'>): Promise<void> {
	await Promise.all(
		systemJobSchedulers.map((scheduler) =>
			systemQueue.upsertJobScheduler(
				scheduler.name,
				{
					pattern: scheduler.pattern,
					immediately: false,
				},
				{
					name: scheduler.name,
					opts: queueRetentionOptions(config),
				},
			),
		),
	);

	const registeredSchedulers = await systemQueue.getJobSchedulers();
	const obsoleteSchedulerKeys = registeredSchedulers
		.map((scheduler) => scheduler.key)
		.filter((key) => !schedulerKeys.has(key));

	await Promise.all(obsoleteSchedulerKeys.map((key) => systemQueue.removeJobScheduler(key)));
}
