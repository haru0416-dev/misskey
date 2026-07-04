/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import type { Config } from '@/config.js';
import type Logger from '@/logger.js';
import { QUEUE, baseWorkerOptions } from '@/queue/const.js';
import { handleHonoQueueSystemWebhookDeliver, handleHonoQueueUserWebhookDeliver, type HonoQueueWebhookDeliverDependencies } from './hono-queue-webhook-deliver.js';
import {
	handleHonoQueueRelationshipBlock,
	handleHonoQueueRelationshipUnblock,
	handleHonoQueueRelationshipUnfollow,
	type HonoQueueRelationshipDependencies,
} from './hono-queue-relationship.js';
import { handleHonoQueuePostScheduledNote, type HonoQueuePostScheduledNoteDependencies } from './hono-queue-post-scheduled-note.js';
import {
	handleHonoQueueAggregateRetention,
	handleHonoQueueBakeBufferedReactions,
	handleHonoQueueCheckExpiredMutings,
	handleHonoQueueClean,
	handleHonoQueueCleanCharts,
	handleHonoQueueResyncCharts,
	handleHonoQueueTickCharts,
	type HonoQueueSystemDependencies,
} from './hono-queue-system.js';
import { handleHonoQueueCleanRemoteNotes, type HonoQueueCleanRemoteNotesDependencies } from './hono-queue-clean-remote-notes.js';
import { handleHonoQueueDeliver, type HonoQueueDeliverDependencies } from './hono-queue-deliver.js';

export type HonoQueueShellDependencies = HonoQueueWebhookDeliverDependencies & HonoQueueRelationshipDependencies & HonoQueuePostScheduledNoteDependencies & HonoQueueSystemDependencies & HonoQueueCleanRemoteNotesDependencies & HonoQueueDeliverDependencies & {
	config: Config;
	logger: Logger;
};

export type HonoQueueWorkers = {
	userWebhookDeliverQueueWorker: Bull.Worker;
	systemWebhookDeliverQueueWorker: Bull.Worker;
	relationshipQueueWorker: Bull.Worker;
	postScheduledNoteQueueWorker: Bull.Worker;
	systemQueueWorker: Bull.Worker;
	deliverQueueWorker: Bull.Worker;
	start: () => Promise<void>;
	stop: () => Promise<void>;
};

// ref. https://github.com/misskey-dev/misskey/pull/7635#issue-971097019
function httpRelatedBackoff(attemptsMade: number): number {
	const baseDelay = 60 * 1000;
	const maxBackoff = 8 * 60 * 60 * 1000;
	let backoff = (Math.pow(2, attemptsMade) - 1) * baseDelay;
	backoff = Math.min(backoff, maxBackoff);
	backoff += Math.round(backoff * Math.random() * 0.2);
	return backoff;
}

function getJobInfo(job: Bull.Job | undefined, increment = false): string {
	if (job == null) return '-';

	const age = Date.now() - job.timestamp;
	const formated = age > 60000 ? `${Math.floor(age / 1000 / 60)}m`
		: age > 10000 ? `${Math.floor(age / 1000)}s`
			: `${age}ms`;

	const currentAttempts = job.attemptsMade + (increment ? 1 : 0);
	const maxAttempts = job.opts.attempts ?? 0;

	return `id=${job.id} attempts=${currentAttempts}/${maxAttempts} age=${formated}`;
}

function renderError(e?: Error): unknown {
	if (!e) return '?';
	if (e instanceof Bull.UnrecoverableError || e.name === 'AbortError') {
		return `${e.name}: ${e.message}`;
	}
	return { stack: e.stack, message: e.message, name: e.name };
}

/**
 * QueueProcessorService 相当。NestJS の Nest DI コンテナを介さず、BullMQ の `Bull.Worker` を
 * 直接 `deps` (プレーンオブジェクト) 付きのハンドラ関数にバインドする。
 *
 * 元の QueueProcessorService は10個の Worker (system/db/deliver/inbox/userWebhookDeliver/
 * systemWebhookDeliver/relationship/objectStorage/endedPollNotification/postScheduledNote)
 * を組み立てるが、現時点でこの関数が組み立てるのは6個 (userWebhookDeliver/systemWebhookDeliver/
 * relationship/postScheduledNote/system/deliver)。**残り4個 (db/inbox/objectStorage/
 * endedPollNotification) は未移植であり、本番のジョブキュー起動経路 (`boot/common.ts` の
 * `jobQueue()`) からはまだ呼ばれていない。** 全プロセッサの移植が完了するまでは、この関数を
 * 実際のキュー起動に配線しないこと — 同じキューに対して NestJS側のWorkerと二重に接続すると
 * 同一ジョブが二重処理される。
 */
