/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import type { Config } from '@/config.js';
import type Logger from '@/logger.js';
import { isDebugLoggingEnabled } from '@/logger.js';
import { QUEUE, baseWorkerOptions } from '@/queue/const.js';
import {
	handleQueueSystemWebhookDeliver,
	handleQueueUserWebhookDeliver,
	type QueueWebhookDeliverDependencies,
} from './handlers/webhook-deliver.js';
import {
	handleQueueRelationshipBlock,
	handleQueueRelationshipFollow,
	handleQueueRelationshipUnblock,
	handleQueueRelationshipUnfollow,
	type QueueRelationshipDependencies,
} from './handlers/relationship.js';
import {
	handleQueuePostScheduledNote,
	type QueuePostScheduledNoteDependencies,
} from './handlers/post-scheduled-note.js';
import {
	handleQueueAggregateRetention,
	handleQueueBakeBufferedReactions,
	handleQueueCheckExpiredMutings,
	handleQueueClean,
	handleQueueCleanCharts,
	handleQueueResyncCharts,
	handleQueueTickCharts,
	type QueueSystemDependencies,
} from './handlers/system.js';
import { handleQueueCleanRemoteNotes, type QueueCleanRemoteNotesDependencies } from './handlers/clean-remote-notes.js';
import {
	handleQueueCheckModeratorsActivity,
	type QueueCheckModeratorsActivityDependencies,
} from './handlers/check-moderators-activity.js';
import { handleQueueDeliver, type QueueDeliverDependencies } from './handlers/deliver.js';
import { handleQueueInbox, type QueueInboxDependencies } from './handlers/inbox.js';
import {
	handleQueueEndedPollNotification,
	type QueueEndedPollNotificationDependencies,
} from './handlers/ended-poll-notification.js';
import {
	handleQueueCleanRemoteFiles,
	handleQueueDeleteFile,
	type QueueObjectStorageDependencies,
} from './handlers/object-storage.js';
import {
	handleQueueDeleteDriveFiles,
	handleQueueDeleteDriveFile,
	handleQueueExportAntennas,
	handleQueueExportBlocking,
	handleQueueExportFollowing,
	handleQueueExportMuting,
	handleQueueExportUserLists,
	handleQueueImportMuting,
	handleQueueImportUserLists,
	handleQueueImportBlocking,
	handleQueueImportBlockingToDb,
	handleQueueImportFollowing,
	handleQueueImportFollowingToDb,
	handleQueueExportFavorites,
	handleQueueExportNotes,
	handleQueueExportClips,
	type QueueDbDependencies,
} from './handlers/db.js';
import {
	handleQueueExportCustomEmojis,
	handleQueueImportCustomEmojis,
	type QueueEmojisDependencies,
} from './handlers/emojis.js';
import { handleQueueDeleteAccount, type QueueDeleteAccountDependencies } from './handlers/delete-account.js';
import type { SystemJobName } from './system-job-schedulers.js';
import { dispatchQueueOutbox } from '@/core/queue/QueueOutboxStore.js';
import type { DbJobData, DbJobName } from '@/queue/types.js';
import { handleQueueUserSuspensionPostEffects } from '@/server/rest/admin/admin-user-suspension.js';
import { handleQueueNotePostCreate } from '@/server/rest/note/notes-create.js';

export type QueueShellDependencies = QueueWebhookDeliverDependencies &
	QueueRelationshipDependencies &
	QueuePostScheduledNoteDependencies &
	QueueSystemDependencies &
	QueueCleanRemoteNotesDependencies &
	QueueDeliverDependencies &
	QueueInboxDependencies &
	QueueEndedPollNotificationDependencies &
	QueueObjectStorageDependencies &
	QueueDbDependencies &
	QueueEmojisDependencies &
	QueueDeleteAccountDependencies &
	QueueCheckModeratorsActivityDependencies & {
		config: Config;
		logger: Logger;
	};

