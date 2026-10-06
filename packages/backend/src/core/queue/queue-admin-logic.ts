/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MetricsTime } from 'bullmq';
import { and, eq, sql } from 'drizzle-orm';
import type { JobType } from 'bullmq';
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
} from '@/core/queue/queues.js';
import { fetchQueueJobCounts } from '@/core/queue/queues.js';
import type * as Bull from 'bullmq';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import {
	abandonDeadLetterOutboxInDatabase,
	fetchQueueOutboxByIdFromDatabase,
	fetchQueueOutboxStats,
	listDeadLetterQueueOutboxFromDatabase,
	retryDeadLetterOutboxInDatabase,
} from '@/core/queue/queue-outbox-store.js';
import {
	enqueueDeliveryQueueCleanupInDatabase,
	fetchDeliveryQueueCleanupByJobIdFromDatabase,
	fetchDeliveryQueueCleanupStats,
} from '@/core/queue/delivery-queue-cleanup-store.js';
import { queueOutbox } from '@/db/schema/queue-outbox.js';

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

export type QueueType = (typeof QUEUE_TYPES)[number];
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

export class QueueJobAlreadyAcknowledgedError extends Error {
	constructor() {
		super('The delivery job has already been acknowledged.');
		this.name = 'QueueJobAlreadyAcknowledgedError';
	}
}

export class QueueJobNotTerminalError extends Error {
	constructor() {
		super('Unresolved delivery outbox work cannot be changed by this queue operation.');
		this.name = 'QueueJobNotTerminalError';
	}
}

const CLEAR_BATCH_SIZE = 500;
const CLEAR_CONCURRENCY = 16;

async function lockDeliverOutbox(db: MiDrizzleDatabase, jobId: string) {
	return await db
		.select()
		.from(queueOutbox)
		.where(
			and(
				eq(queueOutbox.queue, 'deliver'),
				sql`coalesce(${queueOutbox.externalJobId}, 'outbox-' || ${queueOutbox.id}) = ${jobId}`,
			),
		)
		.orderBy(queueOutbox.id)
		.for('update');
}

async function prepareDeliveryRemoval(deps: AdminQueueDependencies, jobId: string, apply: boolean) {
	return await deps.db.transaction(async (transaction) => {
		const tx = transaction as MiDrizzleDatabase;
		const rows = await lockDeliverOutbox(tx, jobId);
		const job = await deps.deliverQueue.getJob(jobId);
		const completed = job != null && (await job.getState()) === 'completed';
		if (!completed && rows.some((row) => row.state !== 'deadLetter')) {
			throw new QueueJobNotTerminalError();
		}
		if (apply && rows.length > 0) {
			await enqueueDeliveryQueueCleanupInDatabase(tx, [jobId]);
			for (const row of rows) {
				await tx.delete(queueOutbox).where(eq(queueOutbox.id, row.id));
			}
		}
		return job;
	});
}

async function prepareDeliveryPromotion(deps: AdminQueueDependencies, jobId: string, apply: boolean): Promise<void> {
	await deps.db.transaction(async (transaction) => {
		const tx = transaction as MiDrizzleDatabase;
		const rows = await lockDeliverOutbox(tx, jobId);
		const receipt = await fetchDeliveryQueueCleanupByJobIdFromDatabase(tx, jobId);
		const job = await deps.deliverQueue.getJob(jobId);
		const state = await job?.getState();
		if (receipt != null || state === 'completed') {
			throw new QueueJobAlreadyAcknowledgedError();
		}
		if (rows.some((row) => row.state === 'deadLetter')) {
			throw new QueueJobNotTerminalError();
		}
		// delayed 専用の promote は終了証拠を消さず、配送の backoff を管理者が短縮できる。
		if (apply && state === 'delayed') await job?.promote();
	});
}

