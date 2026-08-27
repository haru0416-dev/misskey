/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import type { JobType } from 'bullmq';
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
	type AdminQueueDependencies,
	type QueueClearState,
	type QueueType,
} from '@/core/queue/QueueAdminLogic.js';
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
	// bullmq v6 で JobType から 'paused' が外れた。キューの一時停止はキュー単位の状態になり、
	// 個別ジョブが paused として並ぶことはなくなったため一覧の絞り込みからも除く。
	// clean は v6 でも 'paused' を受けるので adminQueueClearParamDef 側には残している。
	state: z.array(z.enum(['active', 'wait', 'delayed', 'completed', 'failed'])),
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

type AdminQueueSelectParams = z.infer<typeof adminQueueSelectParamDef> & {
	queue: QueueType;
};

type AdminQueueClearParams = z.infer<typeof adminQueueClearParamDef> & {
	queue: QueueType;
	state: QueueClearState;
};

type AdminQueueJobsParams = z.infer<typeof adminQueueJobsParamDef> & {
	queue: QueueType;
	state: JobType[];
};

type AdminQueueJobParams = z.infer<typeof adminQueueJobParamDef> & {
	queue: QueueType;
};

export async function handleApiAdminQueueQueues(deps: ApiAdminQueueDependencies, body: Record<string, unknown>) {
	parseApiParams(adminQueueNoParamsDef, body);

	return await getQueues(deps);
}

export async function handleApiAdminQueueQueueStats(deps: ApiAdminQueueDependencies, body: Record<string, unknown>) {
	const ps = parseApiParams(adminQueueSelectParamDef, body);

	return await getQueueStats(deps, ps.queue);
}

export async function handleApiAdminQueueStats(deps: ApiAdminQueueDependencies, body: Record<string, unknown>) {
	parseApiParams(adminQueueNoParamsDef, body);

	return await getLegacyQueueCounts(deps);
}

export async function handleApiAdminQueueDeliverDelayed(
	deps: ApiAdminQueueDependencies,
	body: Record<string, unknown>,
) {
	parseApiParams(adminQueueNoParamsDef, body);

	return await getDelayedDeliverHosts(deps.deliverQueue);
}

export async function handleApiAdminQueueInboxDelayed(deps: ApiAdminQueueDependencies, body: Record<string, unknown>) {
	parseApiParams(adminQueueNoParamsDef, body);

	return await getDelayedInboxHosts(deps.inboxQueue);
}

export async function handleApiAdminQueueJobs(deps: ApiAdminQueueDependencies, body: Record<string, unknown>) {
	const ps = parseApiParams(adminQueueJobsParamDef, body);

	return await getQueueJobs(deps, ps.queue, ps.state, ps.search);
}

export async function handleApiAdminQueueOutboxDeadLetters(
	deps: ApiAdminQueueDependencies,
	body: Record<string, unknown>,
) {
	const ps = parseApiParams(adminQueueOutboxJobsParamDef, body);
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
	body: Record<string, unknown>,
): Promise<void> {
	const ps = parseApiParams(adminQueueOutboxJobParamDef, body);
	if (!(await retryQueueOutboxDeadLetter(deps, ps.outboxId, ps.revision))) throw outboxStateChangedError();
}

export async function handleApiAdminQueueAbandonOutboxDeadLetter(
	deps: ApiAdminQueueDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const ps = parseApiParams(adminQueueOutboxJobParamDef, body);
	if (!(await abandonQueueOutboxDeadLetter(deps, ps.outboxId, ps.revision))) throw outboxStateChangedError();
}

export async function handleApiAdminQueueShowJob(deps: ApiAdminQueueDependencies, body: Record<string, unknown>) {
	const ps = parseApiParams(adminQueueJobParamDef, body);

	return await getQueueJob(deps, ps.queue, ps.jobId);
}

export async function handleApiAdminQueueShowJobLogs(deps: ApiAdminQueueDependencies, body: Record<string, unknown>) {
	const ps = parseApiParams(adminQueueJobParamDef, body);

	return await getQueueJobLogs(deps, ps.queue, ps.jobId);
}

export async function handleApiAdminQueueClear(
	deps: ApiAdminQueueDependencies,
	moderator: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<void> {
	const ps = parseApiParams(adminQueueClearParamDef, body);

	await clearQueue(deps, ps.queue, ps.state);
	await logModerationEventInDatabase(deps, moderator, 'clearQueue');
}

export async function handleApiAdminQueuePause(
	deps: ApiAdminQueueDependencies,
	moderator: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<void> {
	const ps = parseApiParams(adminQueueSelectParamDef, body);

	await pauseQueue(deps, ps.queue);
	await logModerationEventInDatabase(deps, moderator, 'pauseQueue');
}

export async function handleApiAdminQueueResume(
	deps: ApiAdminQueueDependencies,
	moderator: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<void> {
	const ps = parseApiParams(adminQueueSelectParamDef, body);

	await resumeQueue(deps, ps.queue);
	await logModerationEventInDatabase(deps, moderator, 'resumeQueue');
}

export async function handleApiAdminQueuePromoteJobs(
	deps: ApiAdminQueueDependencies,
	moderator: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<void> {
	const ps = parseApiParams(adminQueueSelectParamDef, body);

	await promoteQueueJobs(deps, ps.queue);
	await logModerationEventInDatabase(deps, moderator, 'promoteQueue');
}

export async function handleApiAdminQueueRetryJob(
	deps: ApiAdminQueueDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const ps = parseApiParams(adminQueueJobParamDef, body);

	await retryQueueJob(deps, ps.queue, ps.jobId);
}

export async function handleApiAdminQueueRemoveJob(
	deps: ApiAdminQueueDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const ps = parseApiParams(adminQueueJobParamDef, body);

	await removeQueueJob(deps, ps.queue, ps.jobId);
}