export type QueueWorkers = {
	userWebhookDeliverQueueWorker: Bull.Worker;
	systemWebhookDeliverQueueWorker: Bull.Worker;
	relationshipQueueWorker: Bull.Worker;
	postScheduledNoteQueueWorker: Bull.Worker;
	systemQueueWorker: Bull.Worker;
	deliverQueueWorker: Bull.Worker;
	inboxQueueWorker: Bull.Worker;
	endedPollNotificationQueueWorker: Bull.Worker;
	objectStorageQueueWorker: Bull.Worker;
	dbQueueWorker: Bull.Worker<DbJobData<DbJobName>, unknown, DbJobName>;
	start: () => Promise<void>;
	stop: () => Promise<void>;
};

type DbJobHandlerMap = {
	[Name in DbJobName]: (job: Bull.Job<DbJobData<Name>, unknown, Name>) => Promise<unknown>;
};

// ref. https://github.com/misskey-dev/misskey/pull/7635#issue-971097019
function httpRelatedBackoff(config: Config, attemptsMade: number): number {
	const baseDelay = config.queues.backoff.initialDelayMs;
	const maxBackoff = config.queues.backoff.maximumDelayMs;
	let backoff = (Math.pow(2, attemptsMade) - 1) * baseDelay;
	backoff = Math.min(backoff, maxBackoff);
	backoff += Math.round(backoff * Math.random() * config.queues.backoff.jitterRatio);
	return backoff;
}