async function snapshotDeliverJobs(queue: DeliverQueue, types: JobType[]): Promise<string[]> {
	const snapshotTime = Date.now();
	const ids: string[] = [];
	for (const type of types) {
		const count = await queue.getJobCountByTypes(type);
		for (let offset = 0; offset < count; offset += CLEAR_BATCH_SIZE) {
			const jobs = await queue.getJobs([type], offset, Math.min(count, offset + CLEAR_BATCH_SIZE) - 1, true);
			for (const job of jobs) {
				if (job.id != null && job.timestamp <= snapshotTime) ids.push(job.id);
			}
		}
	}
	return ids;
}

async function clearDeliveries(deps: AdminQueueDependencies, state: QueueClearState): Promise<void> {
	const queue = deps.deliverQueue;
	let types: JobType[];
	if (state === '*') {
		types = ['completed', 'wait', 'active', 'prioritized', 'delayed', 'failed'];
	} else if (state === 'paused') {
		types = (await queue.isPaused()) ? ['wait'] : [];
	} else {
		types = [state];
	}
	const ids = await snapshotDeliverJobs(queue, types);
	// 未解決の outbox が含まれる操作は、他のジョブを削除する前に拒否する。
	// 削除時も行ロック後に再確認し、consumer が後から完了した証拠を一括 clean で巻き込まない。
	for (let offset = 0; offset < ids.length; offset += CLEAR_CONCURRENCY) {
		await Promise.all(
			ids.slice(offset, offset + CLEAR_CONCURRENCY).map((jobId) => prepareDeliveryRemoval(deps, jobId, false)),
		);
	}
	for (let offset = 0; offset < ids.length; offset += CLEAR_CONCURRENCY) {
		await Promise.all(
			ids.slice(offset, offset + CLEAR_CONCURRENCY).map((jobId) => removeQueueJob(deps, 'deliver', jobId)),
		);
	}
}

function parseRedisInfo(infoText: string): Record<string, string> {
	const lines = infoText
		.split('\n')
		.filter((line) => line.length > 0 && !line.startsWith('#'))
		.map((line) => line.trim());

	const result: Record<string, string> = {};
	for (const line of lines) {
		const separator = line.indexOf(':');
		if (separator === -1) {
			continue;
		}
		result[line.slice(0, separator)] = line.slice(separator + 1);
	}
	return result;
}

function parseRedisInfoInteger(value: string | undefined, field: string): number {
	if (value == null) {
		throw new Error(`Redis INFO response is missing ${field}`);
	}
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) {
		throw new Error(`Redis INFO response has invalid ${field}`);
	}
	return parsed;
}

