/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { SQL } from 'bun';
import * as Bull from 'bullmq';
import { eq, inArray, sql } from 'drizzle-orm';
import type * as Redis from 'ioredis';
import { loadConfig } from '@/config.js';
import { baseWorkerOptions, QUEUE } from '@/core/queue/const.js';
import {
	enqueueDeliveryQueueCleanupInDatabase,
	fetchDeliveryQueueCleanupByJobIdFromDatabase,
	fetchDeliveryQueueCleanupStats,
	runDeliveryQueueCleanup,
} from '@/core/queue/delivery-queue-cleanup-store.js';
import { fetchQueueOutboxStats } from '@/core/queue/queue-outbox-store.js';
import { createDeliverQueue } from '@/core/queue/queues.js';
import type { DeliverQueue } from '@/core/queue/queues.js';
import { createBunSqlClient, createBunSqlDatabase } from '@/db/bun-sql.js';
import { deliveryQueueCleanup } from '@/db/schema/delivery-queue-cleanup.js';
import { queueOutbox } from '@/db/schema/queue-outbox.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';

function barrier() {
	const { promise, resolve } = Promise.withResolvers<void>();
	return { promise, release: resolve };
}

const deliveryData = {
	user: { id: 'delivery-cleanup-test-user' },
	content: '{"type":"Delete"}',
	digest: 'SHA-256=test',
	to: 'https://delivery-cleanup.example.test/inbox',
	isSharedInbox: true,
};

