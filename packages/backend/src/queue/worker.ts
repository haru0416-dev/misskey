/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import type { Config } from '@/config.js';
import type Logger from '@/logger.js';
import { isDebugLoggingEnabled } from '@/logger.js';
import { QUEUE, baseWorkerOptions } from '@/queue/const.js';
import { handleHonoQueueSystemWebhookDeliver, handleHonoQueueUserWebhookDeliver, type HonoQueueWebhookDeliverDependencies } from './handlers/webhook-deliver.js';
import {
	handleHonoQueueRelationshipBlock,
	handleHonoQueueRelationshipFollow,
	handleHonoQueueRelationshipUnblock,
	handleHonoQueueRelationshipUnfollow,
	type HonoQueueRelationshipDependencies,
} from './handlers/relationship.js';
import { handleHonoQueuePostScheduledNote, type HonoQueuePostScheduledNoteDependencies } from './handlers/post-scheduled-note.js';
import {
	handleHonoQueueAggregateRetention,
	handleHonoQueueBakeBufferedReactions,
	handleHonoQueueCheckExpiredMutings,
	handleHonoQueueClean,
	handleHonoQueueCleanCharts,
	handleHonoQueueResyncCharts,
	handleHonoQueueTickCharts,
	type HonoQueueSystemDependencies,
} from './handlers/system.js';
import { handleHonoQueueCleanRemoteNotes, type HonoQueueCleanRemoteNotesDependencies } from './handlers/clean-remote-notes.js';
import { handleHonoQueueCheckModeratorsActivity, type HonoQueueCheckModeratorsActivityDependencies } from './handlers/check-moderators-activity.js';
import { handleHonoQueueDeliver, type HonoQueueDeliverDependencies } from './handlers/deliver.js';
import { handleHonoQueueInbox, type HonoQueueInboxDependencies } from './handlers/inbox.js';
import { handleHonoQueueEndedPollNotification, type HonoQueueEndedPollNotificationDependencies } from './handlers/ended-poll-notification.js';
import { handleHonoQueueCleanRemoteFiles, handleHonoQueueDeleteFile, type HonoQueueObjectStorageDependencies } from './handlers/object-storage.js';
import {
	handleHonoQueueDeleteDriveFiles,
	handleHonoQueueExportAntennas,
	handleHonoQueueExportBlocking,
	handleHonoQueueExportFollowing,
	handleHonoQueueExportMuting,
	handleHonoQueueExportUserLists,
	handleHonoQueueImportAntennas,
	handleHonoQueueImportMuting,
	handleHonoQueueImportUserLists,
	handleHonoQueueImportBlocking,
	handleHonoQueueImportBlockingToDb,
	handleHonoQueueImportFollowing,
	handleHonoQueueImportFollowingToDb,
	handleHonoQueueExportFavorites,
	handleHonoQueueExportNotes,
	handleHonoQueueExportClips,
	type HonoQueueDbDependencies,
} from './handlers/db.js';
import { handleHonoQueueExportCustomEmojis, handleHonoQueueImportCustomEmojis, type HonoQueueEmojisDependencies } from './handlers/emojis.js';
import { handleHonoQueueDeleteAccount, type HonoQueueDeleteAccountDependencies } from './handlers/delete-account.js';
import type { SystemJobName } from './system-job-schedulers.js';

