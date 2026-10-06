/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import * as Bull from 'bullmq';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '@/config.js';
import { baseWorkerOptions, QUEUE } from '@/core/queue/const.js';
import { clearQueue, promoteQueueJobs } from '@/core/queue/queue-admin-logic.js';
import {
	enqueueDeliveryQueueCleanupInDatabase,
	fetchDeliveryQueueCleanupByJobIdFromDatabase,
} from '@/core/queue/delivery-queue-cleanup-store.js';
import {
	enqueueAccountDeleteCoordinatorInOutbox,
	enqueueDeliverJobInOutbox,
	fetchQueueOutboxByIdFromDatabase,
	publishDbOutboxRowEagerly,
} from '@/core/queue/queue-outbox-store.js';
import { deliveryQueueCleanup } from '@/db/schema/delivery-queue-cleanup.js';
import { queueOutbox } from '@/db/schema/queue-outbox.js';
import { genId } from '@/misc/id/gen-id.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import {
	handleApiAdminQueueAbandonOutboxDeadLetter,
	handleApiAdminQueueClear,
	handleApiAdminQueuePromoteJobs,
	handleApiAdminQueueQueueStats,
	handleApiAdminQueueQueues,
	handleApiAdminQueueRemoveJob,
	handleApiAdminQueueRetryJob,
} from '@/server/rest/admin/admin-queue.js';

function deliveryInput() {
	return {
		name: 'admin-queue.example.test',
		data: {
			user: { id: 'admin-queue-test-user' },
			content: '{"type":"Delete"}',
			digest: 'SHA-256=test',
			to: 'https://admin-queue.example.test/inbox',
			isSharedInbox: true,
		},
		opts: { attempts: 1, backoff: { type: 'custom' as const } },
	};
}

