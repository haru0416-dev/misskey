/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import * as Bull from 'bullmq';
import { eq, inArray } from 'drizzle-orm';
import { loadConfig } from '@/config.js';
import { retryQueueJob } from '@/core/QueueAdminLogic.js';
import { dispatchQueueOutbox, enqueueAccountDeleteCoordinatorInOutbox, enqueueDbJobInOutbox, enqueueDeliverJobInOutbox, enqueueDeliverJobsInOutbox, getQueueOutboxStats } from '@/core/QueueOutboxStore.js';
import { queueOutbox } from '@/db/schema/queue-outbox.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { genId } from '@/misc/id/gen-id.js';
import { baseWorkerOptions, QUEUE } from '@/queue/const.js';

describe('queue outbox', () => {
	let runtime: RuntimeDependencies;

	beforeAll(async () => {
		const config = loadConfig();
		config.valkey.jobQueue = {
			...config.valkey.jobQueue,
			prefix: `queue-outbox-test-${process.pid}`,
		};
		runtime = await createRuntimeDependencies(config);
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('committed outbox row is dispatched once with a deterministic job id', async () => {
		const outboxId = await enqueueDbJobInOutbox(runtime.db, 'deleteAccount', {
			user: { id: 'queue-outbox-test-user' },
			soft: true,
		}, {
			removeOnComplete: true,
		});

		expect(await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, outboxId))).toHaveLength(1);
		expect((await getQueueOutboxStats(runtime.db)).pending).toBeGreaterThanOrEqual(1);
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(1);
		expect(await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, outboxId))).toHaveLength(0);

		const job = await runtime.dbQueue.getJob(`outbox-${outboxId}`);
		expect(job?.name).toBe('deleteAccount');
		expect(job?.data).toEqual({ user: { id: 'queue-outbox-test-user' }, soft: true });
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(0);
		expect(await getQueueOutboxStats(runtime.db)).toEqual({ pending: 0, oldestPendingAgeMs: null });
		await job?.remove();
	});

	test('committed delivery outbox row is dispatched with a deterministic job id', async () => {
		const outboxId = await enqueueDeliverJobInOutbox(runtime.db, {
			name: 'remote.example.test',
			data: {
				user: { id: 'queue-outbox-deliver-user' },
				content: '{"type":"Delete"}',
				digest: 'SHA-256=test',
				to: 'https://remote.example.test/inbox',
				isSharedInbox: true,
			},
			opts: {
				attempts: 12,
				backoff: { type: 'custom' },
				removeOnComplete: true,
			},
		});

		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(1);
		const job = await runtime.deliverQueue.getJob(`outbox-${outboxId}`);
		expect(job?.name).toBe('remote.example.test');
		expect(job?.data).toMatchObject({
			user: { id: 'queue-outbox-deliver-user' },
			to: 'https://remote.example.test/inbox',
			isSharedInbox: true,
		});
		expect(job?.opts.removeOnComplete).toBe(false);
		expect(job?.opts.removeOnFail).toBe(false);
		expect(await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, outboxId))).toHaveLength(1);
		await job?.remove();
		await runtime.db.delete(queueOutbox).where(eq(queueOutbox.id, outboxId));
	});

	test('waits for account deletion deliveries to settle before dispatching the database job', async () => {
		const dbOutboxId = await enqueueAccountDeleteCoordinatorInOutbox(runtime.db, {
			user: { id: 'queue-outbox-ordered-delete-user' },
			soft: false,
		}, { removeOnComplete: true });
		const deliverOutboxId = await enqueueDeliverJobInOutbox(runtime.db, {
			name: 'remote.example.test',
			data: {
				user: { id: 'queue-outbox-ordered-delete-user' },
				content: '{"type":"Delete"}',
				digest: 'SHA-256=test',
				to: 'https://remote.example.test/inbox',
				isSharedInbox: true,
			},
			opts: {
				attempts: 12,
				backoff: { type: 'custom' },
				removeOnComplete: true,
			},
		}, dbOutboxId);

		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(1);
		expect(await runtime.dbQueue.getJob(`outbox-${dbOutboxId}`)).toBeUndefined();
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(0);
		expect(await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, dbOutboxId))).toHaveLength(1);

		let deliverJob = await runtime.deliverQueue.getJob(`outbox-${deliverOutboxId}`);
		await deliverJob?.remove();
		await new Promise(resolve => setTimeout(resolve, 1100));
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(1);
		expect(await runtime.dbQueue.getJob(`outbox-${dbOutboxId}`)).toBeUndefined();
		deliverJob = await runtime.deliverQueue.getJob(`outbox-${deliverOutboxId}`);
		expect(deliverJob).toBeDefined();

		const worker = new Bull.Worker(QUEUE.DELIVER, async () => 'delivered', {
			...baseWorkerOptions(runtime.config, QUEUE.DELIVER),
		});
		try {
			await vi.waitFor(async () => {
				expect(await runtime.deliverQueue.getJobState(`outbox-${deliverOutboxId}`)).toBe('completed');
			});
		} finally {
			await worker.close();
		}

		await new Promise(resolve => setTimeout(resolve, 1100));
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(1);
		const dbJob = await runtime.dbQueue.getJob(`outbox-${dbOutboxId}`);
		expect(dbJob?.data).toEqual({
			user: { id: 'queue-outbox-ordered-delete-user' },
			soft: false,
			accountDeleteCoordinatorId: dbOutboxId,
		});
		expect(await runtime.db.select().from(queueOutbox).where(inArray(queueOutbox.id, [deliverOutboxId, dbOutboxId]))).toHaveLength(0);
		await dbJob?.remove();
	});

	test('waits for the outbox row lock before retrying a delivery', async () => {
		const outboxId = await enqueueDeliverJobInOutbox(runtime.db, {
			name: 'retry.example.test',
			data: {
				user: { id: 'queue-outbox-retry-user' },
				content: '{"type":"Delete"}',
				digest: 'SHA-256=test',
				to: 'https://retry.example.test/inbox',
				isSharedInbox: true,
			},
			opts: { attempts: 1, backoff: { type: 'custom' } },
		});
		await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue);
		const jobId = `outbox-${outboxId}`;
		const worker = new Bull.Worker(QUEUE.DELIVER, async () => {
			throw new Error('expected delivery failure');
		}, {
			...baseWorkerOptions(runtime.config, QUEUE.DELIVER),
		});
		try {
			await vi.waitFor(async () => {
				expect(await runtime.deliverQueue.getJobState(jobId)).toBe('failed');
			});
		} finally {
			await worker.close();
		}

		let releaseLock: (() => void) | undefined;
		let markLocked: (() => void) | undefined;
		const locked = new Promise<void>(resolve => { markLocked = resolve; });
		const holdLock = new Promise<void>(resolve => { releaseLock = resolve; });
		const blocker = runtime.db.transaction(async tx => {
			await tx.select({ id: queueOutbox.id }).from(queueOutbox).where(eq(queueOutbox.id, outboxId)).for('update');
			markLocked?.();
			await holdLock;
		});
		await locked;
		let retryFinished = false;
		const retry = retryQueueJob(runtime, 'deliver', jobId).then(() => { retryFinished = true; });
		await new Promise(resolve => setTimeout(resolve, 50));
		expect(retryFinished).toBe(false);
		releaseLock?.();
		await blocker;
		await retry;
		expect(await runtime.deliverQueue.getJobState(jobId)).toBe('waiting');

		await (await runtime.deliverQueue.getJob(jobId))?.remove();
		await runtime.db.delete(queueOutbox).where(eq(queueOutbox.id, outboxId));
	});

	test('quarantines malformed delivery rows and keeps account deletion blocked', async () => {
		const coordinatorId = await enqueueAccountDeleteCoordinatorInOutbox(runtime.db, {
			user: { id: 'queue-outbox-invalid-deliver-user' },
			soft: false,
		}, { removeOnComplete: true });
		const invalidDeliverId = genId();
		await runtime.db.insert(queueOutbox).values({
			id: invalidDeliverId,
			queue: QUEUE.DELIVER,
			name: 'deliver',
			data: { coordinatorId, name: 'remote.example.test', data: {} },
			opts: {},
		});

		try {
			expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(0);
			const [invalidRow] = await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, invalidDeliverId));
			expect(invalidRow?.queue).toBe('invalid');
			expect(await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, coordinatorId))).toHaveLength(1);
			expect(await runtime.dbQueue.getJob(`outbox-${coordinatorId}`)).toBeUndefined();
		} finally {
			await runtime.db.delete(queueOutbox).where(inArray(queueOutbox.id, [invalidDeliverId, coordinatorId]));
		}
	});

	test('rotates pending delivery reconciliation beyond the oldest batch', async () => {
		const jobs = Array.from({ length: 30 }, (_, index) => ({
			name: `remote-${index}.example.test`,
			data: {
				user: { id: 'queue-outbox-rotation-user' },
				content: '{"type":"Delete"}',
				digest: 'SHA-256=test',
				to: `https://remote-${index}.example.test/inbox`,
				isSharedInbox: true,
			},
			opts: { attempts: 12, backoff: { type: 'custom' } },
		}));
		const outboxIds = await enqueueDeliverJobsInOutbox(runtime.db, jobs, genId());

		try {
			expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(30);
			expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(0);
			const rows = await runtime.db.select().from(queueOutbox).where(inArray(queueOutbox.id, outboxIds));
			expect(rows).toHaveLength(30);
			expect(rows.every(row => typeof (row.opts as { nextCheckAt?: unknown }).nextCheckAt === 'string')).toBe(true);
		} finally {
			await Promise.all(outboxIds.map(async id => await (await runtime.deliverQueue.getJob(`outbox-${id}`))?.remove()));
			await runtime.db.delete(queueOutbox).where(inArray(queueOutbox.id, outboxIds));
		}
	});

	test('outbox row is rolled back with its surrounding transaction', async () => {
		let outboxId: string | undefined;
		await expect(runtime.db.transaction(async transaction => {
			outboxId = await enqueueDbJobInOutbox(transaction as RuntimeDependencies['db'], 'deleteAccount', {
				user: { id: 'queue-outbox-rollback-user' },
				soft: true,
			}, { removeOnComplete: true });
			throw new Error('rollback');
		})).rejects.toThrow('rollback');

		expect(outboxId).toBeDefined();
		expect(await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, outboxId!))).toHaveLength(0);
	});

	test('dispatches a backlog in bounded batches', async () => {
		const outboxIds: string[] = [];
		await runtime.db.transaction(async transaction => {
			for (let i = 0; i < 250; i++) {
				outboxIds.push(await enqueueDbJobInOutbox(transaction as RuntimeDependencies['db'], 'deleteAccount', {
					user: { id: `queue-outbox-load-${i}` },
					soft: true,
				}, { removeOnComplete: true }));
			}
		});

		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(100);
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(100);
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(50);
		expect(await getQueueOutboxStats(runtime.db)).toEqual({ pending: 0, oldestPendingAgeMs: null });

		await Promise.all(outboxIds.map(async id => await (await runtime.dbQueue.getJob(`outbox-${id}`))?.remove()));
	});

	test('drops malformed rows without blocking valid outbox jobs', async () => {
		const invalidNameId = genId();
		const invalidDataId = genId();
		const invalidOptionsId = genId();
		try {
			await runtime.db.insert(queueOutbox).values([{
				id: invalidNameId,
				queue: QUEUE.DB,
				name: 'constructor',
				data: {},
				opts: {},
			}, {
				id: invalidDataId,
				queue: QUEUE.DB,
				name: 'deleteAccount',
				data: {},
				opts: {},
			}, {
				id: invalidOptionsId,
				queue: QUEUE.DB,
				name: 'deleteAccount',
				data: { user: { id: 'queue-outbox-invalid-options-user' } },
				opts: { removeOnComplete: { age: 'invalid' } },
			}]);
			const validId = await enqueueDbJobInOutbox(runtime.db, 'deleteAccount', {
				user: { id: 'queue-outbox-after-malformed-user' },
				soft: true,
			}, { removeOnComplete: true });

			expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(1);
			expect(await runtime.db.select().from(queueOutbox).where(inArray(queueOutbox.id, [invalidNameId, invalidDataId, invalidOptionsId, validId]))).toHaveLength(0);
			const job = await runtime.dbQueue.getJob(`outbox-${validId}`);
			expect(job?.data).toEqual({ user: { id: 'queue-outbox-after-malformed-user' }, soft: true });
			await job?.remove();
		} finally {
			await runtime.db.delete(queueOutbox).where(inArray(queueOutbox.id, [invalidNameId, invalidDataId, invalidOptionsId]));
		}
	});
});