describe('delivery queue cleanup', () => {
	const config = loadConfig();
	const schemaName = `delivery_cleanup_${process.pid}_${genId()}`;
	config.valkey.jobQueue = {
		...config.valkey.jobQueue,
		prefix: schemaName,
	};
	const clients: SQL[] = [];
	let db: MiDrizzleDatabase;
	let competingDb: MiDrizzleDatabase;
	let queue: DeliverQueue;
	const jobIds: string[] = [];
	const outboxIds: string[] = [];

	beforeAll(async () => {
		// 接続ごとの専用 search_path と Valkey prefix により、他ファイルの receipt を claim しない。
		// 各 pool は 1 接続で idle 切断を無効にし、競合する実行者には別の pool を使う。
		for (let i = 0; i < 2; i++) clients.push(createBunSqlClient(config, 1, { idleTimeoutSeconds: 0 }));
		db = createBunSqlDatabase(clients[0]!, config);
		competingDb = createBunSqlDatabase(clients[1]!, config);
		await db.execute(sql`CREATE SCHEMA ${sql.identifier(schemaName)}`);
		await db.execute(
			sql`CREATE TABLE ${sql.identifier(schemaName)}.delivery_queue_cleanup (LIKE delivery_queue_cleanup INCLUDING ALL)`,
		);
		await db.execute(sql`CREATE TABLE ${sql.identifier(schemaName)}.queue_outbox (LIKE queue_outbox INCLUDING ALL)`);
		for (const database of [db, competingDb]) {
			await database.execute(sql`SET search_path TO ${sql.identifier(schemaName)}`);
		}
		queue = createDeliverQueue(config);
		await queue.waitUntilReady();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		for (const jobId of jobIds) await queue.remove(jobId, { removeChildren: false });
		if (jobIds.length > 0) {
			await db.delete(deliveryQueueCleanup).where(inArray(deliveryQueueCleanup.jobId, jobIds));
		}
		if (outboxIds.length > 0) await db.delete(queueOutbox).where(inArray(queueOutbox.id, outboxIds));
		jobIds.length = 0;
		outboxIds.length = 0;
	});

	afterAll(async () => {
		try {
			if (queue != null) {
				try {
					await queue.obliterate({ force: true });
				} finally {
					await queue.close();
				}
			}
		} finally {
			try {
				if (db != null) await db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(schemaName)} CASCADE`);
			} finally {
				await Promise.all(clients.map((client) => client.close()));
			}
		}
	});

	function ownJobId() {
		const jobId = `cleanup-${genId()}`;
		jobIds.push(jobId);
		return jobId;
	}

	async function createTerminalJob(failed = false) {
		const jobId = ownJobId();
		await queue.add('cleanup.example.test', deliveryData, {
			jobId,
			attempts: 1,
			removeOnComplete: false,
			removeOnFail: false,
		});
		const worker = new Bull.Worker(
			QUEUE.DELIVER,
			async () => {
				if (failed) throw new Error('expected delivery failure');
				return 'delivered';
			},
			baseWorkerOptions(config, QUEUE.DELIVER),
		);
		try {
			await vi.waitFor(async () => expect(await queue.getJobState(jobId)).toBe(failed ? 'failed' : 'completed'));
		} finally {
			await worker.close();
		}
		return jobId;
	}

	async function makeDue(jobId: string) {
		await db
			.update(deliveryQueueCleanup)
			.set({ availableAt: sql`CURRENT_TIMESTAMP`, leaseExpiresAt: new Date(0) })
			.where(eq(deliveryQueueCleanup.jobId, jobId));
	}

	test('insertion uses the caller transaction and duplicate acknowledgements retain retry state', async () => {
		const jobId = ownJobId();
		await expect(
			db.transaction(async (transaction) => {
				await enqueueDeliveryQueueCleanupInDatabase(transaction as MiDrizzleDatabase, [jobId]);
				throw new Error('expected acknowledgement rollback');
			}),
		).rejects.toThrow('expected acknowledgement rollback');
		expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(db, jobId)).toBeNull();
		await enqueueDeliveryQueueCleanupInDatabase(db, [jobId, jobId]);
		await db
			.update(deliveryQueueCleanup)
			.set({ attempts: 3, lastError: 'retain retry history' })
			.where(eq(deliveryQueueCleanup.jobId, jobId));
		await enqueueDeliveryQueueCleanupInDatabase(db, [jobId]);
		expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(db, jobId)).toMatchObject({
			attempts: 3,
			lastError: 'retain retry history',
		});
	});

	test('a removal failure retains durable backoff, does not stop other jobs, and succeeds on retry', async () => {
		const failingJobId = await createTerminalJob();
		const successfulJobId = await createTerminalJob();
		await enqueueDeliveryQueueCleanupInDatabase(db, [failingJobId, successfulJobId]);
		const remove = queue.remove.bind(queue);
		const failure = new Error('Valkey removal unavailable');
		vi.spyOn(queue, 'remove').mockImplementation(async (jobId, options) => {
			if (jobId === failingJobId) throw failure;
			return await remove(jobId, options);
		});

		await expect(runDeliveryQueueCleanup(db, queue)).rejects.toBeInstanceOf(AggregateError);
		const failedReceipt = await fetchDeliveryQueueCleanupByJobIdFromDatabase(db, failingJobId);
		expect(failedReceipt).toMatchObject({
			attempts: 1,
			lastError: failure.message,
			leaseToken: null,
			leaseExpiresAt: null,
		});
		expect(failedReceipt!.availableAt.getTime()).toBeGreaterThan(failedReceipt!.createdAt.getTime());
		expect(await queue.getJobState(failingJobId)).toBe('completed');
		expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(db, successfulJobId)).toBeNull();
		expect(await queue.getJob(successfulJobId)).toBeUndefined();
		expect(await runDeliveryQueueCleanup(db, queue)).toBe(0);

		vi.restoreAllMocks();
		await makeDue(failingJobId);
		expect(await runDeliveryQueueCleanup(db, queue)).toBe(1);
		expect(await queue.getJob(failingJobId)).toBeUndefined();
		expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(db, failingJobId)).toBeNull();
	});

	test('a locked completed job returning zero from BullMQ removal is retried durably', async () => {
		const jobId = await createTerminalJob();
		await enqueueDeliveryQueueCleanupInDatabase(db, [jobId]);
		const client = (await queue.getBackend().client) as unknown as Redis.Redis;
		const lockKey = queue.toKey(`${jobId}:lock`);
		await client.set(lockKey, 'cleanup-test-lock', 'PX', 30_000);
		try {
			await expect(runDeliveryQueueCleanup(db, queue)).rejects.toBeInstanceOf(AggregateError);
			expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(db, jobId)).toMatchObject({ attempts: 1 });
			expect(await queue.getJobState(jobId)).toBe('completed');
		} finally {
			await client.del(lockKey);
		}
		await makeDue(jobId);
		expect(await runDeliveryQueueCleanup(db, queue)).toBe(1);
	});

	test('SQL rollback after successful queue removal retains the receipt and recovers from a missing job', async () => {
		const jobId = await createTerminalJob();
		await enqueueDeliveryQueueCleanupInDatabase(db, [jobId]);
		const transaction = db.transaction.bind(db);
		vi.spyOn(db, 'transaction').mockImplementationOnce(async (task) => {
			return await transaction(async (tx) => {
				const result = await task(tx);
				await tx.execute(sql`SELECT 1 / 0`);
				return result;
			});
		});

		await expect(runDeliveryQueueCleanup(db, queue)).rejects.toBeInstanceOf(AggregateError);
		expect(await queue.getJob(jobId)).toBeUndefined();
		const retained = await fetchDeliveryQueueCleanupByJobIdFromDatabase(db, jobId);
		expect(retained).toMatchObject({ attempts: 0, lastError: null });
		expect(retained!.leaseToken).not.toBeNull();
		expect(await runDeliveryQueueCleanup(competingDb, queue)).toBe(0);
		await makeDue(jobId);
		expect(await runDeliveryQueueCleanup(competingDb, queue)).toBe(1);
		expect(await queue.getJobState(jobId)).toBe('unknown');
		expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(db, jobId)).toBeNull();
	});

	test('future leases are not stolen and expired leases are reclaimed using the DB clock', async () => {
		const jobId = ownJobId();
		await enqueueDeliveryQueueCleanupInDatabase(db, [jobId]);
		await db
			.update(deliveryQueueCleanup)
			.set({ leaseToken: 'previous-owner', leaseExpiresAt: sql`CURRENT_TIMESTAMP + interval '1 minute'` })
			.where(eq(deliveryQueueCleanup.jobId, jobId));
		expect(await runDeliveryQueueCleanup(competingDb, queue)).toBe(0);
		expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(db, jobId)).toMatchObject({
			leaseToken: 'previous-owner',
		});
		await makeDue(jobId);
		expect(await runDeliveryQueueCleanup(competingDb, queue)).toBe(1);
	});

	test('SKIP LOCKED excludes an expired receipt held by a SQL transaction', async () => {
		const jobId = ownJobId();
		await enqueueDeliveryQueueCleanupInDatabase(db, [jobId]);
		await db
			.update(deliveryQueueCleanup)
			.set({ leaseToken: 'expired-owner', leaseExpiresAt: new Date(0) })
			.where(eq(deliveryQueueCleanup.jobId, jobId));
		const locked = barrier();
		const release = barrier();
		const holding = competingDb.transaction(async (tx) => {
			await tx.select().from(deliveryQueueCleanup).where(eq(deliveryQueueCleanup.jobId, jobId)).for('update');
			locked.release();
			await release.promise;
		});
		try {
			await locked.promise;
			expect(await runDeliveryQueueCleanup(db, queue)).toBe(0);
			expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(db, jobId)).toMatchObject({
				leaseToken: 'expired-owner',
			});
		} finally {
			release.release();
			await holding;
		}
		expect(await runDeliveryQueueCleanup(db, queue)).toBe(1);
	});

	test('an old claimant cannot remove a job or overwrite a replacement claimant retry', async () => {
		const jobId = await createTerminalJob();
		await enqueueDeliveryQueueCleanupInDatabase(db, [jobId]);
		const claimed = barrier();
		const resume = barrier();
		const transaction = db.transaction.bind(db);
		vi.spyOn(db, 'transaction').mockImplementationOnce(async (task) => {
			claimed.release();
			await resume.promise;
			return await transaction(task);
		});
		const oldRun = runDeliveryQueueCleanup(db, queue);
		try {
			await claimed.promise;
			await makeDue(jobId);
			vi.spyOn(queue, 'getJobState').mockRejectedValueOnce(new Error('replacement queue failure'));
			await expect(runDeliveryQueueCleanup(competingDb, queue)).rejects.toBeInstanceOf(AggregateError);
			resume.release();
			expect(await oldRun).toBe(0);
			expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(db, jobId)).toMatchObject({
				attempts: 1,
				lastError: 'replacement queue failure',
				leaseToken: null,
			});
			expect(await queue.getJobState(jobId)).toBe('completed');
		} finally {
			resume.release();
			await oldRun;
		}
	});

	test('concurrent cleanup claims leave an in-progress receipt to its owner', async () => {
		const jobId = await createTerminalJob();
		await enqueueDeliveryQueueCleanupInDatabase(db, [jobId]);
		const removing = barrier();
		const release = barrier();
		const remove = queue.remove.bind(queue);
		vi.spyOn(queue, 'remove').mockImplementation(async (id, options) => {
			removing.release();
			await release.promise;
			return await remove(id, options);
		});
		const first = runDeliveryQueueCleanup(db, queue);
		try {
			await removing.promise;
			expect(await runDeliveryQueueCleanup(competingDb, queue)).toBe(0);
			expect(await queue.getJobState(jobId)).toBe('completed');
			expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(competingDb, jobId)).toMatchObject({
				attempts: 0,
				lastError: null,
			});
		} finally {
			release.release();
			await expect(first).resolves.toBe(1);
		}
		expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(db, jobId)).toBeNull();
	});

	test('waiting jobs are retained for retry instead of being removed', async () => {
		const jobId = ownJobId();
		await queue.add('cleanup.example.test', deliveryData, { jobId, removeOnComplete: false, removeOnFail: false });
		await enqueueDeliveryQueueCleanupInDatabase(db, [jobId]);
		const state = await queue.getJobState(jobId);
		expect(['waiting', 'prioritized']).toContain(state);
		await expect(runDeliveryQueueCleanup(db, queue)).rejects.toBeInstanceOf(AggregateError);
		expect(await queue.getJobState(jobId)).toBe(state);
		expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(db, jobId)).toMatchObject({
			attempts: 1,
			leaseToken: null,
		});
	});

	test('active jobs are retained until the consumer reaches a terminal state', async () => {
		const jobId = ownJobId();
		await queue.add('cleanup.example.test', deliveryData, { jobId, removeOnComplete: false, removeOnFail: false });
		await enqueueDeliveryQueueCleanupInDatabase(db, [jobId]);
		const started = barrier();
		const finish = barrier();
		const worker = new Bull.Worker(
			QUEUE.DELIVER,
			async () => {
				started.release();
				await finish.promise;
				return 'delivered';
			},
			baseWorkerOptions(config, QUEUE.DELIVER),
		);
		try {
			await started.promise;
			await expect(runDeliveryQueueCleanup(db, queue)).rejects.toBeInstanceOf(AggregateError);
			expect(await queue.getJobState(jobId)).toBe('active');
			expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(db, jobId)).toMatchObject({ attempts: 1 });
		} finally {
			finish.release();
			await worker.close();
		}
		await makeDue(jobId);
		expect(await runDeliveryQueueCleanup(db, queue)).toBe(1);
	});

	test('unknown state is not confused with an absent job when its hash still exists', async () => {
		const jobId = ownJobId();
		await queue.add('cleanup.example.test', deliveryData, { jobId });
		const client = (await queue.getBackend().client) as unknown as Redis.Redis;
		await client.zrem(queue.toKey('prioritized'), jobId);
		await client.lrem(queue.toKey('wait'), 0, jobId);
		expect(await queue.getJobState(jobId)).toBe('unknown');
		await enqueueDeliveryQueueCleanupInDatabase(db, [jobId]);
		await expect(runDeliveryQueueCleanup(db, queue)).rejects.toBeInstanceOf(AggregateError);
		expect(await client.exists(queue.toKey(jobId))).toBe(1);
		expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(db, jobId)).toMatchObject({ attempts: 1 });
	});

	test('terminal failed jobs are removable and each claim is bounded to 500 receipts', async () => {
		const failedJobId = await createTerminalJob(true);
		await enqueueDeliveryQueueCleanupInDatabase(db, [failedJobId]);
		expect(await runDeliveryQueueCleanup(db, queue)).toBe(1);
		expect(await queue.getJob(failedJobId)).toBeUndefined();
		const batch = Array.from({ length: 501 }, ownJobId);
		await enqueueDeliveryQueueCleanupInDatabase(db, batch);
		expect(await runDeliveryQueueCleanup(db, queue)).toBe(500);
		expect((await fetchDeliveryQueueCleanupStats(db)).pending).toBe(1);
		expect(await runDeliveryQueueCleanup(db, queue)).toBe(1);
	});

	test('cleanup statistics count only receipts and stay independent of pending deliveries', async () => {
		expect(await fetchDeliveryQueueCleanupStats(db)).toEqual({ pending: 0, retrying: 0, oldestPendingAgeMs: null });
		const pendingId = genId();
		const publishedId = genId();
		outboxIds.push(pendingId, publishedId);
		await db.insert(queueOutbox).values([
			{ id: pendingId, queue: 'deliver', name: 'deliver', state: 'ready', data: {}, opts: {}, createdAt: new Date(0) },
			{
				id: publishedId,
				queue: 'deliver',
				name: 'deliver',
				state: 'published',
				data: {},
				opts: {},
				createdAt: new Date(0),
			},
		]);
		expect(await fetchDeliveryQueueCleanupStats(db)).toEqual({ pending: 0, retrying: 0, oldestPendingAgeMs: null });
		const pendingCleanupId = ownJobId();
		const retryingCleanupId = ownJobId();
		await enqueueDeliveryQueueCleanupInDatabase(db, [pendingCleanupId, retryingCleanupId]);
		await db
			.update(deliveryQueueCleanup)
			.set({ attempts: 2, lastError: 'retry expected', createdAt: sql`CURRENT_TIMESTAMP - interval '20 seconds'` })
			.where(eq(deliveryQueueCleanup.jobId, retryingCleanupId));
		const cleanup = await fetchDeliveryQueueCleanupStats(db);
		expect(cleanup).toMatchObject({ pending: 2, retrying: 1 });
		expect(cleanup.oldestPendingAgeMs).toBeGreaterThanOrEqual(20_000);
		expect(cleanup.oldestPendingAgeMs).toBeLessThan(30_000);
		expect(await fetchQueueOutboxStats(db)).toMatchObject({ pending: 2, deadLetter: 0 });
		expect(await runDeliveryQueueCleanup(db, queue)).toBe(2);
		expect(await fetchDeliveryQueueCleanupStats(db)).toEqual({ pending: 0, retrying: 0, oldestPendingAgeMs: null });
		expect(await fetchQueueOutboxStats(db)).toMatchObject({ pending: 2, deadLetter: 0 });
	});
});
