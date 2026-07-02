/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { JobType } from 'bullmq';
import { getDelayedDeliverHosts, getDelayedInboxHosts, getLegacyQueueCounts, getQueueJob, getQueueJobLogs, getQueueJobs, getQueues, getQueueStats, QUEUE_TYPES, type AdminQueueDependencies, type QueueType } from '@/core/QueueAdminLogic.js';
import type { SchemaType } from '@/misc/json-schema.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiAdminQueueDependencies = AdminQueueDependencies;

const adminQueueNoParamsDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

const adminQueueSelectParamDef = {
	type: 'object',
	properties: {
		queue: { type: 'string', enum: QUEUE_TYPES },
	},
	required: ['queue'],
} as const;

const adminQueueJobsParamDef = {
	type: 'object',
	properties: {
		queue: { type: 'string', enum: QUEUE_TYPES },
		state: { type: 'array', items: { type: 'string', enum: ['active', 'wait', 'delayed', 'completed', 'failed', 'paused'] } },
		search: { type: 'string' },
	},
	required: ['queue', 'state'],
} as const;

const adminQueueJobParamDef = {
	type: 'object',
	properties: {
		queue: { type: 'string', enum: QUEUE_TYPES },
		jobId: { type: 'string' },
	},
	required: ['queue', 'jobId'],
} as const;

type AdminQueueSelectParams = SchemaType<typeof adminQueueSelectParamDef> & {
	queue: QueueType;
};

type AdminQueueJobsParams = SchemaType<typeof adminQueueJobsParamDef> & {
	queue: QueueType;
	state: JobType[];
};

type AdminQueueJobParams = SchemaType<typeof adminQueueJobParamDef> & {
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
	const ps = parseHonoApiParams(adminQueueSelectParamDef, body) as AdminQueueSelectParams;

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
	const ps = parseHonoApiParams(adminQueueJobsParamDef, body) as AdminQueueJobsParams;

	return await getQueueJobs(deps, ps.queue, ps.state, ps.search);
}

export async function handleHonoApiAdminQueueShowJob(
	deps: HonoApiAdminQueueDependencies,
	body: Record<string, unknown>,
) {
	const ps = parseHonoApiParams(adminQueueJobParamDef, body) as AdminQueueJobParams;

	return await getQueueJob(deps, ps.queue, ps.jobId);
}

export async function handleHonoApiAdminQueueShowJobLogs(
	deps: HonoApiAdminQueueDependencies,
	body: Record<string, unknown>,
) {
	const ps = parseHonoApiParams(adminQueueJobParamDef, body) as AdminQueueJobParams;

	return await getQueueJobLogs(deps, ps.queue, ps.jobId);
}