function parseOptionalRedisInfoNumber(value: string | undefined, fallback: number): number {
	if (value == null) {
		return fallback;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function requireRedisInfoString(value: string | undefined, field: string): string {
	if (value == null || value === '') {
		throw new Error(`Redis INFO response is missing ${field}`);
	}
	return value;
}

function parseRedisMode(value: string | undefined): 'cluster' | 'standalone' | 'sentinel' {
	if (value === 'cluster' || value === 'standalone' || value === 'sentinel') {
		return value;
	}
	throw new Error('Redis INFO response has invalid server mode');
}

export function parseQueueDatabaseInfo(infoText: string) {
	const db = parseRedisInfo(infoText);
	const usedMemory = parseRedisInfoInteger(db['used_memory'], 'used_memory');

	return {
		version: requireRedisInfoString(db['valkey_version'] ?? db['redis_version'], 'valkey_version or redis_version'),
		mode: parseRedisMode(db['server_mode'] ?? db['redis_mode']),
		runId: requireRedisInfoString(db['run_id'], 'run_id'),
		processId: requireRedisInfoString(db['process_id'], 'process_id'),
		port: parseRedisInfoInteger(db['tcp_port'], 'tcp_port'),
		os: requireRedisInfoString(db['os'], 'os'),
		uptime: parseRedisInfoInteger(db['uptime_in_seconds'], 'uptime_in_seconds'),
		memory: {
			total:
				parseOptionalRedisInfoNumber(db['total_system_memory'], 0) || parseOptionalRedisInfoNumber(db['maxmemory'], 0),
			used: usedMemory,
			fragmentationRatio: parseOptionalRedisInfoNumber(db['mem_fragmentation_ratio'], 0),
			peak: parseOptionalRedisInfoNumber(db['used_memory_peak'], usedMemory),
		},
		clients: {
			connected: parseRedisInfoInteger(db['connected_clients'], 'connected_clients'),
			blocked: parseOptionalRedisInfoNumber(db['blocked_clients'], 0),
		},
	};
}

function getQueue(deps: AdminQueueDependencies, type: QueueType): Bull.Queue | DbQueue {
	switch (type) {
		case 'system':
			return deps.systemQueue;
		case 'endedPollNotification':
			return deps.endedPollNotificationQueue;
		case 'postScheduledNote':
			return deps.postScheduledNoteQueue;
		case 'deliver':
			return deps.deliverQueue;
		case 'inbox':
			return deps.inboxQueue;
		case 'db':
			return deps.dbQueue;
		case 'relationship':
			return deps.relationshipQueue;
		case 'objectStorage':
			return deps.objectStorageQueue;
		case 'userWebhookDeliver':
			return deps.userWebhookDeliverQueue;
		case 'systemWebhookDeliver':
			return deps.systemWebhookDeliverQueue;
		default:
			throw new Error(`Unrecognized queue type: ${type}`);
	}
}

export async function clearQueue(
	deps: AdminQueueDependencies,
	queueType: QueueType,
	state: QueueClearState,
): Promise<void> {
	const queue = getQueue(deps, queueType);
	if (queueType === 'deliver') {
		await clearDeliveries(deps, state);
		return;
	}

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
	if (queueType === 'deliver') {
		const ids = await snapshotDeliverJobs(deps.deliverQueue, ['delayed']);
		for (const jobId of ids) {
			await prepareDeliveryPromotion(deps, jobId, false);
		}
		for (const jobId of ids) {
			await prepareDeliveryPromotion(deps, jobId, true);
		}
		return;
	}
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
	if (queueType === 'deliver') {
		await deps.db.transaction(async (transaction) => {
			const tx = transaction as MiDrizzleDatabase;
			const rows = await lockDeliverOutbox(tx, jobId);
			const receipt = await fetchDeliveryQueueCleanupByJobIdFromDatabase(tx, jobId);
			const job = await deps.deliverQueue.getJob(jobId);
			const state = await job?.getState();
			if (receipt != null || state === 'completed') {
				throw new QueueJobAlreadyAcknowledgedError();
			}
			if (rows.length > 0) {
				if (rows.some((row) => row.state !== 'deadLetter')) {
					if (state !== 'delayed' || rows.some((row) => row.state !== 'published' && row.state !== 'ready')) {
						throw new QueueJobNotTerminalError();
					}
					await job?.promote();
					return;
				}
				await job?.remove();
				for (const row of rows) {
					if (!(await retryDeadLetterOutboxInDatabase(tx, row.id, row.revision))) {
						throw new QueueJobNotTerminalError();
					}
				}
				return;
			}
			if (job != null) {
				if (job.finishedOn != null) {
					await job.retry();
				} else {
					await job.promote();
				}
			}
		});
		return;
	}
	const outboxId = queueType === 'db' && jobId.startsWith('outbox-') ? jobId.slice('outbox-'.length) : null;
	if (outboxId != null && outboxId.length > 0) {
		const outbox = await fetchQueueOutboxByIdFromDatabase(deps.db, outboxId);
		if (outbox?.state === 'deadLetter') {
			await (await queue.getJob(jobId))?.remove();
			await retryDeadLetterOutboxInDatabase(deps.db, outboxId, outbox.revision);
			return;
		}
	}

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
	if (queueType === 'deliver') {
		const job = await prepareDeliveryRemoval(deps, jobId, true);
		await job?.remove();
		return;
	}
	await (await queue.getJob(jobId))?.remove();
}

export async function listQueueOutboxDeadLetters(
	deps: Pick<AdminQueueDependencies, 'db'>,
	limit: number,
	untilId?: string,
) {
	return await listDeadLetterQueueOutboxFromDatabase(deps.db, limit, untilId);
}

export async function retryQueueOutboxDeadLetter(
	deps: AdminQueueDependencies,
	id: string,
	revision: number,
): Promise<boolean> {
	const outbox = await fetchQueueOutboxByIdFromDatabase(deps.db, id);
	if (outbox?.state !== 'deadLetter' || outbox.revision !== revision) {
		return false;
	}
	if (outbox.queue === 'deliver') {
		return await deps.db.transaction(async (transaction) => {
			const tx = transaction as MiDrizzleDatabase;
			const [current] = await tx.select().from(queueOutbox).where(eq(queueOutbox.id, id)).for('update');
			if (current?.queue !== 'deliver' || current.state !== 'deadLetter' || current.revision !== revision) {
				return false;
			}
			const jobId = current.externalJobId ?? `outbox-${current.id}`;
			const job = await deps.deliverQueue.getJob(jobId);
			if (
				(await fetchDeliveryQueueCleanupByJobIdFromDatabase(tx, jobId)) != null ||
				(await job?.getState()) === 'completed'
			) {
				return false;
			}
			await job?.remove();
			return await retryDeadLetterOutboxInDatabase(tx, id, revision);
		});
	}
	if (outbox.queue === 'db') {
		await (await deps.dbQueue.getJob(outbox.externalJobId ?? `outbox-${outbox.id}`))?.remove();
	}
	return await retryDeadLetterOutboxInDatabase(deps.db, id, revision);
}

export async function abandonQueueOutboxDeadLetter(
	deps: AdminQueueDependencies,
	id: string,
	revision: number,
): Promise<boolean> {
	const outbox = await fetchQueueOutboxByIdFromDatabase(deps.db, id);
	if (outbox?.state !== 'deadLetter' || outbox.revision !== revision) {
		return false;
	}
	if (outbox.queue === 'deliver') {
		const removed = await deps.db.transaction(async (transaction) => {
			const tx = transaction as MiDrizzleDatabase;
			const [current] = await tx.select().from(queueOutbox).where(eq(queueOutbox.id, id)).for('update');
			if (current?.queue !== 'deliver' || current.state !== 'deadLetter' || current.revision !== revision) {
				return null;
			}
			const jobId = current.externalJobId ?? `outbox-${current.id}`;
			const job = await deps.deliverQueue.getJob(jobId);
			await enqueueDeliveryQueueCleanupInDatabase(tx, [jobId]);
			if (!(await abandonDeadLetterOutboxInDatabase(tx, id, revision))) {
				throw new Error('The locked delivery outbox item could not be abandoned.');
			}
			return { job };
		});
		if (removed == null) return false;
		await removed.job?.remove();
		return true;
	}
	if (outbox.queue === 'db') {
		await (await deps.dbQueue.getJob(outbox.externalJobId ?? `outbox-${outbox.id}`))?.remove();
	}
	return await abandonDeadLetterOutboxInDatabase(deps.db, id, revision);
}

function packQueueJob(job: Bull.Job): Packed<'QueueJob'> {
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

export async function fetchQueueJob(
	deps: AdminQueueDependencies,
	queueType: QueueType,
	jobId: string,
): Promise<Packed<'QueueJob'>> {
	const queue = getQueue(deps, queueType);
	const job = await queue.getJob(jobId);
	if (job != null) {
		return packQueueJob(job);
	}
	throw new Error(`Job not found: ${jobId}`);
}

export async function fetchQueueJobLogs(
	deps: AdminQueueDependencies,
	queueType: QueueType,
	jobId: string,
): Promise<string[]> {
	const queue = getQueue(deps, queueType);
	const result = await queue.getJobLogs(jobId);
	return result.logs;
}

export async function fetchQueueJobs(
	deps: AdminQueueDependencies,
	queueType: QueueType,
	jobTypes: JobType[],
	search?: string,
): Promise<Packed<'QueueJob'>[]> {
	const RETURN_LIMIT = 100;
	const queue = getQueue(deps, queueType);
	let jobs: Bull.Job[];

	if (search) {
		jobs = await queue.getJobs(jobTypes, 0, 1000);
		const terms = search.toLowerCase().split(' ');

		jobs = jobs.filter((job) => {
			const jobString = JSON.stringify(job).toLowerCase();
			return terms.every((term) => jobString.includes(term));
		});

		jobs = jobs.slice(0, RETURN_LIMIT);
	} else {
		jobs = await queue.getJobs(jobTypes, 0, RETURN_LIMIT);
	}

	return jobs.map(packQueueJob);
}

export async function fetchQueues(deps: AdminQueueDependencies) {
	const fetchings = QUEUE_TYPES.map(async (type) => {
		const queue = getQueue(deps, type);

		const counts = await fetchQueueJobCounts(queue);
		const isPaused = await queue.isPaused();
		const metricsCompleted = await queue.getMetrics('completed', 0, MetricsTime.ONE_WEEK);
		const metricsFailed = await queue.getMetrics('failed', 0, MetricsTime.ONE_WEEK);

		return {
			name: type,
			counts,
			isPaused,
			outbox: type === 'db' ? await fetchQueueOutboxStats(deps.db) : null,
			cleanup: type === 'deliver' ? await fetchDeliveryQueueCleanupStats(deps.db) : null,
			metrics: {
				completed: metricsCompleted,
				failed: metricsFailed,
			},
		};
	});

	return await Promise.all(fetchings);
}

export async function fetchQueueStats(deps: AdminQueueDependencies, queueType: QueueType) {
	const queue = getQueue(deps, queueType);
	const counts = await fetchQueueJobCounts(queue);
	const isPaused = await queue.isPaused();
	const metricsCompleted = await queue.getMetrics('completed', 0, MetricsTime.ONE_WEEK);
	const metricsFailed = await queue.getMetrics('failed', 0, MetricsTime.ONE_WEEK);
	const db = parseQueueDatabaseInfo(await (await queue.getBackend().client).info());

	return {
		name: queueType,
		qualifiedName: queue.qualifiedName,
		counts,
		isPaused,
		outbox: queueType === 'db' ? await fetchQueueOutboxStats(deps.db) : null,
		cleanup: queueType === 'deliver' ? await fetchDeliveryQueueCleanupStats(deps.db) : null,
		metrics: {
			completed: metricsCompleted,
			failed: metricsFailed,
		},
		db,
	};
}

export async function fetchLegacyQueueCounts(
	deps: Pick<AdminQueueDependencies, 'deliverQueue' | 'inboxQueue' | 'dbQueue' | 'objectStorageQueue'>,
) {
	const deliverJobCounts = await fetchQueueJobCounts(deps.deliverQueue);
	const inboxJobCounts = await fetchQueueJobCounts(deps.inboxQueue);
	const dbJobCounts = await fetchQueueJobCounts(deps.dbQueue);
	const objectStorageJobCounts = await fetchQueueJobCounts(deps.objectStorageQueue);

	return {
		deliver: deliverJobCounts,
		inbox: inboxJobCounts,
		db: dbJobCounts,
		objectStorage: objectStorageJobCounts,
	};
}

export async function fetchDelayedDeliverHosts(queue: DeliverQueue): Promise<[string, number][]> {
	const jobs = await queue.getJobs(['delayed']);
	const counts = new Map<string, number>();

	for (const job of jobs) {
		const host = new URL(job.data.to).host;
		counts.set(host, (counts.get(host) ?? 0) + 1);
	}

	return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export async function fetchDelayedInboxHosts(queue: InboxQueue): Promise<[string, number][]> {
	const jobs = await queue.getJobs(['delayed']);
	const counts = new Map<string, number>();

	for (const job of jobs) {
		const host = new URL(job.data.signature.keyId).host;
		counts.set(host, (counts.get(host) ?? 0) + 1);
	}

	return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