export function createHonoQueueWorkers(deps: HonoQueueShellDependencies): HonoQueueWorkers {
	//#region user-webhook deliver
	const userWebhookDeliverQueueWorker = new Bull.Worker(QUEUE.USER_WEBHOOK_DELIVER, (job) => {
		return handleHonoQueueUserWebhookDeliver(deps, job);
	}, {
		...baseWorkerOptions(deps.config, QUEUE.USER_WEBHOOK_DELIVER),
		autorun: false,
		concurrency: 64,
		limiter: {
			max: 64,
			duration: 1000,
		},
		settings: {
			backoffStrategy: httpRelatedBackoff,
		},
	});

	{
		const logger = deps.logger.createSubLogger('user-webhook');
		userWebhookDeliverQueueWorker
			.on('active', (job) => logger.debug(`active ${getJobInfo(job, true)} to=${job.data.to}`))
			.on('completed', (job, result) => logger.debug(`completed(${result}) ${getJobInfo(job, true)} to=${job.data.to}`))
			.on('failed', (job, err) => logger.error(`failed(${err.name}: ${err.message}) ${getJobInfo(job)} to=${job ? job.data.to : '-'}`))
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}
	//#endregion

	//#region system-webhook deliver
	const systemWebhookDeliverQueueWorker = new Bull.Worker(QUEUE.SYSTEM_WEBHOOK_DELIVER, (job) => {
		return handleHonoQueueSystemWebhookDeliver(deps, job);
	}, {
		...baseWorkerOptions(deps.config, QUEUE.SYSTEM_WEBHOOK_DELIVER),
		autorun: false,
		concurrency: 16,
		limiter: {
			max: 16,
			duration: 1000,
		},
		settings: {
			backoffStrategy: httpRelatedBackoff,
		},
	});

	{
		const logger = deps.logger.createSubLogger('system-webhook');
		systemWebhookDeliverQueueWorker
			.on('active', (job) => logger.debug(`active ${getJobInfo(job, true)} to=${job.data.to}`))
			.on('completed', (job, result) => logger.debug(`completed(${result}) ${getJobInfo(job, true)} to=${job.data.to}`))
			.on('failed', (job, err) => logger.error(`failed(${err.name}: ${err.message}) ${getJobInfo(job)} to=${job ? job.data.to : '-'}`))
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}
	//#endregion

	//#region relationship
	// NOTE: 'follow' はまだ移植未完了 (UserFollowingService.follow() の完全な移植には
	// リモートフォロワー対応のブロック側副作用・deliverAccept・AccountMoveService依存の
	// 移行済みアカウント自動承認ロジックが必要で、別途調査中)。
	const relationshipQueueWorker = new Bull.Worker(QUEUE.RELATIONSHIP, (job) => {
		switch (job.name) {
			case 'unfollow': return handleHonoQueueRelationshipUnfollow(deps, job);
			case 'block': return handleHonoQueueRelationshipBlock(deps, job);
			case 'unblock': return handleHonoQueueRelationshipUnblock(deps, job);
			default: throw new Error(`unrecognized or not-yet-migrated job type ${job.name} for relationship`);
		}
	}, {
		...baseWorkerOptions(deps.config, QUEUE.RELATIONSHIP),
		autorun: false,
		concurrency: deps.config.relationshipJobConcurrency ?? 16,
		limiter: {
			max: deps.config.relationshipJobPerSec ?? 64,
			duration: 1000,
		},
	});

	{
		const logger = deps.logger.createSubLogger('relationship');
		relationshipQueueWorker
			.on('active', (job) => logger.debug(`active id=${job.id}`))
			.on('completed', (job, result) => logger.debug(`completed(${result}) id=${job.id}`))
			.on('failed', (job, err) => logger.error(`failed(${err.name}: ${err.message}) id=${job?.id ?? '?'}`, { e: renderError(err) }))
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}
	//#endregion

	//#region post scheduled note
	const postScheduledNoteQueueWorker = new Bull.Worker(QUEUE.POST_SCHEDULED_NOTE, (job) => {
		return handleHonoQueuePostScheduledNote(deps, job);
	}, {
		...baseWorkerOptions(deps.config, QUEUE.POST_SCHEDULED_NOTE),
		autorun: false,
	});
	//#endregion

	//#region system
	// NOTE: checkModeratorsActivity はまだ移植未完了 (MetaService/RoleService/AnnouncementService
	// 依存の調査待ち)。
	const systemQueueWorker = new Bull.Worker(QUEUE.SYSTEM, (job) => {
		switch (job.name) {
			case 'clean': return handleHonoQueueClean(deps);
			case 'aggregateRetention': return handleHonoQueueAggregateRetention(deps);
			case 'tickCharts': return handleHonoQueueTickCharts(deps);
			case 'resyncCharts': return handleHonoQueueResyncCharts(deps);
			case 'cleanCharts': return handleHonoQueueCleanCharts(deps);
			case 'checkExpiredMutings': return handleHonoQueueCheckExpiredMutings(deps);
			case 'bakeBufferedReactions': return handleHonoQueueBakeBufferedReactions(deps);
			case 'cleanRemoteNotes': return handleHonoQueueCleanRemoteNotes(deps, job);
			default: throw new Error(`unrecognized or not-yet-migrated job type ${job.name} for system`);
		}
	}, {
		...baseWorkerOptions(deps.config, QUEUE.SYSTEM),
		autorun: false,
	});

	{
		const logger = deps.logger.createSubLogger('system');
		systemQueueWorker
			.on('active', (job) => logger.debug(`active id=${job.id}`))
			.on('completed', (job, result) => logger.debug(`completed(${result}) id=${job.id}`))
			.on('failed', (job, err) => logger.error(`failed(${err.name}: ${err.message}) id=${job?.id ?? '?'}`, { e: renderError(err) }))
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}
	//#endregion

	//#region deliver
	const deliverQueueWorker = new Bull.Worker(QUEUE.DELIVER, (job) => {
		return handleHonoQueueDeliver(deps, job);
	}, {
		...baseWorkerOptions(deps.config, QUEUE.DELIVER),
		autorun: false,
		concurrency: deps.config.deliverJobConcurrency ?? 128,
		limiter: {
			max: deps.config.deliverJobPerSec ?? 128,
			duration: 1000,
		},
		settings: {
			backoffStrategy: httpRelatedBackoff,
		},
	});

	{
		const logger = deps.logger.createSubLogger('deliver');
		deliverQueueWorker
			.on('active', (job) => logger.debug(`active ${getJobInfo(job, true)} to=${job.data.to}`))
			.on('completed', (job, result) => logger.debug(`completed(${result}) ${getJobInfo(job, true)} to=${job.data.to}`))
			.on('failed', (job, err) => logger.error(`failed(${err.name}: ${err.message}) ${getJobInfo(job)} to=${job ? job.data.to : '-'}`))
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}
	//#endregion

	return {
		userWebhookDeliverQueueWorker,
		systemWebhookDeliverQueueWorker,
		relationshipQueueWorker,
		postScheduledNoteQueueWorker,
		systemQueueWorker,
		deliverQueueWorker,
		start: async () => {
			await Promise.all([
				userWebhookDeliverQueueWorker.run(),
				systemWebhookDeliverQueueWorker.run(),
				relationshipQueueWorker.run(),
				postScheduledNoteQueueWorker.run(),
				systemQueueWorker.run(),
				deliverQueueWorker.run(),
			]);
		},
		stop: async () => {
			await Promise.all([
				userWebhookDeliverQueueWorker.close(),
				systemWebhookDeliverQueueWorker.close(),
				relationshipQueueWorker.close(),
				postScheduledNoteQueueWorker.close(),
				systemQueueWorker.close(),
				deliverQueueWorker.close(),
			]);
		},
	};
}