export type HonoQueueShellDependencies = HonoQueueWebhookDeliverDependencies & HonoQueueRelationshipDependencies & HonoQueuePostScheduledNoteDependencies & HonoQueueSystemDependencies & HonoQueueCleanRemoteNotesDependencies & HonoQueueDeliverDependencies & HonoQueueInboxDependencies & HonoQueueEndedPollNotificationDependencies & HonoQueueObjectStorageDependencies & HonoQueueDbDependencies & HonoQueueEmojisDependencies & HonoQueueDeleteAccountDependencies & HonoQueueCheckModeratorsActivityDependencies & {
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
	inboxQueueWorker: Bull.Worker;
	endedPollNotificationQueueWorker: Bull.Worker;
	objectStorageQueueWorker: Bull.Worker;
	dbQueueWorker: Bull.Worker;
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
 * 元の QueueProcessorService が組み立てる10個の Worker (system/db/deliver/inbox/
 * userWebhookDeliver/systemWebhookDeliver/relationship/objectStorage/endedPollNotification/
 * postScheduledNote) 全てのコードがこの関数に揃った (inbox = ApInboxService の全アクティビティ種別
 * 移植を含む)。本番のジョブキュー起動経路は `boot/common.ts` の `jobQueue()`。
 */
export function createHonoQueueWorkers(deps: HonoQueueShellDependencies): HonoQueueWorkers {
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
			.on('active', (job) => { if (isDebugLoggingEnabled()) logger.debug(`active ${getJobInfo(job, true)} to=${job.data.to}`); })
			.on('completed', (job, result) => { if (isDebugLoggingEnabled()) logger.debug(`completed(${result}) ${getJobInfo(job, true)} to=${job.data.to}`); })
			.on('failed', (job, err) => logger.error(`failed(${err.name}: ${err.message}) ${getJobInfo(job)} to=${job ? job.data.to : '-'}`))
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}

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
			.on('active', (job) => { if (isDebugLoggingEnabled()) logger.debug(`active ${getJobInfo(job, true)} to=${job.data.to}`); })
			.on('completed', (job, result) => { if (isDebugLoggingEnabled()) logger.debug(`completed(${result}) ${getJobInfo(job, true)} to=${job.data.to}`); })
			.on('failed', (job, err) => logger.error(`failed(${err.name}: ${err.message}) ${getJobInfo(job)} to=${job ? job.data.to : '-'}`))
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}

	const relationshipQueueWorker = new Bull.Worker(QUEUE.RELATIONSHIP, (job) => {
		switch (job.name) {
			case 'follow': return handleHonoQueueRelationshipFollow(deps, job);
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

	const postScheduledNoteQueueWorker = new Bull.Worker(QUEUE.POST_SCHEDULED_NOTE, (job) => {
		return handleHonoQueuePostScheduledNote(deps, job);
	}, {
		...baseWorkerOptions(deps.config, QUEUE.POST_SCHEDULED_NOTE),
		autorun: false,
	});

	const systemJobHandlers = {
		clean: () => handleHonoQueueClean(deps),
		aggregateRetention: () => handleHonoQueueAggregateRetention(deps),
		tickCharts: () => handleHonoQueueTickCharts(deps),
		resyncCharts: () => handleHonoQueueResyncCharts(deps),
		cleanCharts: () => handleHonoQueueCleanCharts(deps),
		checkExpiredMutings: () => handleHonoQueueCheckExpiredMutings(deps),
		bakeBufferedReactions: () => handleHonoQueueBakeBufferedReactions(deps),
		cleanRemoteNotes: (job) => handleHonoQueueCleanRemoteNotes(deps, job),
		checkModeratorsActivity: () => handleHonoQueueCheckModeratorsActivity(deps),
	} satisfies Record<SystemJobName, (job: Bull.Job) => Promise<unknown>>;
	const systemQueueWorker = new Bull.Worker(QUEUE.SYSTEM, (job) => {
		const handler = systemJobHandlers[job.name as SystemJobName];
		if (handler == null) throw new Error(`unrecognized job type ${job.name} for system`);
		return handler(job);
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
			.on('active', (job) => { if (isDebugLoggingEnabled()) logger.debug(`active ${getJobInfo(job, true)} to=${job.data.to}`); })
			.on('completed', (job, result) => { if (isDebugLoggingEnabled()) logger.debug(`completed(${result}) ${getJobInfo(job, true)} to=${job.data.to}`); })
			.on('failed', (job, err) => logger.error(`failed(${err.name}: ${err.message}) ${getJobInfo(job)} to=${job ? job.data.to : '-'}`))
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}

	const inboxQueueWorker = new Bull.Worker(QUEUE.INBOX, (job) => {
		return handleHonoQueueInbox(deps, job);
	}, {
		...baseWorkerOptions(deps.config, QUEUE.INBOX),
		autorun: false,
		concurrency: deps.config.inboxJobConcurrency ?? 16,
		limiter: {
			max: deps.config.inboxJobPerSec ?? 32,
			duration: 1000,
		},
		settings: {
			backoffStrategy: httpRelatedBackoff,
		},
	});

	{
		const logger = deps.logger.createSubLogger('inbox');
		inboxQueueWorker
			.on('active', (job) => { if (isDebugLoggingEnabled()) logger.debug(`active ${getJobInfo(job, true)}`); })
			.on('completed', (job, result) => { if (isDebugLoggingEnabled()) logger.debug(`completed(${result}) ${getJobInfo(job, true)}`); })
			.on('failed', (job, err) => logger.error(`failed(${err.name}: ${err.message}) ${getJobInfo(job)} activity=${job ? (job.data.activity ? job.data.activity.id : 'none') : '-'}`, { e: renderError(err) }))
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}

	const endedPollNotificationQueueWorker = new Bull.Worker(QUEUE.ENDED_POLL_NOTIFICATION, (job) => {
		return handleHonoQueueEndedPollNotification(deps, job);
	}, {
		...baseWorkerOptions(deps.config, QUEUE.ENDED_POLL_NOTIFICATION),
		autorun: false,
	});

	const objectStorageQueueWorker = new Bull.Worker(QUEUE.OBJECT_STORAGE, (job) => {
		switch (job.name) {
			case 'deleteFile': return handleHonoQueueDeleteFile(deps, job);
			case 'cleanRemoteFiles': return handleHonoQueueCleanRemoteFiles(deps, job);
			default: throw new Error(`unrecognized job type ${job.name} for objectStorage`);
		}
	}, {
		...baseWorkerOptions(deps.config, QUEUE.OBJECT_STORAGE),
		autorun: false,
		concurrency: 16,
	});

	{
		const logger = deps.logger.createSubLogger('objectStorage');
		objectStorageQueueWorker
			.on('active', (job) => logger.debug(`active id=${job.id}`))
			.on('completed', (job, result) => logger.debug(`completed(${result}) id=${job.id}`))
			.on('failed', (job, err) => logger.error(`failed(${err.name}: ${err.message}) id=${job?.id ?? '?'}`, { e: renderError(err) }))
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}

	// dbキューの全18ジョブ型を移植済み。
	const dbQueueWorker = new Bull.Worker(QUEUE.DB, (job) => {
		switch (job.name) {
			case 'deleteDriveFiles': return handleHonoQueueDeleteDriveFiles(deps, job);
			case 'exportMuting': return handleHonoQueueExportMuting(deps, job);
			case 'exportBlocking': return handleHonoQueueExportBlocking(deps, job);
			case 'exportUserLists': return handleHonoQueueExportUserLists(deps, job);
			case 'exportAntennas': return handleHonoQueueExportAntennas(deps, job);
			case 'exportFollowing': return handleHonoQueueExportFollowing(deps, job);
			case 'importAntennas': return handleHonoQueueImportAntennas(deps, job);
			case 'importMuting': return handleHonoQueueImportMuting(deps, job);
			case 'importUserLists': return handleHonoQueueImportUserLists(deps, job);
			case 'importBlocking': return handleHonoQueueImportBlocking(deps, job);
			case 'importBlockingToDb': return handleHonoQueueImportBlockingToDb(deps, job);
			case 'importFollowing': return handleHonoQueueImportFollowing(deps, job);
			case 'importFollowingToDb': return handleHonoQueueImportFollowingToDb(deps, job);
			case 'exportFavorites': return handleHonoQueueExportFavorites(deps, job);
			case 'exportNotes': return handleHonoQueueExportNotes(deps, job);
			case 'exportClips': return handleHonoQueueExportClips(deps, job);
			case 'exportCustomEmojis': return handleHonoQueueExportCustomEmojis(deps, job);
			case 'importCustomEmojis': return handleHonoQueueImportCustomEmojis(deps, job);
			case 'deleteAccount': return handleHonoQueueDeleteAccount(deps, job);
			default: throw new Error(`unrecognized or not-yet-migrated job type ${job.name} for db`);
		}
	}, {
		...baseWorkerOptions(deps.config, QUEUE.DB),
		autorun: false,
	});

	{
		const logger = deps.logger.createSubLogger('db');
		dbQueueWorker
			.on('active', (job) => logger.debug(`active id=${job.id}`))
			.on('completed', (job, result) => logger.debug(`completed(${result}) id=${job.id}`))
			.on('failed', (job, err) => logger.error(`failed(${err.name}: ${err.message}) id=${job?.id ?? '?'}`, { e: renderError(err) }))
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}

	return {
		userWebhookDeliverQueueWorker,
		systemWebhookDeliverQueueWorker,
		relationshipQueueWorker,
		postScheduledNoteQueueWorker,
		systemQueueWorker,
		deliverQueueWorker,
		inboxQueueWorker,
		endedPollNotificationQueueWorker,
		objectStorageQueueWorker,
		dbQueueWorker,
		start: async () => {
			await Promise.all([
				userWebhookDeliverQueueWorker.run(),
				systemWebhookDeliverQueueWorker.run(),
				relationshipQueueWorker.run(),
				postScheduledNoteQueueWorker.run(),
				systemQueueWorker.run(),
				deliverQueueWorker.run(),
				inboxQueueWorker.run(),
				endedPollNotificationQueueWorker.run(),
				objectStorageQueueWorker.run(),
				dbQueueWorker.run(),
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
				inboxQueueWorker.close(),
				objectStorageQueueWorker.close(),
				endedPollNotificationQueueWorker.close(),
				dbQueueWorker.close(),
			]);
		},
	};
}
