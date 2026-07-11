/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { SystemQueue } from '@/core/queues.js';

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

export type SystemJobName = typeof systemJobSchedulers[number]['name'];

const schedulerKeys = new Set<string>(systemJobSchedulers.map(scheduler => scheduler.name));

export async function syncSystemJobSchedulers(systemQueue: SystemQueue): Promise<void> {
	await Promise.all(systemJobSchedulers.map(scheduler => systemQueue.upsertJobScheduler(scheduler.name, {
		pattern: scheduler.pattern,
		immediately: false,
	}, {
		name: scheduler.name,
		opts: {
			removeOnComplete: {
				age: 60 * 60 * 24 * 7,
			},
			removeOnFail: {
				age: 60 * 60 * 24 * 7,
			},
		},
	})));

	const registeredSchedulers = await systemQueue.getJobSchedulers();
	const obsoleteSchedulerKeys = registeredSchedulers
		.map(scheduler => scheduler.key)
		.filter(key => !schedulerKeys.has(key));

	await Promise.all(obsoleteSchedulerKeys.map(key => systemQueue.removeJobScheduler(key)));
}
