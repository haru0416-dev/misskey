/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MetricsTime, type JobType } from 'bullmq';
import type { Packed } from '@/misc/json-schema.js';
import type {
	DbQueue,
	DeliverQueue,
	EndedPollNotificationQueue,
	InboxQueue,
	ObjectStorageQueue,
	PostScheduledNoteQueue,
	RelationshipQueue,
	SystemQueue,
	SystemWebhookDeliverQueue,
	UserWebhookDeliverQueue,
} from '@/core/queues.js';
import type * as Bull from 'bullmq';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { getQueueOutboxStats } from '@/core/QueueOutboxStore.js';

export const QUEUE_TYPES = [
	'system',
	'endedPollNotification',
	'postScheduledNote',
	'deliver',
	'inbox',
	'db',
	'relationship',
	'objectStorage',
	'userWebhookDeliver',
	'systemWebhookDeliver',
] as const;

export type QueueType = typeof QUEUE_TYPES[number];
export type QueueClearState = '*' | 'completed' | 'wait' | 'active' | 'paused' | 'prioritized' | 'delayed' | 'failed';

export type AdminQueueDependencies = {
	db: MiDrizzleDatabase;
	systemQueue: SystemQueue;
	endedPollNotificationQueue: EndedPollNotificationQueue;
	postScheduledNoteQueue: PostScheduledNoteQueue;
	deliverQueue: DeliverQueue;
	inboxQueue: InboxQueue;
	dbQueue: DbQueue;
	relationshipQueue: RelationshipQueue;
	objectStorageQueue: ObjectStorageQueue;
	userWebhookDeliverQueue: UserWebhookDeliverQueue;
	systemWebhookDeliverQueue: SystemWebhookDeliverQueue;
};

function parseRedisInfo(infoText: string): Record<string, string> {
	const lines = infoText
		.split('\n')
		.filter(line => line.length > 0 && !line.startsWith('#'))
		.map(line => line.trim());

	const result: Record<string, string> = {};
	for (const line of lines) {
		const separator = line.indexOf(':');
		if (separator === -1) continue;
		result[line.slice(0, separator)] = line.slice(separator + 1);
	}
	return result;
}

function parseRedisInfoInteger(value: string | undefined, field: string): number {
	if (value == null) throw new Error(`Redis INFO response is missing ${field}`);
	const parsed = parseInt(value, 10);
	if (!Number.isFinite(parsed)) throw new Error(`Redis INFO response has invalid ${field}`);
	return parsed;
}

