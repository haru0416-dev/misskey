/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ApiParams } from '../validation.js';
import { z } from 'zod';
import {
	abandonQueueOutboxDeadLetter,
	clearQueue,
	getDelayedDeliverHosts,
	getDelayedInboxHosts,
	getLegacyQueueCounts,
	getQueueJob,
	getQueueJobLogs,
	getQueueJobs,
	getQueues,
	getQueueStats,
	listQueueOutboxDeadLetters,
	pauseQueue,
	promoteQueueJobs,
	QUEUE_TYPES,
	removeQueueJob,
	resumeQueue,
	retryQueueJob,
	retryQueueOutboxDeadLetter,
} from '@/core/queue/QueueAdminLogic.js';
import type { AdminQueueDependencies } from '@/core/queue/QueueAdminLogic.js';
import { logModerationEventInDatabase } from '@/core/moderation/ModerationLogLogic.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import { parseApiParams } from '../validation.js';

export type ApiAdminQueueDependencies = AdminQueueDependencies & {
	db: MiDrizzleDatabase;
};

const adminQueueNoParamsDef = z.object({});

export const adminQueueSelectParamDef = z.object({
	queue: z.enum(QUEUE_TYPES),
});

export const adminQueueClearParamDef = z.object({
	queue: z.enum(QUEUE_TYPES),
	state: z.enum(['*', 'completed', 'wait', 'active', 'paused', 'prioritized', 'delayed', 'failed']),
});

export const adminQueueJobsParamDef = z.object({
	queue: z.enum(QUEUE_TYPES),
	// bullmq v6 の一時停止はキュー単位で、ジョブが 'paused' として並ぶことはない (JobType にも無い)。
	// clean は 'paused' を受けるので adminQueueClearParamDef には残す。
	// 配送キューの処理待ちは全件に優先度が付くため wait ではなく prioritized に並ぶ。
	state: z.array(z.enum(['active', 'wait', 'prioritized', 'delayed', 'completed', 'failed'])),
	search: z.string().optional(),
});

export const adminQueueJobParamDef = z.object({
	queue: z.enum(QUEUE_TYPES),
	jobId: z.string(),
});

export const adminQueueOutboxJobsParamDef = z.object({
	limit: z.int().min(1).max(100).optional(),
	untilId: z.string().min(1).max(32).optional(),
});

export const adminQueueOutboxJobParamDef = z.object({
	outboxId: z.string().min(1).max(32),
	revision: z.int().min(0),
});

export async function handleApiAdminQueueQueues(deps: ApiAdminQueueDependencies) {
	return await getQueues(deps);
}

export async function handleApiAdminQueueQueueStats(
	deps: ApiAdminQueueDependencies,
	ps: ApiParams<typeof adminQueueSelectParamDef>,
) {
	return await getQueueStats(deps, ps.queue);
}

export async function handleApiAdminQueueStats(deps: ApiAdminQueueDependencies) {
	return await getLegacyQueueCounts(deps);
}

export async function handleApiAdminQueueDeliverDelayed(deps: ApiAdminQueueDependencies) {
	return await getDelayedDeliverHosts(deps.deliverQueue);
}

export async function handleApiAdminQueueInboxDelayed(deps: ApiAdminQueueDependencies) {
	return await getDelayedInboxHosts(deps.inboxQueue);
}

export async function handleApiAdminQueueJobs(
	deps: ApiAdminQueueDependencies,
	ps: ApiParams<typeof adminQueueJobsParamDef>,
) {
	return await getQueueJobs(deps, ps.queue, ps.state, ps.search);
}

