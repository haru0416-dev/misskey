/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { count, eq, inArray, min, sql } from 'drizzle-orm';
import type * as Bull from 'bullmq';
import { addDbJobs, addDeliverJobs, type DbJobBulkInput, type DbQueue, type DeliverJobBulkInput, type DeliverJobInput, type DeliverQueue } from '@/core/queues.js';
import { queueOutbox, type QueueOutboxRow } from '@/db/schema/queue-outbox.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { QUEUE } from '@/queue/const.js';
import type { DbJobMap } from '@/queue/types.js';

const DELIVER_PENDING_OUTBOX_QUEUE = 'deliverPending';
const ACCOUNT_DELETE_OUTBOX_QUEUE = 'accountDelete';
const INVALID_OUTBOX_QUEUE = 'invalid';
const ISO_TIMESTAMP_PATTERN = '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$';
const isoTimestampRegex = new RegExp(ISO_TIMESTAMP_PATTERN);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type SerializedKeepJobs = Record<string, unknown> & {
	age?: unknown;
	count?: unknown;
	limit?: unknown;
};

type SerializedDeleteAccountData = Record<string, unknown> & {
	user?: unknown;
	soft?: unknown;
	accountDeleteCoordinatorId?: unknown;
};

type SerializedDeleteAccountUser = Record<string, unknown> & {
	id?: unknown;
};

type SerializedJobOptions = Record<string, unknown> & {
	attempts?: unknown;
	backoff?: unknown;
	nextCheckAt?: unknown;
	removeOnComplete?: unknown;
	removeOnFail?: unknown;
};

type SerializedDeliverData = Record<string, unknown> & {
	user?: unknown;
	content?: unknown;
	digest?: unknown;
	to?: unknown;
	isSharedInbox?: unknown;
};

type SerializedDeliverUser = Record<string, unknown> & {
	id?: unknown;
};

type SerializedDeliverEnvelope = Record<string, unknown> & {
	name?: unknown;
	data?: unknown;
	coordinatorId?: unknown;
};

function isSerializedKeepJobs(value: unknown): value is SerializedKeepJobs {
	return isRecord(value);
}

function isSerializedDeleteAccountData(value: unknown): value is SerializedDeleteAccountData {
	return isRecord(value);
}

function isSerializedDeleteAccountUser(value: unknown): value is SerializedDeleteAccountUser {
	return isRecord(value);
}

function isSerializedJobOptions(value: unknown): value is SerializedJobOptions {
	return isRecord(value);
}

function isSerializedDeliverData(value: unknown): value is SerializedDeliverData {
	return isRecord(value);
}

function isSerializedDeliverUser(value: unknown): value is SerializedDeliverUser {
	return isRecord(value);
}

function isSerializedDeliverEnvelope(value: unknown): value is SerializedDeliverEnvelope {
	return isRecord(value);
}

const invalidKeepJobs = Symbol('invalidKeepJobs');
type KeepJobsOption = NonNullable<Bull.BulkJobOptions['removeOnComplete']>;

function parseKeepJobs(value: unknown): KeepJobsOption | undefined | typeof invalidKeepJobs {
	if (value === undefined || typeof value === 'boolean') return value;
	if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : invalidKeepJobs;
	if (!isSerializedKeepJobs(value)) return invalidKeepJobs;

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
	if (row.name !== 'deleteAccount' || !isSerializedDeleteAccountData(row.data) || !isSerializedJobOptions(row.opts)) return null;
	const user = row.data.user;
	if (!isSerializedDeleteAccountUser(user) || typeof user.id !== 'string') return null;
	if (row.data.soft !== undefined && typeof row.data.soft !== 'boolean') return null;
	if (row.data.accountDeleteCoordinatorId !== undefined && typeof row.data.accountDeleteCoordinatorId !== 'string') return null;
	const removeOnComplete = parseKeepJobs(row.opts.removeOnComplete);
	const removeOnFail = parseKeepJobs(row.opts.removeOnFail);
	if (removeOnComplete === invalidKeepJobs || removeOnFail === invalidKeepJobs) return null;

	return {
		name: 'deleteAccount',
		data: {
			user: { id: user.id },
			...(row.data.soft === undefined ? {} : { soft: row.data.soft }),
			...(row.data.accountDeleteCoordinatorId === undefined ? {} : { accountDeleteCoordinatorId: row.data.accountDeleteCoordinatorId }),
		},
		opts: {
			...(removeOnComplete === undefined ? {} : { removeOnComplete }),
			...(removeOnFail === undefined ? {} : { removeOnFail }),
			jobId: `outbox-${row.id}`,
		},
	};
}

