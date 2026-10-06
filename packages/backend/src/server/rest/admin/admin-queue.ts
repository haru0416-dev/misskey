/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Params } from '../validation.js';
import { z } from 'zod';
import {
	abandonQueueOutboxDeadLetter,
	clearQueue,
	fetchDelayedDeliverHosts,
	fetchDelayedInboxHosts,
	fetchLegacyQueueCounts,
	fetchQueueJob,
	fetchQueueJobLogs,
	fetchQueueJobs,
	fetchQueues,
	fetchQueueStats,
	listQueueOutboxDeadLetters,
	pauseQueue,
	promoteQueueJobs,
	QUEUE_TYPES,
	QueueJobAlreadyAcknowledgedError,
	QueueJobNotTerminalError,
	removeQueueJob,
	resumeQueue,
	retryQueueJob,
	retryQueueOutboxDeadLetter,
} from '@/core/queue/queue-admin-logic.js';
import type { AdminQueueDependencies } from '@/core/queue/queue-admin-logic.js';
import { logModerationEventInDatabase } from '@/core/moderation/moderation-log-logic.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import { parseApiParams } from '../validation.js';

export type AdminQueueEndpointDependencies = AdminQueueDependencies & {
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

export async function handleApiAdminQueueQueues(deps: AdminQueueEndpointDependencies) {
	return await fetchQueues(deps);
}

export async function handleApiAdminQueueQueueStats(
	deps: AdminQueueEndpointDependencies,
	ps: Params<typeof adminQueueSelectParamDef>,
) {
	return await fetchQueueStats(deps, ps.queue);
}

export async function handleApiAdminQueueStats(deps: AdminQueueEndpointDependencies) {
	return await fetchLegacyQueueCounts(deps);
}

export async function handleApiAdminQueueDeliverDelayed(deps: AdminQueueEndpointDependencies) {
	return await fetchDelayedDeliverHosts(deps.deliverQueue);
}

export async function handleApiAdminQueueInboxDelayed(deps: AdminQueueEndpointDependencies) {
	return await fetchDelayedInboxHosts(deps.inboxQueue);
}

export async function handleApiAdminQueueJobs(
	deps: AdminQueueEndpointDependencies,
	ps: Params<typeof adminQueueJobsParamDef>,
) {
	return await fetchQueueJobs(deps, ps.queue, ps.state, ps.search);
}

export async function handleApiAdminQueueOutboxDeadLetters(
	deps: AdminQueueEndpointDependencies,
	ps: Params<typeof adminQueueOutboxJobsParamDef>,
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

function throwQueueJobApiError(error: unknown): never {
	if (error instanceof QueueJobAlreadyAcknowledgedError) {
		throw new ApiError({
			status: 409,
			message: 'The delivery job has already been acknowledged.',
			code: 'QUEUE_JOB_ALREADY_ACKNOWLEDGED',
			id: '6c686b34-f64a-4b1b-b159-cd5de1870184',
		});
	}
	if (error instanceof QueueJobNotTerminalError) {
		throw new ApiError({
			status: 409,
			message: 'Unresolved delivery outbox work cannot be changed by this queue operation.',
			code: 'QUEUE_JOB_NOT_TERMINAL',
			id: '083a9bb0-6285-45f6-9733-95e8a3b44c20',
		});
	}
	throw error;
}

export async function handleApiAdminQueueRetryOutboxDeadLetter(
	deps: AdminQueueEndpointDependencies,
	ps: Params<typeof adminQueueOutboxJobParamDef>,
): Promise<void> {
	if (!(await retryQueueOutboxDeadLetter(deps, ps.outboxId, ps.revision))) {
		throw outboxStateChangedError();
	}
}

export async function handleApiAdminQueueAbandonOutboxDeadLetter(
	deps: AdminQueueEndpointDependencies,
	ps: Params<typeof adminQueueOutboxJobParamDef>,
): Promise<void> {
	if (!(await abandonQueueOutboxDeadLetter(deps, ps.outboxId, ps.revision))) {
		throw outboxStateChangedError();
	}
}

export async function handleApiAdminQueueShowJob(
	deps: AdminQueueEndpointDependencies,
	ps: Params<typeof adminQueueJobParamDef>,
) {
	return await fetchQueueJob(deps, ps.queue, ps.jobId);
}

export async function handleApiAdminQueueShowJobLogs(
	deps: AdminQueueEndpointDependencies,
	ps: Params<typeof adminQueueJobParamDef>,
) {
	return await fetchQueueJobLogs(deps, ps.queue, ps.jobId);
}

export async function handleApiAdminQueueClear(
	deps: AdminQueueEndpointDependencies,
	moderator: { id: MiUser['id'] },
	ps: Params<typeof adminQueueClearParamDef>,
): Promise<void> {
	try {
		await clearQueue(deps, ps.queue, ps.state);
	} catch (error) {
		throwQueueJobApiError(error);
	}
	await logModerationEventInDatabase(deps, moderator, 'clearQueue');
}

export async function handleApiAdminQueuePause(
	deps: AdminQueueEndpointDependencies,
	moderator: { id: MiUser['id'] },
	ps: Params<typeof adminQueueSelectParamDef>,
): Promise<void> {
	await pauseQueue(deps, ps.queue);
	await logModerationEventInDatabase(deps, moderator, 'pauseQueue');
}

export async function handleApiAdminQueueResume(
	deps: AdminQueueEndpointDependencies,
	moderator: { id: MiUser['id'] },
	ps: Params<typeof adminQueueSelectParamDef>,
): Promise<void> {
	await resumeQueue(deps, ps.queue);
	await logModerationEventInDatabase(deps, moderator, 'resumeQueue');
}

export async function handleApiAdminQueuePromoteJobs(
	deps: AdminQueueEndpointDependencies,
	moderator: { id: MiUser['id'] },
	ps: Params<typeof adminQueueSelectParamDef>,
): Promise<void> {
	try {
		await promoteQueueJobs(deps, ps.queue);
	} catch (error) {
		throwQueueJobApiError(error);
	}
	await logModerationEventInDatabase(deps, moderator, 'promoteQueue');
}

export async function handleApiAdminQueueRetryJob(
	deps: AdminQueueEndpointDependencies,
	ps: Params<typeof adminQueueJobParamDef>,
): Promise<void> {
	try {
		await retryQueueJob(deps, ps.queue, ps.jobId);
	} catch (error) {
		throwQueueJobApiError(error);
	}
}

export async function handleApiAdminQueueRemoveJob(
	deps: AdminQueueEndpointDependencies,
	ps: Params<typeof adminQueueJobParamDef>,
): Promise<void> {
	try {
		await removeQueueJob(deps, ps.queue, ps.jobId);
	} catch (error) {
		throwQueueJobApiError(error);
	}
}