function parseOptionalRedisInfoNumber(value: string | undefined, fallback: number): number {
	if (value == null) return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function requireRedisInfoString(value: string | undefined, field: string): string {
	if (value == null || value === '') throw new Error(`Redis INFO response is missing ${field}`);
	return value;
}

function parseRedisMode(value: string | undefined): 'cluster' | 'standalone' | 'sentinel' {
	if (value === 'cluster' || value === 'standalone' || value === 'sentinel') return value;
	throw new Error('Redis INFO response has invalid server mode');
}

export function parseQueueDatabaseInfo(infoText: string) {
	const db = parseRedisInfo(infoText);
	const usedMemory = parseRedisInfoInteger(db.used_memory, 'used_memory');

	return {
		version: requireRedisInfoString(db.valkey_version ?? db.redis_version, 'valkey_version or redis_version'),
		mode: parseRedisMode(db.server_mode ?? db.redis_mode),
		runId: requireRedisInfoString(db.run_id, 'run_id'),
		processId: requireRedisInfoString(db.process_id, 'process_id'),
		port: parseRedisInfoInteger(db.tcp_port, 'tcp_port'),
		os: requireRedisInfoString(db.os, 'os'),
		uptime: parseRedisInfoInteger(db.uptime_in_seconds, 'uptime_in_seconds'),
		memory: {
			total: parseOptionalRedisInfoNumber(db.total_system_memory, 0) || parseOptionalRedisInfoNumber(db.maxmemory, 0),
			used: usedMemory,
			fragmentationRatio: parseOptionalRedisInfoNumber(db.mem_fragmentation_ratio, 0),
			peak: parseOptionalRedisInfoNumber(db.used_memory_peak, usedMemory),
		},
		clients: {
			connected: parseRedisInfoInteger(db.connected_clients, 'connected_clients'),
			blocked: parseOptionalRedisInfoNumber(db.blocked_clients, 0),
		},
	};
}

export function getQueue(deps: AdminQueueDependencies, type: QueueType): Bull.Queue | DbQueue {
	switch (type) {
		case 'system': return deps.systemQueue;
		case 'endedPollNotification': return deps.endedPollNotificationQueue;
		case 'postScheduledNote': return deps.postScheduledNoteQueue;
		case 'deliver': return deps.deliverQueue;
		case 'inbox': return deps.inboxQueue;
		case 'db': return deps.dbQueue;
		case 'relationship': return deps.relationshipQueue;
		case 'objectStorage': return deps.objectStorageQueue;
		case 'userWebhookDeliver': return deps.userWebhookDeliverQueue;
		case 'systemWebhookDeliver': return deps.systemWebhookDeliverQueue;
		default: throw new Error(`Unrecognized queue type: ${type}`);
	}
}

export async function clearQueue(deps: AdminQueueDependencies, queueType: QueueType, state: QueueClearState): Promise<void> {
	const queue = getQueue(deps, queueType);

	if (state === '*') {
		await Promise.all([
			queue.clean(0, 0, 'completed'),
			queue.clean(0, 0, 'wait'),
			queue.clean(0, 0, 'active'),
			queue.clean(0, 0, 'paused'),
			queue.clean(0, 0, 'prioritized'),
			queue.clean(0, 0, 'delayed'),
			queue.clean(0, 0, 'failed'),
		]);
	} else {
		await queue.clean(0, 0, state);
	}
}

export async function promoteQueueJobs(deps: AdminQueueDependencies, queueType: QueueType): Promise<void> {
	const queue = getQueue(deps, queueType);
	await queue.promoteJobs();
}

export async function pauseQueue(deps: AdminQueueDependencies, queueType: QueueType): Promise<void> {
	const queue = getQueue(deps, queueType);
	await queue.pause();
}

export async function resumeQueue(deps: AdminQueueDependencies, queueType: QueueType): Promise<void> {
	const queue = getQueue(deps, queueType);
	await queue.resume();
}

export async function retryQueueJob(deps: AdminQueueDependencies, queueType: QueueType, jobId: string): Promise<void> {
	const queue = getQueue(deps, queueType);
	const job = await queue.getJob(jobId);
	if (job != null) {
		if (job.finishedOn != null) {
			await job.retry();
		} else {
			await job.promote();
		}
	}
}

export async function removeQueueJob(deps: AdminQueueDependencies, queueType: QueueType, jobId: string): Promise<void> {
	const queue = getQueue(deps, queueType);
	const job = await queue.getJob(jobId);
	if (job != null) {
		await job.remove();
	}
}

export function packQueueJob(job: Bull.Job): Packed<'QueueJob'> {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	const stacktrace = job.stacktrace ? job.stacktrace.filter(Boolean) : [];
	stacktrace.reverse();

	return {
		id: job.id!,
		name: job.name,
		data: job.data,
		opts: job.opts,
		timestamp: job.timestamp,
		processedOn: job.processedOn,
		processedBy: job.processedBy,
		finishedOn: job.finishedOn,
		progress: job.progress,
		attempts: job.attemptsMade,
		delay: job.delay,
		failedReason: job.failedReason,
		stacktrace,
		returnValue: job.returnvalue,
		isFailed: !!job.failedReason || (Array.isArray(stacktrace) && stacktrace.length > 0),
	};
}

export async function getQueueJob(deps: AdminQueueDependencies, queueType: QueueType, jobId: string): Promise<Packed<'QueueJob'>> {
	const queue = getQueue(deps, queueType);
	const job = await queue.getJob(jobId);
	if (job != null) {
		return packQueueJob(job);
	} else {
		throw new Error(`Job not found: ${jobId}`);
	}
}

export async function getQueueJobLogs(deps: AdminQueueDependencies, queueType: QueueType, jobId: string): Promise<string[]> {
	const queue = getQueue(deps, queueType);
	const result = await queue.getJobLogs(jobId);
	return result.logs;
}

export async function getQueueJobs(deps: AdminQueueDependencies, queueType: QueueType, jobTypes: JobType[], search?: string): Promise<Packed<'QueueJob'>[]> {
	const RETURN_LIMIT = 100;
	const queue = getQueue(deps, queueType);
	let jobs: Bull.Job[];

	if (search) {
		jobs = await queue.getJobs(jobTypes, 0, 1000);

		jobs = jobs.filter(job => {
			const jobString = JSON.stringify(job).toLowerCase();
			return search.toLowerCase().split(' ').every(term => {
				return jobString.includes(term);
			});
		});

		jobs = jobs.slice(0, RETURN_LIMIT);
	} else {
		jobs = await queue.getJobs(jobTypes, 0, RETURN_LIMIT);
	}

	return jobs.map(packQueueJob);
}

export async function getQueues(deps: AdminQueueDependencies) {
	const fetchings = QUEUE_TYPES.map(async type => {
		const queue = getQueue(deps, type);

		const counts = await queue.getJobCounts();
		const isPaused = await queue.isPaused();
		const metricsCompleted = await queue.getMetrics('completed', 0, MetricsTime.ONE_WEEK);
		const metricsFailed = await queue.getMetrics('failed', 0, MetricsTime.ONE_WEEK);

		return {
			name: type,
			counts,
			isPaused,
			outbox: type === 'db' ? await getQueueOutboxStats(deps.db) : null,
			metrics: {
				completed: metricsCompleted,
				failed: metricsFailed,
			},
		};
	});

	return await Promise.all(fetchings);
}

export async function getQueueStats(deps: AdminQueueDependencies, queueType: QueueType) {
	const queue = getQueue(deps, queueType);
	const counts = await queue.getJobCounts();
	const isPaused = await queue.isPaused();
	const metricsCompleted = await queue.getMetrics('completed', 0, MetricsTime.ONE_WEEK);
	const metricsFailed = await queue.getMetrics('failed', 0, MetricsTime.ONE_WEEK);
	const db = parseQueueDatabaseInfo(await (await queue.client).info());

	return {
		name: queueType,
		qualifiedName: queue.qualifiedName,
		counts,
		isPaused,
		outbox: queueType === 'db' ? await getQueueOutboxStats(deps.db) : null,
		metrics: {
			completed: metricsCompleted,
			failed: metricsFailed,
		},
		db,
	};
}

export async function getLegacyQueueCounts(deps: Pick<AdminQueueDependencies, 'deliverQueue' | 'inboxQueue' | 'dbQueue' | 'objectStorageQueue'>) {
	const deliverJobCounts = await deps.deliverQueue.getJobCounts();
	const inboxJobCounts = await deps.inboxQueue.getJobCounts();
	const dbJobCounts = await deps.dbQueue.getJobCounts();
	const objectStorageJobCounts = await deps.objectStorageQueue.getJobCounts();

	return {
		deliver: deliverJobCounts,
		inbox: inboxJobCounts,
		db: dbJobCounts,
		objectStorage: objectStorageJobCounts,
	};
}

export async function getDelayedDeliverHosts(queue: DeliverQueue): Promise<[string, number][]> {
	const jobs = await queue.getJobs(['delayed']);
	const counts = new Map<string, number>();

	for (const job of jobs) {
		const host = new URL(job.data.to).host;
		counts.set(host, (counts.get(host) ?? 0) + 1);
	}

	return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export async function getDelayedInboxHosts(queue: InboxQueue): Promise<[string, number][]> {
	const jobs = await queue.getJobs(['delayed']);
	const counts = new Map<string, number>();

	for (const job of jobs) {
		const host = new URL(job.data.signature.keyId).host;
		counts.set(host, (counts.get(host) ?? 0) + 1);
	}

	return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
