/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import type { JobType } from 'bullmq';
import type { Config } from '@/config.js';
import { clearQueue, getDelayedDeliverHosts, getDelayedInboxHosts, getLegacyQueueCounts, getQueueJob, getQueueJobLogs, getQueueJobs, getQueues, getQueueStats, pauseQueue, promoteQueueJobs, QUEUE_TYPES, removeQueueJob, resumeQueue, retryQueueJob, type AdminQueueDependencies, type QueueClearState, type QueueType } from '@/core/QueueAdminLogic.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAdminQueueDependencies = AdminQueueDependencies & {
	config: Pick<Config, 'id'>;
	db: MiDrizzleDatabase;
};

const adminQueueNoParamsDef = z.object({});

const adminQueueSelectParamDef = z.object({
	queue: z.enum(QUEUE_TYPES),
});

const adminQueueClearParamDef = z.object({
	queue: z.enum(QUEUE_TYPES),
	state: z.enum(['*', 'completed', 'wait', 'active', 'paused', 'prioritized', 'delayed', 'failed']),
});

const adminQueueJobsParamDef = z.object({
	queue: z.enum(QUEUE_TYPES),
	state: z.array(z.enum(['active', 'wait', 'delayed', 'completed', 'failed', 'paused'])),
	search: z.string().optional(),
});

const adminQueueJobParamDef = z.object({
	queue: z.enum(QUEUE_TYPES),
	jobId: z.string(),
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

export async function handleHonoApiAdminQueueQueues(
	deps: HonoApiAdminQueueDependencies,
	body: Record<string, unknown>,
) {
	parseHonoApiParams(adminQueueNoParamsDef, body);

	return await getQueues(deps);
}

export async function handleHonoApiAdminQueueQueueStats(
	deps: HonoApiAdminQueueDependencies,
	body: Record<string, unknown>,
) {
	const ps = parseHonoApiParams(adminQueueSelectParamDef, body);

	return await getQueueStats(deps, ps.queue);
}

export async function handleHonoApiAdminQueueStats(
	deps: HonoApiAdminQueueDependencies,
	body: Record<string, unknown>,
) {
	parseHonoApiParams(adminQueueNoParamsDef, body);

	return await getLegacyQueueCounts(deps);
}

export async function handleHonoApiAdminQueueDeliverDelayed(
	deps: HonoApiAdminQueueDependencies,
	body: Record<string, unknown>,
) {
	parseHonoApiParams(adminQueueNoParamsDef, body);

	return await getDelayedDeliverHosts(deps.deliverQueue);
}

export async function handleHonoApiAdminQueueInboxDelayed(
	deps: HonoApiAdminQueueDependencies,
	body: Record<string, unknown>,
) {
	parseHonoApiParams(adminQueueNoParamsDef, body);

	return await getDelayedInboxHosts(deps.inboxQueue);
}

export async function handleHonoApiAdminQueueJobs(
	deps: HonoApiAdminQueueDependencies,
	body: Record<string, unknown>,
) {
	const ps = parseHonoApiParams(adminQueueJobsParamDef, body);

	return await getQueueJobs(deps, ps.queue, ps.state, ps.search);
}

export async function handleHonoApiAdminQueueShowJob(
	deps: HonoApiAdminQueueDependencies,
	body: Record<string, unknown>,
) {
	const ps = parseHonoApiParams(adminQueueJobParamDef, body);

	return await getQueueJob(deps, ps.queue, ps.jobId);
}

export async function handleHonoApiAdminQueueShowJobLogs(
	deps: HonoApiAdminQueueDependencies,
	body: Record<string, unknown>,
) {
	const ps = parseHonoApiParams(adminQueueJobParamDef, body);

	return await getQueueJobLogs(deps, ps.queue, ps.jobId);
}

export async function handleHonoApiAdminQueueClear(
	deps: HonoApiAdminQueueDependencies,
	moderator: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<void> {
	const ps = parseHonoApiParams(adminQueueClearParamDef, body);

	await clearQueue(deps, ps.queue, ps.state);
	await logModerationEventInDatabase(deps, moderator, 'clearQueue');
}

export async function handleHonoApiAdminQueuePause(
	deps: HonoApiAdminQueueDependencies,
	moderator: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<void> {
	const ps = parseHonoApiParams(adminQueueSelectParamDef, body);

	await pauseQueue(deps, ps.queue);
	await logModerationEventInDatabase(deps, moderator, 'pauseQueue');
}

export async function handleHonoApiAdminQueueResume(
	deps: HonoApiAdminQueueDependencies,
	moderator: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<void> {
	const ps = parseHonoApiParams(adminQueueSelectParamDef, body);

	await resumeQueue(deps, ps.queue);
	await logModerationEventInDatabase(deps, moderator, 'resumeQueue');
}

export async function handleHonoApiAdminQueuePromoteJobs(
	deps: HonoApiAdminQueueDependencies,
	moderator: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<void> {
	const ps = parseHonoApiParams(adminQueueSelectParamDef, body);

	await promoteQueueJobs(deps, ps.queue);
	await logModerationEventInDatabase(deps, moderator, 'promoteQueue');
}

export async function handleHonoApiAdminQueueRetryJob(
	deps: HonoApiAdminQueueDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const ps = parseHonoApiParams(adminQueueJobParamDef, body);

	await retryQueueJob(deps, ps.queue, ps.jobId);
}

export async function handleHonoApiAdminQueueRemoveJob(
	deps: HonoApiAdminQueueDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const ps = parseHonoApiParams(adminQueueJobParamDef, body);

	await removeQueueJob(deps, ps.queue, ps.jobId);
}
