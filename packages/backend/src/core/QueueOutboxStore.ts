/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { count, inArray, min, sql } from 'drizzle-orm';
import type * as Bull from 'bullmq';
import { addDbJobs, type DbJobBulkInput, type DbQueue } from '@/core/queues.js';
import { queueOutbox, type QueueOutboxRow } from '@/db/schema/queue-outbox.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { QUEUE } from '@/queue/const.js';
import type { DbJobMap } from '@/queue/types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const invalidKeepJobs = Symbol('invalidKeepJobs');
type KeepJobsOption = NonNullable<Bull.BulkJobOptions['removeOnComplete']>;

function parseKeepJobs(value: unknown): KeepJobsOption | undefined | typeof invalidKeepJobs {
	if (value === undefined || typeof value === 'boolean') return value;
	if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : invalidKeepJobs;
	if (!isRecord(value)) return invalidKeepJobs;

	const age = value.age;
	const count = value.count;
	const limit = value.limit;
	if (age === undefined) {
		return typeof count === 'number' && Number.isFinite(count) && count >= 0 ? { count } : invalidKeepJobs;
	}
	if (typeof age !== 'number' || !Number.isFinite(age) || age < 0) return invalidKeepJobs;
	if (count !== undefined && (typeof count !== 'number' || !Number.isFinite(count) || count < 0)) return invalidKeepJobs;
	if (limit !== undefined && (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0)) return invalidKeepJobs;
	return {
		age,
		...(count === undefined ? {} : { count }),
		...(limit === undefined ? {} : { limit }),
	};
}

function parseDbOutboxJob(row: QueueOutboxRow): DbJobBulkInput<'deleteAccount'> | null {
	if (row.name !== 'deleteAccount' || !isRecord(row.data) || !isRecord(row.opts)) return null;
	const user = row.data.user;
	if (!isRecord(user) || typeof user.id !== 'string') return null;
	if (row.data.soft !== undefined && typeof row.data.soft !== 'boolean') return null;
	const removeOnComplete = parseKeepJobs(row.opts.removeOnComplete);
	const removeOnFail = parseKeepJobs(row.opts.removeOnFail);
	if (removeOnComplete === invalidKeepJobs || removeOnFail === invalidKeepJobs) return null;

	return {
		name: 'deleteAccount',
		data: {
			user: { id: user.id },
			...(row.data.soft === undefined ? {} : { soft: row.data.soft }),
		},
		opts: {
			...(removeOnComplete === undefined ? {} : { removeOnComplete }),
			...(removeOnFail === undefined ? {} : { removeOnFail }),
			jobId: `outbox-${row.id}`,
		},
	};
}

export async function enqueueDbJobInOutbox(
	db: MiDrizzleDatabase,
	name: 'deleteAccount',
	data: DbJobMap['deleteAccount'],
	opts: Pick<Bull.BulkJobOptions, 'removeOnComplete' | 'removeOnFail'>,
): Promise<string> {
	const id = genId();
	await db.insert(queueOutbox).values({
		id,
		queue: QUEUE.DB,
		name,
		data,
		opts,
	});
	return id;
}

export async function dispatchQueueOutbox(db: MiDrizzleDatabase, dbQueue: DbQueue): Promise<number> {
	return await db.transaction(async tx => {
		const rows = await tx
			.select()
			.from(queueOutbox)
			.where(sql`${queueOutbox.queue} = ${QUEUE.DB}`)
			.orderBy(queueOutbox.createdAt)
			.limit(100)
			.for('update', { skipLocked: true });

		if (rows.length === 0) return 0;

		const jobs = rows.flatMap(row => {
			const job = parseDbOutboxJob(row);
			return job == null ? [] : [job];
		});
		if (jobs.length > 0) await addDbJobs(dbQueue, jobs);
		await tx.delete(queueOutbox).where(inArray(queueOutbox.id, rows.map(row => row.id)));
		return jobs.length;
	});
}

export async function getQueueOutboxStats(db: MiDrizzleDatabase): Promise<{ pending: number; oldestPendingAgeMs: number | null }> {
	const [stats] = await db.select({
		pending: count(),
		oldestCreatedAt: min(queueOutbox.createdAt),
	}).from(queueOutbox);
	if (stats == null) throw new Error('Queue outbox aggregate query returned no rows');

	return {
		pending: stats.pending,
		oldestPendingAgeMs: stats.oldestCreatedAt == null ? null : Math.max(0, Date.now() - stats.oldestCreatedAt.getTime()),
	};
}
