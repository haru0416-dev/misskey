/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Xev from 'xev';
import * as Bull from 'bullmq';
import { QUEUE, baseQueueOptions } from '@/queue/const.js';
import type { DeliverQueue, InboxQueue } from '@/core/queues.js';
import type { Config } from '@/config.js';

const ev = new Xev();

const INTERVAL_MS = 10000;

export type HonoDaemonQueueStatsDependencies = {
	config: Config;
	deliverQueue: DeliverQueue;
	inboxQueue: InboxQueue;
};

/** QueueStatsService.start 相当。deliver/inbox キューの稼働状況を定期的にXev経由でブロードキャストする。 */
export function startHonoQueueStatsDaemon(deps: HonoDaemonQueueStatsDependencies): { dispose: () => void } {
	const log: unknown[] = [];

	const onRequestLog = (x: { id: string; length?: number }) => {
		ev.emit(`queueStatsLog:${x.id}`, log.slice(0, x.length ?? 50));
	};
	ev.on('requestQueueStatsLog', onRequestLog);

	let activeDeliverJobs = 0;
	let activeInboxJobs = 0;

	const deliverQueueEvents = new Bull.QueueEvents(QUEUE.DELIVER, baseQueueOptions(deps.config, QUEUE.DELIVER));
	const inboxQueueEvents = new Bull.QueueEvents(QUEUE.INBOX, baseQueueOptions(deps.config, QUEUE.INBOX));

	const onDeliverActive = () => { activeDeliverJobs++; };
	const onInboxActive = () => { activeInboxJobs++; };
	deliverQueueEvents.on('active', onDeliverActive);
	inboxQueueEvents.on('active', onInboxActive);

	const tick = async () => {
		const [deliverJobCounts, inboxJobCounts] = await Promise.all([
			deps.deliverQueue.getJobCounts(),
			deps.inboxQueue.getJobCounts(),
		]);

		const stats = {
			deliver: {
				activeSincePrevTick: activeDeliverJobs,
				active: deliverJobCounts.active,
				waiting: deliverJobCounts.waiting,
				delayed: deliverJobCounts.delayed,
			},
			inbox: {
				activeSincePrevTick: activeInboxJobs,
				active: inboxJobCounts.active,
				waiting: inboxJobCounts.waiting,
				delayed: inboxJobCounts.delayed,
			},
		};

		ev.emit('queueStats', stats);

		log.unshift(stats);
		if (log.length > 200) log.pop();

		activeDeliverJobs = 0;
		activeInboxJobs = 0;
	};

	void tick();
	const intervalId = setInterval(() => void tick(), INTERVAL_MS);

	return {
		dispose: () => {
			clearInterval(intervalId);
			ev.off('requestQueueStatsLog', onRequestLog);
			deliverQueueEvents.off('active', onDeliverActive);
			inboxQueueEvents.off('active', onInboxActive);
			void deliverQueueEvents.close();
			void inboxQueueEvents.close();
		},
	};
}