function getJobInfo(job: Bull.Job | undefined, increment = false): string {
	if (job == null) return '-';

	const age = Date.now() - job.timestamp;
	const formated =
		age > 60000 ? `${Math.floor(age / 1000 / 60)}m` : age > 10000 ? `${Math.floor(age / 1000)}s` : `${age}ms`;

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
 * BullMQ の `Bull.Worker` を `deps` (プレーンオブジェクト) 付きのハンドラ関数にバインドする。
 *
 * system/db/deliver/inbox/userWebhookDeliver/systemWebhookDeliver/relationship/objectStorage/
 * endedPollNotification/postScheduledNote の10個の Worker をここで組み立てる。
 * 本番のジョブキュー起動経路は `boot/common.ts` の `jobQueue()`。
 */
export function createQueueWorkers(deps: QueueShellDependencies): QueueWorkers {
	const outboxLogger = deps.logger.createSubLogger('queue-outbox');
	let outboxTimer: ReturnType<typeof setInterval> | undefined;
	let isDispatchingOutbox = false;
	const dispatchOutbox = async (): Promise<void> => {
		if (isDispatchingOutbox) return;
		isDispatchingOutbox = true;
		try {
			await dispatchQueueOutbox(deps.db, deps.dbQueue, deps.deliverQueue);
		} catch (error) {
			outboxLogger.error('Failed to dispatch queue outbox', {
				e: renderError(error instanceof Error ? error : new Error(String(error))),
			});
		} finally {
			isDispatchingOutbox = false;
		}
	};
	const userWebhookDeliverQueueWorker = new Bull.Worker(
		QUEUE.USER_WEBHOOK_DELIVER,
		(job) => {
			return handleQueueUserWebhookDeliver(deps, job);
		},
		{
			...baseWorkerOptions(deps.config, QUEUE.USER_WEBHOOK_DELIVER),
			autorun: false,
			concurrency: deps.config.queues.userWebhooks.concurrencyPerWorker ?? 64,
			limiter: {
				max: deps.config.queues.userWebhooks.maximumStartsPerSecond ?? 64,
				duration: 1000,
			},
			settings: {
				backoffStrategy: (attemptsMade) => httpRelatedBackoff(deps.config, attemptsMade),
			},
		},
	);

	{
		const logger = deps.logger.createSubLogger('user-webhook');
		userWebhookDeliverQueueWorker
			.on('active', (job) => {
				if (isDebugLoggingEnabled()) logger.debug(`active ${getJobInfo(job, true)} to=${job.data.to}`);
			})
			.on('completed', (job, result) => {
				if (isDebugLoggingEnabled()) logger.debug(`completed(${result}) ${getJobInfo(job, true)} to=${job.data.to}`);
			})
			.on('failed', (job, err) =>
				logger.error(`failed(${err.name}: ${err.message}) ${getJobInfo(job)} to=${job ? job.data.to : '-'}`),
			)
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}

	const systemWebhookDeliverQueueWorker = new Bull.Worker(
		QUEUE.SYSTEM_WEBHOOK_DELIVER,
		(job) => {
			return handleQueueSystemWebhookDeliver(deps, job);
		},
		{
			...baseWorkerOptions(deps.config, QUEUE.SYSTEM_WEBHOOK_DELIVER),
			autorun: false,
			concurrency: deps.config.queues.systemWebhooks.concurrencyPerWorker ?? 16,
			limiter: {
				max: deps.config.queues.systemWebhooks.maximumStartsPerSecond ?? 16,
				duration: 1000,
			},
			settings: {
				backoffStrategy: (attemptsMade) => httpRelatedBackoff(deps.config, attemptsMade),
			},
		},
	);

	{
		const logger = deps.logger.createSubLogger('system-webhook');
		systemWebhookDeliverQueueWorker
			.on('active', (job) => {
				if (isDebugLoggingEnabled()) logger.debug(`active ${getJobInfo(job, true)} to=${job.data.to}`);
			})
			.on('completed', (job, result) => {
				if (isDebugLoggingEnabled()) logger.debug(`completed(${result}) ${getJobInfo(job, true)} to=${job.data.to}`);
			})
			.on('failed', (job, err) =>
				logger.error(`failed(${err.name}: ${err.message}) ${getJobInfo(job)} to=${job ? job.data.to : '-'}`),
			)
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}

	const relationshipQueueWorker = new Bull.Worker(
		QUEUE.RELATIONSHIP,
		(job) => {
			switch (job.name) {
				case 'follow':
					return handleQueueRelationshipFollow(deps, job);
				case 'unfollow':
					return handleQueueRelationshipUnfollow(deps, job);
				case 'block':
					return handleQueueRelationshipBlock(deps, job);
				case 'unblock':
					return handleQueueRelationshipUnblock(deps, job);
				default:
					throw new Error(`unrecognized or not-yet-migrated job type ${job.name} for relationship`);
			}
		},
		{
			...baseWorkerOptions(deps.config, QUEUE.RELATIONSHIP),
			autorun: false,
			concurrency: deps.config.queues.relationships.concurrencyPerWorker ?? 16,
			limiter: {
				max: deps.config.queues.relationships.maximumStartsPerSecond ?? 64,
				duration: 1000,
			},
		},
	);

	{
		const logger = deps.logger.createSubLogger('relationship');
		relationshipQueueWorker
			.on('active', (job) => logger.debug(`active id=${job.id}`))
			.on('completed', (job, result) => logger.debug(`completed(${result}) id=${job.id}`))
			.on('failed', (job, err) =>
				logger.error(`failed(${err.name}: ${err.message}) id=${job?.id ?? '?'}`, { e: renderError(err) }),
			)
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}

	const postScheduledNoteQueueWorker = new Bull.Worker(
		QUEUE.POST_SCHEDULED_NOTE,
		(job) => {
			return handleQueuePostScheduledNote(deps, job);
		},
		{
			...baseWorkerOptions(deps.config, QUEUE.POST_SCHEDULED_NOTE),
			autorun: false,
		},
	);

	const systemJobHandlers = {
		clean: () => handleQueueClean(deps),
		aggregateRetention: () => handleQueueAggregateRetention(deps),
		tickCharts: () => handleQueueTickCharts(deps),
		resyncCharts: () => handleQueueResyncCharts(deps),
		cleanCharts: () => handleQueueCleanCharts(deps),
		checkExpiredMutings: () => handleQueueCheckExpiredMutings(deps),
		bakeBufferedReactions: () => handleQueueBakeBufferedReactions(deps),
		cleanRemoteNotes: (job) => handleQueueCleanRemoteNotes(deps, job),
		checkModeratorsActivity: () => handleQueueCheckModeratorsActivity(deps),
	} satisfies Record<SystemJobName, (job: Bull.Job) => Promise<unknown>>;
	const systemQueueWorker = new Bull.Worker(
		QUEUE.SYSTEM,
		(job) => {
			const handler = systemJobHandlers[job.name as SystemJobName];
			if (handler == null) throw new Error(`unrecognized job type ${job.name} for system`);
			return handler(job);
		},
		{
			...baseWorkerOptions(deps.config, QUEUE.SYSTEM),
			autorun: false,
			concurrency: deps.config.queues.system.concurrencyPerWorker ?? 1,
		},
	);

	{
		const logger = deps.logger.createSubLogger('system');
		systemQueueWorker
			.on('active', (job) => logger.debug(`active id=${job.id}`))
			.on('completed', (job, result) => logger.debug(`completed(${result}) id=${job.id}`))
			.on('failed', (job, err) =>
				logger.error(`failed(${err.name}: ${err.message}) id=${job?.id ?? '?'}`, { e: renderError(err) }),
			)
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}

	const deliverQueueWorker = new Bull.Worker(
		QUEUE.DELIVER,
		(job) => {
			return handleQueueDeliver(deps, job);
		},
		{
			...baseWorkerOptions(deps.config, QUEUE.DELIVER),
			autorun: false,
			concurrency: deps.config.queues.deliver.concurrencyPerWorker ?? 128,
			limiter: {
				max: deps.config.queues.deliver.maximumStartsPerSecond ?? 128,
				duration: 1000,
			},
			settings: {
				backoffStrategy: (attemptsMade) => httpRelatedBackoff(deps.config, attemptsMade),
			},
		},
	);

	{
		const logger = deps.logger.createSubLogger('deliver');
		deliverQueueWorker
			.on('active', (job) => {
				if (isDebugLoggingEnabled()) logger.debug(`active ${getJobInfo(job, true)} to=${job.data.to}`);
			})
			.on('completed', (job, result) => {
				if (isDebugLoggingEnabled()) logger.debug(`completed(${result}) ${getJobInfo(job, true)} to=${job.data.to}`);
			})
			.on('failed', (job, err) =>
				logger.error(`failed(${err.name}: ${err.message}) ${getJobInfo(job)} to=${job ? job.data.to : '-'}`),
			)
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}

	const inboxQueueWorker = new Bull.Worker(
		QUEUE.INBOX,
		(job) => {
			return handleQueueInbox(deps, job);
		},
		{
			...baseWorkerOptions(deps.config, QUEUE.INBOX),
			autorun: false,
			concurrency: deps.config.queues.inbox.concurrencyPerWorker ?? 16,
			limiter: {
				max: deps.config.queues.inbox.maximumStartsPerSecond ?? 32,
				duration: 1000,
			},
			settings: {
				backoffStrategy: (attemptsMade) => httpRelatedBackoff(deps.config, attemptsMade),
			},
		},
	);

	{
		const logger = deps.logger.createSubLogger('inbox');
		inboxQueueWorker
			.on('active', (job) => {
				if (isDebugLoggingEnabled()) logger.debug(`active ${getJobInfo(job, true)}`);
			})
			.on('completed', (job, result) => {
				if (isDebugLoggingEnabled()) logger.debug(`completed(${result}) ${getJobInfo(job, true)}`);
			})
			.on('failed', (job, err) =>
				logger.error(
					`failed(${err.name}: ${err.message}) ${getJobInfo(job)} activity=${job ? (job.data.activity ? job.data.activity.id : 'none') : '-'}`,
					{ e: renderError(err) },
				),
			)
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}

	const endedPollNotificationQueueWorker = new Bull.Worker(
		QUEUE.ENDED_POLL_NOTIFICATION,
		(job) => {
			return handleQueueEndedPollNotification(deps, job);
		},
		{
			...baseWorkerOptions(deps.config, QUEUE.ENDED_POLL_NOTIFICATION),
			autorun: false,
		},
	);

	const objectStorageQueueWorker = new Bull.Worker(
		QUEUE.OBJECT_STORAGE,
		(job) => {
			switch (job.name) {
				case 'deleteFile':
					return handleQueueDeleteFile(deps, job);
				case 'cleanRemoteFiles':
					return handleQueueCleanRemoteFiles(deps, job);
				default:
					throw new Error(`unrecognized job type ${job.name} for objectStorage`);
			}
		},
		{
			...baseWorkerOptions(deps.config, QUEUE.OBJECT_STORAGE),
			autorun: false,
			concurrency: deps.config.queues.objectStorage.concurrencyPerWorker ?? 16,
		},
	);

	{
		const logger = deps.logger.createSubLogger('objectStorage');
		objectStorageQueueWorker
			.on('active', (job) => logger.debug(`active id=${job.id}`))
			.on('completed', (job, result) => logger.debug(`completed(${result}) id=${job.id}`))
			.on('failed', (job, err) =>
				logger.error(`failed(${err.name}: ${err.message}) id=${job?.id ?? '?'}`, { e: renderError(err) }),
			)
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}

	const dbJobHandlers = {
		deleteDriveFile: (job) => handleQueueDeleteDriveFile(deps, job),
		deleteDriveFiles: (job) => handleQueueDeleteDriveFiles(deps, job),
		exportMuting: (job) => handleQueueExportMuting(deps, job),
		exportBlocking: (job) => handleQueueExportBlocking(deps, job),
		exportUserLists: (job) => handleQueueExportUserLists(deps, job),
		exportAntennas: (job) => handleQueueExportAntennas(deps, job),
		exportFollowing: (job) => handleQueueExportFollowing(deps, job),
		importMuting: (job) => handleQueueImportMuting(deps, job),
		importUserLists: (job) => handleQueueImportUserLists(deps, job),
		importBlocking: (job) => handleQueueImportBlocking(deps, job),
		importBlockingToDb: (job) => handleQueueImportBlockingToDb(deps, job),
		importFollowing: (job) => handleQueueImportFollowing(deps, job),
		importFollowingToDb: (job) => handleQueueImportFollowingToDb(deps, job),
		exportFavorites: (job) => handleQueueExportFavorites(deps, job),
		exportNotes: (job) => handleQueueExportNotes(deps, job),
		exportClips: (job) => handleQueueExportClips(deps, job),
		exportCustomEmojis: (job) => handleQueueExportCustomEmojis(deps, job),
		importCustomEmojis: (job) => handleQueueImportCustomEmojis(deps, job),
		deleteAccount: (job) => handleQueueDeleteAccount(deps, job),
		userSuspensionPostEffects: (job) => handleQueueUserSuspensionPostEffects(deps, job),
		notePostCreate: (job) => handleQueueNotePostCreate(deps, job),
	} satisfies DbJobHandlerMap;
	const dispatchDbJob = <K extends DbJobName>(job: Bull.Job<DbJobData<K>, unknown, K>): Promise<unknown> => {
		if (!Object.hasOwn(dbJobHandlers, job.name)) throw new Error(`unrecognized job type ${job.name} for db`);
		const handler: DbJobHandlerMap[K] | undefined = dbJobHandlers[job.name];
		if (handler == null) throw new Error(`unrecognized job type ${job.name} for db`);
		return handler(job);
	};
	const dbQueueWorker = new Bull.Worker<DbJobData<DbJobName>, unknown, DbJobName>(
		QUEUE.DB,
		(job) => {
			return dispatchDbJob(job);
		},
		{
			...baseWorkerOptions(deps.config, QUEUE.DB),
			autorun: false,
			concurrency: deps.config.queues.database.concurrencyPerWorker ?? 1,
		},
	);

	{
		const logger = deps.logger.createSubLogger('db');
		dbQueueWorker
			.on('active', (job) => logger.debug(`active id=${job.id}`))
			.on('completed', (job, result) => logger.debug(`completed(${result}) id=${job.id}`))
			.on('failed', (job, err) =>
				logger.error(`failed(${err.name}: ${err.message}) id=${job?.id ?? '?'}`, { e: renderError(err) }),
			)
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
			await dispatchOutbox();
			outboxTimer = setInterval(() => void dispatchOutbox(), 1000);
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
			if (outboxTimer != null) clearInterval(outboxTimer);
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