function parseDeliverOutboxJob(row: QueueOutboxRow): DeliverJobBulkInput | null {
	if (row.name !== 'deliver' || !isSerializedDeliverEnvelope(row.data) || !isSerializedJobOptions(row.opts)) return null;
	if (typeof row.data.name !== 'string' || !isSerializedDeliverData(row.data.data)) return null;
	const data = row.data.data;
	if (!isSerializedDeliverUser(data.user) || typeof data.user.id !== 'string') return null;
	if (typeof data.content !== 'string' || typeof data.digest !== 'string' || typeof data.to !== 'string' || typeof data.isSharedInbox !== 'boolean') return null;
	const attempts = row.opts.attempts;
	if (attempts !== undefined && (typeof attempts !== 'number' || !Number.isInteger(attempts) || attempts < 0)) return null;
	if (row.opts.nextCheckAt !== undefined && (typeof row.opts.nextCheckAt !== 'string' || !isoTimestampRegex.test(row.opts.nextCheckAt))) return null;
	if (!isRecord(row.opts.backoff) || row.opts.backoff['type'] !== 'custom') return null;

	return {
		name: row.data.name,
		data: {
			user: { id: data.user.id },
			content: data.content,
			digest: data.digest,
			to: data.to,
			isSharedInbox: data.isSharedInbox,
		},
		opts: {
			...(attempts === undefined ? {} : { attempts }),
			backoff: { type: 'custom' },
			removeOnComplete: false,
			removeOnFail: false,
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

export async function enqueueDeliverJobInOutbox(db: MiDrizzleDatabase, job: DeliverJobInput, coordinatorId?: string): Promise<string> {
	const id = genId();
	await db.insert(queueOutbox).values({
		id,
		queue: QUEUE.DELIVER,
		name: 'deliver',
		data: {
			name: job.name,
			data: job.data,
			...(coordinatorId === undefined ? {} : { coordinatorId }),
		},
		opts: job.opts ?? {},
	});
	return id;
}

export async function enqueueDeliverJobsInOutbox(db: MiDrizzleDatabase, jobs: DeliverJobInput[], coordinatorId: string): Promise<string[]> {
	const rows = jobs.map(job => ({
		id: genId(),
		queue: QUEUE.DELIVER,
		name: 'deliver',
		data: { name: job.name, data: job.data, coordinatorId },
		opts: job.opts ?? {},
	}));
	for (let index = 0; index < rows.length; index += 250) {
		await db.insert(queueOutbox).values(rows.slice(index, index + 250));
	}
	return rows.map(row => row.id);
}

export async function enqueueAccountDeleteCoordinatorInOutbox(
	db: MiDrizzleDatabase,
	data: DbJobMap['deleteAccount'],
	opts: Pick<Bull.BulkJobOptions, 'removeOnComplete' | 'removeOnFail'>,
): Promise<string> {
	const id = genId();
	await db.insert(queueOutbox).values({
		id,
		queue: ACCOUNT_DELETE_OUTBOX_QUEUE,
		name: 'deleteAccount',
		data: { ...data, accountDeleteCoordinatorId: id },
		opts,
	});
	return id;
}

export async function ensureAccountDeleteCoordinatorInOutbox(
	db: MiDrizzleDatabase,
	id: string,
	data: DbJobMap['deleteAccount'],
	opts: Pick<Bull.BulkJobOptions, 'removeOnComplete' | 'removeOnFail'>,
): Promise<boolean> {
	const inserted = await db.insert(queueOutbox).values({
		id,
		queue: ACCOUNT_DELETE_OUTBOX_QUEUE,
		name: 'deleteAccount',
		data: { ...data, accountDeleteCoordinatorId: id },
		opts,
	}).onConflictDoNothing().returning({ id: queueOutbox.id });
	return inserted.length > 0;
}

async function dispatchReadyDeliveries(db: MiDrizzleDatabase, deliverQueue: DeliverQueue): Promise<number> {
	return await db.transaction(async tx => {
		const rows = await tx
			.select()
			.from(queueOutbox)
			.where(eq(queueOutbox.queue, QUEUE.DELIVER))
			.orderBy(queueOutbox.createdAt)
			.limit(50)
			.for('update', { skipLocked: true });
		if (rows.length === 0) return 0;

		const validRows = rows.flatMap(row => {
			const job = parseDeliverOutboxJob(row);
			return job == null ? [] : [{ row, job }];
		});
		const validIds = new Set(validRows.map(({ row }) => row.id));
		const invalidIds = rows.filter(row => !validIds.has(row.id)).map(row => row.id);
		if (validRows.length > 0) {
			await addDeliverJobs(deliverQueue, validRows.map(({ job }) => job));
			await tx.update(queueOutbox)
				.set({ queue: DELIVER_PENDING_OUTBOX_QUEUE })
				.where(inArray(queueOutbox.id, [...validIds]));
		}
		if (invalidIds.length > 0) {
			await tx.update(queueOutbox)
				.set({ queue: INVALID_OUTBOX_QUEUE })
				.where(inArray(queueOutbox.id, invalidIds));
		}
		return validRows.length;
	});
}

async function reconcilePendingDeliveries(db: MiDrizzleDatabase, deliverQueue: DeliverQueue): Promise<number> {
	return await db.transaction(async tx => {
		const rows = await tx
			.select()
			.from(queueOutbox)
			.where(sql`${queueOutbox.queue} = ${DELIVER_PENDING_OUTBOX_QUEUE} AND (
				${queueOutbox.opts} -> 'nextCheckAt' IS NULL
				OR jsonb_typeof(${queueOutbox.opts} -> 'nextCheckAt') <> 'string'
				OR ${queueOutbox.opts} ->> 'nextCheckAt' !~ ${ISO_TIMESTAMP_PATTERN}
				OR ${queueOutbox.opts} ->> 'nextCheckAt' <= ${new Date().toISOString()}
			)`)
			.orderBy(sql`CASE WHEN jsonb_typeof(${queueOutbox.opts} -> 'nextCheckAt') = 'string'
				AND ${queueOutbox.opts} ->> 'nextCheckAt' ~ ${ISO_TIMESTAMP_PATTERN}
				THEN ${queueOutbox.opts} ->> 'nextCheckAt' ELSE '' END`, queueOutbox.createdAt)
			.limit(100)
			.for('update', { skipLocked: true });
		const parsedRows = rows.map(row => ({ row, jobInput: parseDeliverOutboxJob(row) }));
		const invalidIds = parsedRows.flatMap(({ row, jobInput }) => jobInput == null ? [row.id] : []);
		const validRows = parsedRows.flatMap(({ row, jobInput }) => jobInput == null ? [] : [{ row, jobInput }]);
		const states = await Promise.all(validRows.map(async ({ row }) => await deliverQueue.getJobState(`outbox-${row.id}`)));
		const unknownRows = validRows.filter((_, index) => states[index] === 'unknown');
		const terminalRows = validRows.filter((_, index) => states[index] === 'completed' || states[index] === 'failed');
		const waitingIds = validRows.flatMap(({ row }, index) => states[index] === 'completed' || states[index] === 'failed' ? [] : [row.id]);

		if (unknownRows.length > 0) {
			await addDeliverJobs(deliverQueue, unknownRows.map(({ jobInput }) => jobInput));
		}
		const terminalJobs = await Promise.all(terminalRows.map(async ({ row }) => ({
			row,
			job: await deliverQueue.getJob(`outbox-${row.id}`),
		})));
		const removableJobs = terminalJobs.filter((entry): entry is typeof entry & { job: NonNullable<typeof entry.job> } => entry.job != null);
		await Promise.all(removableJobs.map(async ({ job }) => await job.remove()));

		if (invalidIds.length > 0) {
			await tx.update(queueOutbox).set({ queue: INVALID_OUTBOX_QUEUE }).where(inArray(queueOutbox.id, invalidIds));
		}
		if (waitingIds.length > 0) {
			const nextCheckAt = new Date(Date.now() + 1000).toISOString();
			await tx.update(queueOutbox).set({
				opts: sql`jsonb_set(${queueOutbox.opts}, '{nextCheckAt}', to_jsonb(${nextCheckAt}::text), true)`,
			}).where(inArray(queueOutbox.id, waitingIds));
		}
		const removableIds = removableJobs.map(({ row }) => row.id);
		if (removableIds.length > 0) {
			await tx.delete(queueOutbox).where(inArray(queueOutbox.id, removableIds));
		}
		return unknownRows.length;
	});
}

async function dispatchReadyAccountDeletes(db: MiDrizzleDatabase, dbQueue: DbQueue): Promise<number> {
	return await db.transaction(async tx => {
		const rows = await tx
			.select()
			.from(queueOutbox)
			// ceiling: coordinated deletion is rare; add an indexed coordinator column if
			// queue_outbox growth makes this JSONB anti-join measurable.
			.where(sql`${queueOutbox.queue} = ${ACCOUNT_DELETE_OUTBOX_QUEUE} AND NOT EXISTS (
				SELECT 1 FROM "queue_outbox" AS child
				WHERE child."data" ->> 'coordinatorId' = ${queueOutbox.id}
			)`)
			.orderBy(queueOutbox.createdAt)
			.limit(25)
			.for('update', { skipLocked: true });
		if (rows.length === 0) return 0;

		const validRows = rows.flatMap(row => {
			const job = parseDbOutboxJob(row);
			return job != null && job.data.accountDeleteCoordinatorId === row.id ? [{ row, job }] : [];
		});
		const validIds = validRows.map(({ row }) => row.id);
		const validIdSet = new Set(validIds);
		const invalidIds = rows.filter(row => !validIdSet.has(row.id)).map(row => row.id);
		if (validIds.length > 0) {
			await addDbJobs(dbQueue, validRows.map(({ job }) => job));
			await tx.delete(queueOutbox).where(inArray(queueOutbox.id, validIds));
		}
		if (invalidIds.length > 0) {
			await tx.update(queueOutbox).set({ queue: INVALID_OUTBOX_QUEUE }).where(inArray(queueOutbox.id, invalidIds));
		}
		return validRows.length;
	});
}

async function dispatchDbJobs(db: MiDrizzleDatabase, dbQueue: DbQueue): Promise<number> {
	return await db.transaction(async tx => {
		const rows = await tx
			.select()
			.from(queueOutbox)
			.where(eq(queueOutbox.queue, QUEUE.DB))
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

export async function dispatchQueueOutbox(db: MiDrizzleDatabase, dbQueue: DbQueue, deliverQueue: DeliverQueue): Promise<number> {
	// RedisとDBはatomicに更新できない。outbox deliveryはBullMQ側で自動削除せず、
	// terminal stateを確認してBullMQ job、DB rowの順に消すことでクラッシュ時は再配送側へ倒す。
	const reconciledDeliveries = await reconcilePendingDeliveries(db, deliverQueue);
	const readyDeliveries = await dispatchReadyDeliveries(db, deliverQueue);
	const accountDeletes = await dispatchReadyAccountDeletes(db, dbQueue);
	const dbJobs = await dispatchDbJobs(db, dbQueue);
	return readyDeliveries + reconciledDeliveries + accountDeletes + dbJobs;
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