describe('delivery queue admin persistence', () => {
	let runtime: RuntimeDependencies;
	const childIds = new Set<string>();
	const coordinatorIds = new Set<string>();
	const jobIds = new Set<string>();
	const effectKeys = new Set<string>();
	const workers = new Set<Bull.Worker>();

	beforeAll(async () => {
		const config = loadConfig();
		config.valkey.jobQueue = { ...config.valkey.jobQueue, prefix: `queue-admin-test-${randomUUID()}` };
		runtime = await createRuntimeDependencies(config);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		for (const worker of workers) await worker.close();
		workers.clear();
		for (const jobId of jobIds) await (await runtime.deliverQueue.getJob(jobId))?.remove();
		for (const id of coordinatorIds) await (await runtime.dbQueue.getJob(`outbox-${id}`))?.remove();
		if (childIds.size > 0) await runtime.db.delete(queueOutbox).where(inArray(queueOutbox.id, [...childIds]));
		if (coordinatorIds.size > 0)
			await runtime.db.delete(queueOutbox).where(inArray(queueOutbox.id, [...coordinatorIds]));
		if (jobIds.size > 0)
			await runtime.db.delete(deliveryQueueCleanup).where(inArray(deliveryQueueCleanup.jobId, [...jobIds]));
		for (const key of effectKeys) await runtime.redis.del(key);
		childIds.clear();
		coordinatorIds.clear();
		jobIds.clear();
		effectKeys.clear();
	});

	afterAll(async () => await runtime.dispose());

	async function coordinator() {
		const id = await enqueueAccountDeleteCoordinatorInOutbox(
			runtime.db,
			{ user: { id: 'admin-queue-test-user' }, soft: false },
			{ removeOnComplete: true },
		);
		coordinatorIds.add(id);
		return id;
	}

	async function trackedDelivery(options: { coordinatorId?: string; external?: boolean; delay?: number } = {}) {
		const input = deliveryInput();
		const id = await enqueueDeliverJobInOutbox(runtime.db, input, options.coordinatorId);
		childIds.add(id);
		const jobId = options.external ? `admin-delivery-${id}` : `outbox-${id}`;
		jobIds.add(jobId);
		await runtime.db
			.update(queueOutbox)
			.set({
				state: 'published',
				externalJobId: options.external ? jobId : null,
				availableAt: new Date(Date.now() + 86_400_000),
			})
			.where(eq(queueOutbox.id, id));
		const job = await runtime.deliverQueue.add(input.name, input.data, {
			jobId,
			attempts: 1,
			...(options.delay == null ? {} : { delay: options.delay }),
			removeOnComplete: false,
			removeOnFail: false,
		});
		return { id, jobId, job };
	}

	async function finishDelivery(jobId: string) {
		const effectKey = `admin-delivery-effect-${jobId}`;
		effectKeys.add(effectKey);
		const worker = new Bull.Worker(QUEUE.DELIVER, async () => runtime.redis.incr(effectKey), {
			...baseWorkerOptions(runtime.config, QUEUE.DELIVER),
		});
		workers.add(worker);
		await vi.waitFor(async () => expect(await runtime.deliverQueue.getJobState(jobId)).toBe('completed'));
		await worker.close();
		workers.delete(worker);
		return effectKey;
	}

	test('cleanup counts and age are deliver-only and separate from unresolved outbox work', async () => {
		const beforeDeliver = await handleApiAdminQueueQueueStats(runtime, { queue: 'deliver' });
		const beforeDb = await handleApiAdminQueueQueueStats(runtime, { queue: 'db' });
		const pendingId = await enqueueDeliverJobInOutbox(runtime.db, deliveryInput());
		childIds.add(pendingId);
		await runtime.db
			.update(queueOutbox)
			.set({ availableAt: new Date(Date.now() + 86_400_000) })
			.where(eq(queueOutbox.id, pendingId));
		const cleanupIds = [`admin-cleanup-${genId()}`, `admin-cleanup-${genId()}`];
		for (const id of cleanupIds) jobIds.add(id);
		await enqueueDeliveryQueueCleanupInDatabase(runtime.db, cleanupIds);
		await runtime.db
			.update(deliveryQueueCleanup)
			.set({
				attempts: 1,
				lastError: 'Valkey cleanup unavailable',
				createdAt: new Date(Date.now() - 60_000),
			})
			.where(eq(deliveryQueueCleanup.jobId, cleanupIds[0]!));
		const deliver = await handleApiAdminQueueQueueStats(runtime, { queue: 'deliver' });
		const db = await handleApiAdminQueueQueueStats(runtime, { queue: 'db' });
		expect(deliver.outbox).toBeNull();
		expect(db.cleanup).toBeNull();
		expect(deliver.cleanup?.pending).toBe(beforeDeliver.cleanup!.pending + 2);
		expect(deliver.cleanup?.retrying).toBe(beforeDeliver.cleanup!.retrying + 1);
		expect(deliver.cleanup?.oldestPendingAgeMs).toBeGreaterThanOrEqual(59_000);
		expect(db.outbox?.pending).toBe(beforeDb.outbox!.pending + 1);
		const queues = await handleApiAdminQueueQueues(runtime);
		expect(queues.find((queue) => queue.name === 'deliver')?.cleanup).toMatchObject({
			pending: deliver.cleanup!.pending,
			retrying: deliver.cleanup!.retrying,
		});
		for (const queue of queues.filter((queue) => queue.name !== 'deliver')) expect(queue.cleanup).toBeNull();
	});

	test('retry reports409 for an acknowledged delivery even after its queue job is absent', async () => {
		const jobId = `admin-acknowledged-${genId()}`;
		jobIds.add(jobId);
		await enqueueDeliveryQueueCleanupInDatabase(runtime.db, [jobId]);
		await expect(handleApiAdminQueueRetryJob(runtime, { queue: 'deliver', jobId })).rejects.toMatchObject({
			status: 409,
			code: 'QUEUE_JOB_ALREADY_ACKNOWLEDGED',
		});
		expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(runtime.db, jobId)).not.toBeNull();
		expect(await runtime.deliverQueue.getJob(jobId)).toBeUndefined();
	});

	test('completed direct deliveries cannot be replayed and do not create outbox cleanup receipts', async () => {
		const jobId = `admin-direct-${genId()}`;
		jobIds.add(jobId);
		await runtime.deliverQueue.add('direct', deliveryInput().data, { jobId, removeOnComplete: false });
		const effectKey = await finishDelivery(jobId);
		await expect(handleApiAdminQueueRetryJob(runtime, { queue: 'deliver', jobId })).rejects.toMatchObject({
			status: 409,
			code: 'QUEUE_JOB_ALREADY_ACKNOWLEDGED',
		});
		expect(await runtime.deliverQueue.getJobState(jobId)).toBe('completed');
		expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(runtime.db, jobId)).toBeNull();
		await handleApiAdminQueueRemoveJob(runtime, { queue: 'deliver', jobId });
		expect(await runtime.deliverQueue.getJob(jobId)).toBeUndefined();
		expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(runtime.db, jobId)).toBeNull();
		expect(await runtime.redis.get(effectKey)).toBe('1');
	});

	test.each([false, true])(
		'completed removal commits acknowledgement before a failing cleanup (external=%s)',
		async (external) => {
			const coordinatorId = await coordinator();
			const delivery = await trackedDelivery({ coordinatorId, external });
			await publishDbOutboxRowEagerly(runtime.db, runtime.dbQueue, coordinatorId);
			expect(await runtime.dbQueue.getJob(`outbox-${coordinatorId}`)).toBeUndefined();
			const effectKey = await finishDelivery(delivery.jobId);
			await expect(
				handleApiAdminQueueRetryJob(runtime, { queue: 'deliver', jobId: delivery.jobId }),
			).rejects.toMatchObject({
				status: 409,
				code: 'QUEUE_JOB_ALREADY_ACKNOWLEDGED',
			});
			const failure = new Error('Valkey removal failed after acknowledgement');
			vi.spyOn(Bull.Job.prototype, 'remove').mockRejectedValueOnce(failure);
			await expect(handleApiAdminQueueRemoveJob(runtime, { queue: 'deliver', jobId: delivery.jobId })).rejects.toBe(
				failure,
			);
			expect(await fetchQueueOutboxByIdFromDatabase(runtime.db, delivery.id)).toBeNull();
			expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(runtime.db, delivery.jobId)).toMatchObject({
				jobId: delivery.jobId,
			});
			expect(await runtime.deliverQueue.getJobState(delivery.jobId)).toBe('completed');
			await publishDbOutboxRowEagerly(runtime.db, runtime.dbQueue, coordinatorId);
			expect((await runtime.dbQueue.getJob(`outbox-${coordinatorId}`))?.data).toMatchObject({
				accountDeleteCoordinatorId: coordinatorId,
			});
			await handleApiAdminQueueRemoveJob(runtime, { queue: 'deliver', jobId: delivery.jobId });
			expect(await runtime.deliverQueue.getJob(delivery.jobId)).toBeUndefined();
			await expect(
				handleApiAdminQueueRetryJob(runtime, { queue: 'deliver', jobId: delivery.jobId }),
			).rejects.toMatchObject({
				status: 409,
				code: 'QUEUE_JOB_ALREADY_ACKNOWLEDGED',
			});
			expect(await runtime.redis.get(effectKey)).toBe('1');
		},
	);

	test.each(['remove', 'abandon'] as const)(
		'discarded failed delivery keeps acknowledgement when Valkey removal fails (%s)',
		async (operation) => {
			const coordinatorId = await coordinator();
			const delivery = await trackedDelivery({ coordinatorId, external: true });
			const effectKey = `admin-discard-effect-${delivery.jobId}`;
			effectKeys.add(effectKey);
			const worker = new Bull.Worker<unknown, void>(
				QUEUE.DELIVER,
				async () => {
					await runtime.redis.incr(effectKey);
					throw new Error('Delivery exhausted its final attempt');
				},
				{
					...baseWorkerOptions(runtime.config, QUEUE.DELIVER),
				},
			);
			workers.add(worker);
			await vi.waitFor(async () => expect(await runtime.deliverQueue.getJobState(delivery.jobId)).toBe('failed'));
			await worker.close();
			workers.delete(worker);
			await runtime.db
				.update(queueOutbox)
				.set({
					state: 'deadLetter',
					deadLetterReason: 'deliveryFailed',
					revision: 7,
				})
				.where(eq(queueOutbox.id, delivery.id));
			if (operation === 'abandon') {
				await expect(
					handleApiAdminQueueAbandonOutboxDeadLetter(runtime, {
						outboxId: delivery.id,
						revision: 6,
					}),
				).rejects.toMatchObject({ status: 409, code: 'QUEUE_OUTBOX_STATE_CHANGED' });
				expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(runtime.db, delivery.jobId)).toBeNull();
				expect((await fetchQueueOutboxByIdFromDatabase(runtime.db, delivery.id))?.state).toBe('deadLetter');
			}
			await publishDbOutboxRowEagerly(runtime.db, runtime.dbQueue, coordinatorId);
			expect(await runtime.dbQueue.getJob(`outbox-${coordinatorId}`)).toBeUndefined();
			const failure = new Error('Valkey removal failed after explicit discard');
			vi.spyOn(Bull.Job.prototype, 'remove').mockRejectedValueOnce(failure);
			const discard =
				operation === 'remove'
					? handleApiAdminQueueRemoveJob(runtime, { queue: 'deliver', jobId: delivery.jobId })
					: handleApiAdminQueueAbandonOutboxDeadLetter(runtime, { outboxId: delivery.id, revision: 7 });
			await expect(discard).rejects.toBe(failure);
			expect(await fetchQueueOutboxByIdFromDatabase(runtime.db, delivery.id)).toBeNull();
			expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(runtime.db, delivery.jobId)).toMatchObject({
				jobId: delivery.jobId,
			});
			expect(await runtime.deliverQueue.getJobState(delivery.jobId)).toBe('failed');
			await expect(
				handleApiAdminQueueRetryJob(runtime, { queue: 'deliver', jobId: delivery.jobId }),
			).rejects.toMatchObject({
				status: 409,
				code: 'QUEUE_JOB_ALREADY_ACKNOWLEDGED',
			});
			await publishDbOutboxRowEagerly(runtime.db, runtime.dbQueue, coordinatorId);
			expect((await runtime.dbQueue.getJob(`outbox-${coordinatorId}`))?.data).toMatchObject({
				accountDeleteCoordinatorId: coordinatorId,
			});
			await handleApiAdminQueueRemoveJob(runtime, { queue: 'deliver', jobId: delivery.jobId });
			expect(await runtime.deliverQueue.getJob(delivery.jobId)).toBeUndefined();
			await expect(
				handleApiAdminQueueRetryJob(runtime, { queue: 'deliver', jobId: delivery.jobId }),
			).rejects.toMatchObject({
				status: 409,
				code: 'QUEUE_JOB_ALREADY_ACKNOWLEDGED',
			});
			expect(await runtime.redis.get(effectKey)).toBe('1');
		},
	);

	test('unresolved tracked work is rejected before remove or bulk-clear changes jobs', async () => {
		const delivery = await trackedDelivery({ external: true, delay: 600_000 });
		const rawJobId = `admin-raw-${genId()}`;
		jobIds.add(rawJobId);
		const raw = await runtime.deliverQueue.add('raw', deliveryInput().data, { jobId: rawJobId, delay: 600_000 });
		const expected = { status: 409, code: 'QUEUE_JOB_NOT_TERMINAL' };
		await expect(
			handleApiAdminQueueRemoveJob(runtime, { queue: 'deliver', jobId: delivery.jobId }),
		).rejects.toMatchObject(expected);
		await expect(
			handleApiAdminQueueClear(runtime, { id: 'admin-queue-test-user' }, { queue: 'deliver', state: '*' }),
		).rejects.toMatchObject(expected);
		expect(await delivery.job.getState()).toBe('delayed');
		expect(await raw.getState()).toBe('delayed');
		expect((await fetchQueueOutboxByIdFromDatabase(runtime.db, delivery.id))?.state).toBe('published');
		expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(runtime.db, delivery.jobId)).toBeNull();
		await handleApiAdminQueueRetryJob(runtime, { queue: 'deliver', jobId: rawJobId });
		expect(await raw.getState()).not.toBe('delayed');
		await handleApiAdminQueueRemoveJob(runtime, { queue: 'deliver', jobId: rawJobId });
		expect(await runtime.deliverQueue.getJob(rawJobId)).toBeUndefined();
	});

	test.each(['retry', 'bulk'] as const)(
		'delayed tracked delivery can be promoted without republishing (%s)',
		async (operation) => {
			const delivery = await trackedDelivery({ external: true, delay: 600_000 });
			if (operation === 'retry') {
				await handleApiAdminQueueRetryJob(runtime, { queue: 'deliver', jobId: delivery.jobId });
			} else {
				await promoteQueueJobs(runtime, 'deliver');
			}
			expect(await delivery.job.getState()).not.toBe('delayed');
			expect((await fetchQueueOutboxByIdFromDatabase(runtime.db, delivery.id))?.state).toBe('published');
			expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(runtime.db, delivery.jobId)).toBeNull();
			await expect(
				handleApiAdminQueueRetryJob(runtime, { queue: 'deliver', jobId: delivery.jobId }),
			).rejects.toMatchObject({
				status: 409,
				code: 'QUEUE_JOB_NOT_TERMINAL',
			});
			const effectKey = await finishDelivery(delivery.jobId);
			expect(await runtime.redis.get(effectKey)).toBe('1');
			expect((await fetchQueueOutboxByIdFromDatabase(runtime.db, delivery.id))?.state).toBe('published');
			await expect(
				handleApiAdminQueueRetryJob(runtime, { queue: 'deliver', jobId: delivery.jobId }),
			).rejects.toMatchObject({
				status: 409,
				code: 'QUEUE_JOB_ALREADY_ACKNOWLEDGED',
			});
		},
	);

	test.each(['receipt', 'deadLetter', 'completed'] as const)(
		'bulk promotion refuses terminal delivery evidence (%s)',
		async (state) => {
			const delivery = await trackedDelivery({ external: true, delay: 600_000 });
			if (state === 'receipt') {
				await enqueueDeliveryQueueCleanupInDatabase(runtime.db, [delivery.jobId]);
			} else if (state === 'deadLetter') {
				await runtime.db
					.update(queueOutbox)
					.set({ state: 'deadLetter', deadLetterReason: 'deliveryFailed' })
					.where(eq(queueOutbox.id, delivery.id));
			} else {
				const getJobs = runtime.deliverQueue.getJobs.bind(runtime.deliverQueue);
				vi.spyOn(runtime.deliverQueue, 'getJobs').mockImplementationOnce(async (...args) => {
					const snapshot = await getJobs(...args);
					await delivery.job.promote();
					await finishDelivery(delivery.jobId);
					return snapshot;
				});
			}
			await expect(
				handleApiAdminQueuePromoteJobs(runtime, { id: 'admin-queue-test-user' }, { queue: 'deliver' }),
			).rejects.toMatchObject({
				status: 409,
				code: state === 'deadLetter' ? 'QUEUE_JOB_NOT_TERMINAL' : 'QUEUE_JOB_ALREADY_ACKNOWLEDGED',
			});
			expect(await delivery.job.getState()).toBe(state === 'completed' ? 'completed' : 'delayed');
			expect((await fetchQueueOutboxByIdFromDatabase(runtime.db, delivery.id))?.state).toBe(
				state === 'deadLetter' ? 'deadLetter' : 'published',
			);
		},
	);

	test('retry cannot restart a tracked delivery while its consumer is active', async () => {
		const delivery = await trackedDelivery();
		const release = Promise.withResolvers<void>();
		const effectKey = `admin-active-effect-${delivery.jobId}`;
		effectKeys.add(effectKey);
		const worker = new Bull.Worker(
			QUEUE.DELIVER,
			async () => {
				await release.promise;
				return await runtime.redis.incr(effectKey);
			},
			{
				...baseWorkerOptions(runtime.config, QUEUE.DELIVER),
			},
		);
		workers.add(worker);
		try {
			await vi.waitFor(async () => expect(await delivery.job.getState()).toBe('active'));
			await expect(
				handleApiAdminQueueRetryJob(runtime, { queue: 'deliver', jobId: delivery.jobId }),
			).rejects.toMatchObject({
				status: 409,
				code: 'QUEUE_JOB_NOT_TERMINAL',
			});
			expect((await fetchQueueOutboxByIdFromDatabase(runtime.db, delivery.id))?.state).toBe('published');
		} finally {
			release.resolve();
			await worker.close();
			workers.delete(worker);
		}
		expect(await delivery.job.getState()).toBe('completed');
		expect(await runtime.redis.get(effectKey)).toBe('1');
	});

	test('completed clear removes only its explicit snapshot and cannot release a coordinator with a later child', async () => {
		const coordinatorId = await coordinator();
		const first = await trackedDelivery({ coordinatorId });
		const firstEffect = await finishDelivery(first.jobId);
		const later = await trackedDelivery({ coordinatorId, external: true, delay: 600_000 });
		const getJobs = runtime.deliverQueue.getJobs.bind(runtime.deliverQueue);
		let laterEffect: string | undefined;
		vi.spyOn(runtime.deliverQueue, 'getJobs').mockImplementationOnce(async (...args) => {
			const snapshot = await getJobs(...args);
			await later.job.promote();
			laterEffect = await finishDelivery(later.jobId);
			return snapshot;
		});
		await clearQueue(runtime, 'deliver', 'completed');
		expect(await fetchQueueOutboxByIdFromDatabase(runtime.db, first.id)).toBeNull();
		expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(runtime.db, first.jobId)).not.toBeNull();
		expect(await runtime.deliverQueue.getJob(first.jobId)).toBeUndefined();
		expect((await fetchQueueOutboxByIdFromDatabase(runtime.db, later.id))?.state).toBe('published');
		expect(await runtime.deliverQueue.getJobState(later.jobId)).toBe('completed');
		expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(runtime.db, later.jobId)).toBeNull();
		await publishDbOutboxRowEagerly(runtime.db, runtime.dbQueue, coordinatorId);
		expect(await runtime.dbQueue.getJob(`outbox-${coordinatorId}`)).toBeUndefined();
		await handleApiAdminQueueRemoveJob(runtime, { queue: 'deliver', jobId: later.jobId });
		await publishDbOutboxRowEagerly(runtime.db, runtime.dbQueue, coordinatorId);
		expect((await runtime.dbQueue.getJob(`outbox-${coordinatorId}`))?.data).toMatchObject({
			accountDeleteCoordinatorId: coordinatorId,
		});
		expect(await runtime.redis.get(firstEffect)).toBe('1');
		expect(await runtime.redis.get(laterEffect!)).toBe('1');
	});

	test('SQL acknowledgement failure keeps completed queue evidence and the coordinator blocked', async () => {
		const coordinatorId = await coordinator();
		const delivery = await trackedDelivery({ coordinatorId });
		const effectKey = await finishDelivery(delivery.jobId);
		const transaction = runtime.db.transaction.bind(runtime.db);
		const failure = new Error('admin acknowledgement commit failed');
		vi.spyOn(runtime.db, 'transaction').mockImplementationOnce(async (task, options) =>
			transaction(async (tx) => {
				await task(tx);
				throw failure;
			}, options),
		);
		await expect(handleApiAdminQueueRemoveJob(runtime, { queue: 'deliver', jobId: delivery.jobId })).rejects.toBe(
			failure,
		);
		expect((await fetchQueueOutboxByIdFromDatabase(runtime.db, delivery.id))?.state).toBe('published');
		expect(await fetchDeliveryQueueCleanupByJobIdFromDatabase(runtime.db, delivery.jobId)).toBeNull();
		expect(await runtime.deliverQueue.getJobState(delivery.jobId)).toBe('completed');
		await publishDbOutboxRowEagerly(runtime.db, runtime.dbQueue, coordinatorId);
		expect(await runtime.dbQueue.getJob(`outbox-${coordinatorId}`)).toBeUndefined();
		await handleApiAdminQueueRemoveJob(runtime, { queue: 'deliver', jobId: delivery.jobId });
		expect(await runtime.redis.get(effectKey)).toBe('1');
		expect(
			await runtime.db
				.select()
				.from(queueOutbox)
				.where(and(eq(queueOutbox.id, delivery.id), eq(queueOutbox.state, 'ready'))),
		).toEqual([]);
	});
});