export async function handleApiAdminQueueOutboxDeadLetters(
	deps: ApiAdminQueueDependencies,
	ps: ApiParams<typeof adminQueueOutboxJobsParamDef>,
) {
	const rows = await listQueueOutboxDeadLetters(deps, ps.limit ?? 50, ps.untilId);
	return rows.map((row) => ({
		id: row.id,
		queue: row.queue,
		name: row.name,
		coordinatorId: row.coordinatorId,
		externalJobId: row.externalJobId,
		deadLetterReason: row.deadLetterReason,
		lastError: row.lastError,
		revision: row.revision,
		data: row.data,
		opts: row.opts,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	}));
}

function outboxStateChangedError(): ApiError {
	return new ApiError({
		status: 409,
		message: 'The queue outbox item has changed.',
		code: 'QUEUE_OUTBOX_STATE_CHANGED',
		id: '9209ed67-4fa3-44e9-955b-a6c5d6df172f',
	});
}

export async function handleApiAdminQueueRetryOutboxDeadLetter(
	deps: ApiAdminQueueDependencies,
	ps: ApiParams<typeof adminQueueOutboxJobParamDef>,
): Promise<void> {
	if (!(await retryQueueOutboxDeadLetter(deps, ps.outboxId, ps.revision))) {
		throw outboxStateChangedError();
	}
}

export async function handleApiAdminQueueAbandonOutboxDeadLetter(
	deps: ApiAdminQueueDependencies,
	ps: ApiParams<typeof adminQueueOutboxJobParamDef>,
): Promise<void> {
	if (!(await abandonQueueOutboxDeadLetter(deps, ps.outboxId, ps.revision))) {
		throw outboxStateChangedError();
	}
}

export async function handleApiAdminQueueShowJob(
	deps: ApiAdminQueueDependencies,
	ps: ApiParams<typeof adminQueueJobParamDef>,
) {
	return await getQueueJob(deps, ps.queue, ps.jobId);
}

export async function handleApiAdminQueueShowJobLogs(
	deps: ApiAdminQueueDependencies,
	ps: ApiParams<typeof adminQueueJobParamDef>,
) {
	return await getQueueJobLogs(deps, ps.queue, ps.jobId);
}

export async function handleApiAdminQueueClear(
	deps: ApiAdminQueueDependencies,
	moderator: { id: MiUser['id'] },
	ps: ApiParams<typeof adminQueueClearParamDef>,
): Promise<void> {
	await clearQueue(deps, ps.queue, ps.state);
	await logModerationEventInDatabase(deps, moderator, 'clearQueue');
}

export async function handleApiAdminQueuePause(
	deps: ApiAdminQueueDependencies,
	moderator: { id: MiUser['id'] },
	ps: ApiParams<typeof adminQueueSelectParamDef>,
): Promise<void> {
	await pauseQueue(deps, ps.queue);
	await logModerationEventInDatabase(deps, moderator, 'pauseQueue');
}

export async function handleApiAdminQueueResume(
	deps: ApiAdminQueueDependencies,
	moderator: { id: MiUser['id'] },
	ps: ApiParams<typeof adminQueueSelectParamDef>,
): Promise<void> {
	await resumeQueue(deps, ps.queue);
	await logModerationEventInDatabase(deps, moderator, 'resumeQueue');
}

export async function handleApiAdminQueuePromoteJobs(
	deps: ApiAdminQueueDependencies,
	moderator: { id: MiUser['id'] },
	ps: ApiParams<typeof adminQueueSelectParamDef>,
): Promise<void> {
	await promoteQueueJobs(deps, ps.queue);
	await logModerationEventInDatabase(deps, moderator, 'promoteQueue');
}

export async function handleApiAdminQueueRetryJob(
	deps: ApiAdminQueueDependencies,
	ps: ApiParams<typeof adminQueueJobParamDef>,
): Promise<void> {
	await retryQueueJob(deps, ps.queue, ps.jobId);
}

export async function handleApiAdminQueueRemoveJob(
	deps: ApiAdminQueueDependencies,
	ps: ApiParams<typeof adminQueueJobParamDef>,
): Promise<void> {
	await removeQueueJob(deps, ps.queue, ps.jobId);
}
