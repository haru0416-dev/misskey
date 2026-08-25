/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import * as Bull from 'bullmq';
import { eq, inArray } from 'drizzle-orm';
import { loadConfig } from '@/config.js';
import { removeQueueJob, retryQueueJob } from '@/core/QueueAdminLogic.js';
import {
	dispatchQueueOutbox,
	enqueueAccountDeleteCoordinatorInOutbox,
	enqueueDbJobInOutbox,
	enqueueDeliverJobInOutbox,
	enqueueInlineDbJobInOutbox,
	getQueueOutboxStats,
	publishDbOutboxRowEagerly,
	runInlineDbOutboxJob,
} from '@/core/QueueOutboxStore.js';
import { queueOutbox } from '@/db/schema/queue-outbox.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { genId } from '@/misc/id/gen-id.js';
import { baseWorkerOptions, QUEUE } from '@/queue/const.js';

const waitForNextPoll = async () => await new Promise((resolve) => setTimeout(resolve, 1100));

function deliveryInput(userId: string, host = 'remote.example.test') {
	return {
		name: host,
		data: {
			user: { id: userId },
			content: '{"type":"Delete"}',
			digest: 'SHA-256=test',
			to: `https://${host}/inbox`,
			isSharedInbox: true,
		},
		opts: { attempts: 1, backoff: { type: 'custom' as const } },
	};
}

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

	test('dispatches a committed DB row once with a deterministic job id', async () => {
		const outboxId = await enqueueDbJobInOutbox(
			runtime.db,
			'deleteAccount',
			{
				user: { id: 'queue-outbox-test-user' },
				soft: true,
			},
			{ removeOnComplete: true },
		);

		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(1);
		expect(await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, outboxId))).toHaveLength(0);
		const job = await runtime.dbQueue.getJob(`outbox-${outboxId}`);
		expect(job?.data).toEqual({ user: { id: 'queue-outbox-test-user' }, soft: true });
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(0);
		expect(await getQueueOutboxStats(runtime.db)).toEqual({
			pending: 0,
			deadLetter: 0,
			deliveryFailed: 0,
			invalidPayload: 0,
			oldestPendingAgeMs: null,
		});
		await job?.remove();
	});

	test('does not dispatch a DB row while its inline owner holds the lease', async () => {
		const inlineJob = await enqueueInlineDbJobInOutbox(
			runtime.db,
			'deleteAccount',
			{ user: { id: 'queue-outbox-inline-user' }, soft: true },
			{ removeOnComplete: true },
		);
		await runtime.db
			.update(queueOutbox)
			.set({ leaseExpiresAt: new Date(0) })
			.where(eq(queueOutbox.id, inlineJob.outboxId));
		let finishTask!: () => void;
		const taskFinished = new Promise<void>((resolve) => {
			finishTask = resolve;
		});
		let taskStarted!: () => void;
		const started = new Promise<void>((resolve) => {
			taskStarted = resolve;
		});
		const running = runInlineDbOutboxJob(runtime.db, inlineJob, async () => {
			taskStarted();
			await taskFinished;
		});

		await started;
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(0);
		expect(await runtime.dbQueue.getJob(`outbox-${inlineJob.outboxId}`)).toBeUndefined();
		finishTask();
		await expect(running).resolves.toBe(true);
		expect(await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, inlineJob.outboxId))).toHaveLength(0);
	});

	test('publishes delivery outside the claim transaction and keeps its row', async () => {
		const outboxId = await enqueueDeliverJobInOutbox(runtime.db, deliveryInput('queue-outbox-deliver-user'));
		try {
			expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(1);
			const job = await runtime.deliverQueue.getJob(`outbox-${outboxId}`);
			expect(job?.opts.removeOnComplete).toBe(false);
			expect(job?.opts.removeOnFail).toBe(false);
			const [row] = await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, outboxId));
			expect(row?.state).toBe('published');
			expect(row?.leaseToken).toBeNull();
			await job?.remove();
		} finally {
			await runtime.db.delete(queueOutbox).where(eq(queueOutbox.id, outboxId));
		}
	});

	test('keeps failed delivery as a dead letter until retry succeeds', async () => {
		const coordinatorId = await enqueueAccountDeleteCoordinatorInOutbox(
			runtime.db,
			{
				user: { id: 'queue-outbox-failed-user' },
				soft: false,
			},
			{ removeOnComplete: true },
		);
		const deliveryId = await enqueueDeliverJobInOutbox(
			runtime.db,
			deliveryInput('queue-outbox-failed-user'),
			coordinatorId,
		);
		const deliveryJobId = `outbox-${deliveryId}`;

		const failingWorker = new Bull.Worker(
			QUEUE.DELIVER,
			async () => {
				throw new Error('expected delivery failure');
			},
			{ ...baseWorkerOptions(runtime.config, QUEUE.DELIVER) },
		);
		try {
			expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(1);
			await vi.waitFor(async () => expect(await runtime.deliverQueue.getJobState(deliveryJobId)).toBe('failed'));
		} finally {
			await failingWorker.close();
		}

		await waitForNextPoll();
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(0);
		const [failedRow] = await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, deliveryId));
		expect(failedRow?.state).toBe('deadLetter');
		expect(failedRow?.deadLetterReason).toBe('deliveryFailed');
		expect(await runtime.dbQueue.getJob(`outbox-${coordinatorId}`)).toBeUndefined();

		await retryQueueJob(runtime, 'deliver', deliveryJobId);
		expect((await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, deliveryId)))[0]?.state).toBe('ready');
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(1);

		const successfulWorker = new Bull.Worker(QUEUE.DELIVER, async () => 'delivered', {
			...baseWorkerOptions(runtime.config, QUEUE.DELIVER),
		});
		try {
			await vi.waitFor(async () => expect(await runtime.deliverQueue.getJobState(deliveryJobId)).toBe('completed'));
		} finally {
			await successfulWorker.close();
		}

		await waitForNextPoll();
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(1);
		const dbJob = await runtime.dbQueue.getJob(`outbox-${coordinatorId}`);
		expect(dbJob?.data).toMatchObject({ accountDeleteCoordinatorId: coordinatorId });
		expect(
			await runtime.db
				.select()
				.from(queueOutbox)
				.where(inArray(queueOutbox.id, [deliveryId, coordinatorId])),
		).toHaveLength(0);
		await dbJob?.remove();
	});

	test('quarantines malformed child and requires explicit abandon before coordinator dispatch', async () => {
		const coordinatorId = await enqueueAccountDeleteCoordinatorInOutbox(
			runtime.db,
			{
				user: { id: 'queue-outbox-invalid-user' },
				soft: false,
			},
			{ removeOnComplete: true },
		);
		const invalidId = genId();
		await runtime.db.insert(queueOutbox).values({
			id: invalidId,
			queue: QUEUE.DELIVER,
			name: 'deliver',
			coordinatorId,
			data: { name: 'remote.example.test', data: {} },
			opts: {},
			externalJobId: `outbox-${invalidId}`,
		});

		try {
			expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(0);
			const [invalidRow] = await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, invalidId));
			expect(invalidRow?.state).toBe('deadLetter');
			expect(invalidRow?.deadLetterReason).toBe('invalidPayload');
			expect(await runtime.dbQueue.getJob(`outbox-${coordinatorId}`)).toBeUndefined();

			await removeQueueJob(runtime, 'deliver', `outbox-${invalidId}`);
			expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(1);
			const dbJob = await runtime.dbQueue.getJob(`outbox-${coordinatorId}`);
			expect(dbJob).toBeDefined();
			await dbJob?.remove();
		} finally {
			await runtime.db.delete(queueOutbox).where(inArray(queueOutbox.id, [invalidId, coordinatorId]));
		}
	});

	test('backs off in-flight delivery polling exponentially', async () => {
		const outboxId = await enqueueDeliverJobInOutbox(runtime.db, deliveryInput('queue-outbox-backoff-user'));
		try {
			await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue);
			await waitForNextPoll();
			expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(0);
			const [row] = await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, outboxId));
			expect(row?.state).toBe('published');
			expect(row?.pollIntervalMs).toBe(2000);
			expect(row?.availableAt.getTime()).toBeGreaterThan(Date.now());
		} finally {
			await (await runtime.deliverQueue.getJob(`outbox-${outboxId}`))?.remove();
			await runtime.db.delete(queueOutbox).where(eq(queueOutbox.id, outboxId));
		}
	});

	test('recovers an expired publishing lease', async () => {
		const outboxId = await enqueueDbJobInOutbox(
			runtime.db,
			'deleteAccount',
			{
				user: { id: 'queue-outbox-expired-lease-user' },
				soft: true,
			},
			{ removeOnComplete: true },
		);
		await runtime.db
			.update(queueOutbox)
			.set({
				state: 'publishing',
				leaseToken: 'abandoned-lease',
				leaseExpiresAt: new Date(0),
			})
			.where(eq(queueOutbox.id, outboxId));

		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(1);
		const job = await runtime.dbQueue.getJob(`outbox-${outboxId}`);
		expect(job).toBeDefined();
		await job?.remove();
	});

	test('rolls an outbox row back with its surrounding transaction', async () => {
		let outboxId: string | undefined;
		await expect(
			runtime.db.transaction(async (transaction) => {
				outboxId = await enqueueDbJobInOutbox(
					transaction as RuntimeDependencies['db'],
					'deleteAccount',
					{
						user: { id: 'queue-outbox-rollback-user' },
						soft: true,
					},
					{ removeOnComplete: true },
				);
				throw new Error('rollback');
			}),
		).rejects.toThrow('rollback');

		expect(outboxId).toBeDefined();
		expect(await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, outboxId!))).toHaveLength(0);
	});

	test('reports the age of the oldest pending row as a number', async () => {
		// 生sqlでtimestamptzを受けると文字列で返り、統計を読むadmin/queueのendpointが500になっていた
		const outboxId = await enqueueDeliverJobInOutbox(runtime.db, deliveryInput('queue-outbox-stats-user'));
		try {
			const stats = await getQueueOutboxStats(runtime.db);
			expect(stats.pending).toBe(1);
			expect(typeof stats.oldestPendingAgeMs).toBe('number');
			expect(stats.oldestPendingAgeMs).toBeGreaterThanOrEqual(0);
		} finally {
			await runtime.db.delete(queueOutbox).where(eq(queueOutbox.id, outboxId));
		}
	});

	test('drops the row when the eager publish path succeeds', async () => {
		const outboxId = await enqueueDbJobInOutbox(
			runtime.db,
			'deleteAccount',
			{
				user: { id: 'queue-outbox-eager-user' },
				soft: true,
			},
			{ removeOnComplete: true },
		);
		const jobId = `outbox-${outboxId}`;

		await publishDbOutboxRowEagerly(runtime.db, runtime.dbQueue, outboxId, {
			name: 'deleteAccount',
			data: { user: { id: 'queue-outbox-eager-user' }, soft: true },
			opts: { removeOnComplete: true },
		});

		expect(await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, outboxId))).toHaveLength(0);
		const job = await runtime.dbQueue.getJob(jobId);
		expect(job?.data).toEqual({ user: { id: 'queue-outbox-eager-user' }, soft: true });

		// 行が残っているとジョブ完了後 (= Valkeyからジョブが消えた後) にディスパッチャが同じジョブを作り直してしまう
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(0);
		await job?.remove();
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(0);
		expect(await runtime.dbQueue.getJob(jobId)).toBeUndefined();
	});

	test('dispatches a DB backlog in bounded batches', async () => {
		// READY_BATCH_SIZE (500) を超える件数を積み、1周あたりの発行件数が頭打ちになることを確認する
		const outboxIds: string[] = [];
		await runtime.db.transaction(async (transaction) => {
			for (let i = 0; i < 600; i++) {
				outboxIds.push(
					await enqueueDbJobInOutbox(
						transaction as RuntimeDependencies['db'],
						'deleteAccount',
						{
							user: { id: `queue-outbox-load-${i}` },
							soft: true,
						},
						{ removeOnComplete: true },
					),
				);
			}
		});

		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(500);
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(100);
		expect((await getQueueOutboxStats(runtime.db)).pending).toBe(0);
		await Promise.all(outboxIds.map(async (id) => await (await runtime.dbQueue.getJob(`outbox-${id}`))?.remove()));
	});
});
