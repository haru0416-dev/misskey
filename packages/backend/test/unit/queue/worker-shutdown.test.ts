/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type * as Bull from 'bullmq';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { createQueueWorkers } from '@/queue/worker.js';
import type { QueueShellDependencies } from '@/queue/worker.js';
import { createEventPublishers } from '@/core/events.js';
import { queueReadyRef, readyRef } from '@/boot/ready.js';
import { createHealthApp } from '@/server/health.js';
import { enqueueDbJobInOutbox, waitForDbOutboxJob } from '@/core/queue/queue-outbox-store.js';
import { queueOutbox } from '@/db/schema/queue-outbox.js';
import { deliveryQueueCleanup } from '@/db/schema/delivery-queue-cleanup.js';
import { enqueueDeliveryQueueCleanupInDatabase } from '@/core/queue/delivery-queue-cleanup-store.js';
import { genId } from '@/misc/id/gen-id.js';

const handler = vi.hoisted(() => ({ run: async (): Promise<void> => {} }));
vi.mock('@/queue/handlers/post-scheduled-note.js', () => ({
	handleQueuePostScheduledNote: () => handler.run(),
}));

let runtime: RuntimeDependencies;
let workerDependencies: QueueShellDependencies;
beforeAll(async () => {
	const config = loadConfig();
	config.valkey.jobQueue = { ...config.valkey.jobQueue, prefix: `worker-shutdown-${process.pid}` };
	runtime = await createRuntimeDependencies(config);
	workerDependencies = {
		...runtime,
		...createEventPublishers({
			config,
			publish: (host, message) => runtime.redisForPub.publish(host, message),
		}),
		logger: runtime.loggerService.getLogger('worker-test'),
	};
});
afterAll(async () => {
	await runtime.dispose();
});

test('shutdown drains a parent that still needs outbox publication and the DB consumer', async () => {
	const entered = Promise.withResolvers<void>();
	const continueParent = Promise.withResolvers<void>();
	let outboxId: string | undefined;
	let parentCompleted = false;
	handler.run = async () => {
		entered.resolve();
		await continueParent.promise;
		outboxId = await enqueueDbJobInOutbox(
			runtime.db,
			'notePostCreate',
			{
				noteId: genId(),
				stage: 'fanout',
				silent: false,
				mentionedUserIds: [],
				reply: null,
				renote: null,
			},
			{ removeOnComplete: true },
		);
		await waitForDbOutboxJob(runtime.db, runtime.dbQueue, outboxId);
		parentCompleted = true;
	};
	const workers = createQueueWorkers({
		...workerDependencies,
		logger: runtime.loggerService.getLogger('shutdown-test'),
	});
	const running = workers.start();
	let stopping: Promise<void> | undefined;
	const job = await runtime.postScheduledNoteQueue.add(
		'shutdown-parent',
		{ noteDraftId: genId(), scheduledAt: 0 },
		{ removeOnComplete: false },
	);
	try {
		await entered.promise;
		stopping = workers.stop();
		expect(workers.stop()).toBe(stopping);
		continueParent.resolve();
		await vi.waitFor(() => expect(parentCompleted).toBe(true), { timeout: 5000 });
		await stopping;
		await running;
		expect(await job.getState()).toBe('completed');
	} finally {
		continueParent.resolve();
		// 回帰時にも close を待つ handler を解放し、テスト用接続を残さない。
		if (outboxId != null && !parentCompleted) {
			await runtime.db
				.update(queueOutbox)
				.set({ state: 'deadLetter', lastError: { message: 'test cleanup' } })
				.where(eq(queueOutbox.id, outboxId));
		}
		await (stopping ?? workers.stop());
		await running;
		await job.remove();
		if (outboxId != null) {
			await (await runtime.dbQueue.getJob(`outbox-${outboxId}`))?.remove();
			await runtime.db.delete(queueOutbox).where(eq(queueOutbox.id, outboxId));
		}
	}
});

test('shutdown finishes an in-flight delivery cleanup before closing its dependencies', async () => {
	const jobId = `shutdown-cleanup-${genId()}`;
	await enqueueDeliveryQueueCleanupInDatabase(runtime.db, [jobId]);
	const entered = Promise.withResolvers<void>();
	const resume = Promise.withResolvers<void>();
	const getJobState = runtime.deliverQueue.getJobState.bind(runtime.deliverQueue);
	const blockedRead = vi.spyOn(runtime.deliverQueue, 'getJobState').mockImplementation(async (id) => {
		if (id === jobId) {
			entered.resolve();
			await resume.promise;
		}
		return await getJobState(id);
	});
	const workers = createQueueWorkers(workerDependencies);
	let stopped = false;
	let stopping: Promise<void> | undefined;
	try {
		await workers.start();
		await entered.promise;
		stopping = workers.stop().then(() => {
			stopped = true;
		});
		expect(
			await runtime.db.select().from(deliveryQueueCleanup).where(eq(deliveryQueueCleanup.jobId, jobId)),
		).toMatchObject([{ jobId }]);
		expect(stopped).toBe(false);
		resume.resolve();
		await stopping;
		expect(await runtime.db.select().from(deliveryQueueCleanup).where(eq(deliveryQueueCleanup.jobId, jobId))).toEqual(
			[],
		);
		expect(workers.dbQueueWorker.getBackend().connection.status).toBe('closed');
	} finally {
		resume.resolve();
		await (stopping ?? workers.stop());
		blockedRead.mockRestore();
		await runtime.db.delete(deliveryQueueCleanup).where(eq(deliveryQueueCleanup.jobId, jobId));
	}
});

test('stop racing initial publication does not start consumers after they close', async () => {
	const workers = createQueueWorkers({
		...workerDependencies,
		logger: runtime.loggerService.getLogger('shutdown-race-test'),
	});
	const running = workers.start();
	const stopping = workers.stop();
	expect(workers.stop()).toBe(stopping);
	await stopping;
	await running;
	expect(workers.dbQueueWorker.isRunning()).toBe(false);
});

test('cleanup progresses while initial outbox publication is blocked', async () => {
	const cleanupJobId = `startup-cleanup-${genId()}`;
	await enqueueDeliveryQueueCleanupInDatabase(runtime.db, [cleanupJobId]);
	const outboxId = await enqueueDbJobInOutbox(
		runtime.db,
		'deleteAccount',
		{ user: { id: 'startup-publication-no-user' }, soft: true },
		{ removeOnComplete: true },
	);
	const entered = Promise.withResolvers<void>();
	const resume = Promise.withResolvers<void>();
	const dbQueue = runtime.dbQueue as unknown as Bull.Queue;
	const addBulk = dbQueue.addBulk.bind(dbQueue);
	const blockedPublication = vi.spyOn(dbQueue, 'addBulk').mockImplementationOnce(async (jobs) => {
		entered.resolve();
		await resume.promise;
		return await addBulk(jobs);
	});
	const workers = createQueueWorkers(workerDependencies);
	const starting = workers.start();
	try {
		await entered.promise;
		await vi.waitFor(async () => {
			expect(
				await runtime.db.select().from(deliveryQueueCleanup).where(eq(deliveryQueueCleanup.jobId, cleanupJobId)),
			).toEqual([]);
		});
		expect(await runtime.dbQueue.getJob(`outbox-${outboxId}`)).toBeUndefined();
		resume.resolve();
		await starting;
	} finally {
		resume.resolve();
		await workers.stop();
		await starting;
		blockedPublication.mockRestore();
		await runtime.dbQueue.remove(`outbox-${outboxId}`);
		await runtime.db.delete(queueOutbox).where(eq(queueOutbox.id, outboxId));
		await runtime.db.delete(deliveryQueueCleanup).where(eq(deliveryQueueCleanup.jobId, cleanupJobId));
	}
});

test('consumer startup rejection closes consumers instead of reporting readiness', async () => {
	const workers = createQueueWorkers({
		...workerDependencies,
		logger: runtime.loggerService.getLogger('startup-failure-test'),
	});
	const failure = new Error('injected startup failure');
	vi.spyOn(workers.inboxQueueWorker, 'run').mockRejectedValue(failure);
	await expect(workers.start()).rejects.toThrow(failure);
	expect(workers.isReady()).toBe(false);
	expect(workers.postScheduledNoteQueueWorker.getBackend().connection.status).toBe('closed');
	expect(workers.dbQueueWorker.getBackend().connection.status).toBe('closed');
	expect(workers.deliverQueueWorker.getBackend().connection.status).toBe('closed');
	await workers.stop();
});

test('queue connections alone control health and all required sockets must reconnect before recovery', async () => {
	const previousReady = readyRef.value;
	const previousQueueReady = queueReadyRef.value;
	readyRef.value = true;
	const workers = createQueueWorkers(workerDependencies, (ready) => {
		queueReadyRef.value = ready;
	});
	const health = createHealthApp(runtime);
	const allowBlockingReconnect = Promise.withResolvers<void>();
	try {
		await workers.start();
		const backend = workers.inboxQueueWorker.getBackend();
		const main = await backend.client;
		const blocking = await backend.blockingClient;
		if (blocking == null) throw new Error('inbox consumer has no blocking connection');
		const connectBlocking = blocking.connect.bind(blocking);
		let reconnecting: Promise<void> | undefined;
		// BullMQ 側の自動 reconnect も同じ境界で止め、main だけ復旧した状態を確定する。
		vi.spyOn(blocking, 'connect').mockImplementation(() => {
			reconnecting ??= allowBlockingReconnect.promise.then(() => connectBlocking());
			return reconnecting;
		});
		main.disconnect();
		blocking.disconnect();
		await vi.waitFor(() => expect(workers.isReady()).toBe(false));
		expect((await health.request('/')).status).toBe(503);
		expect(await runtime.redis.ping()).toBe('PONG');
		await main.connect();
		expect((await health.request('/')).status).toBe(503);
		const restoringBlocking = blocking.connect();
		allowBlockingReconnect.resolve();
		await restoringBlocking;
		await vi.waitFor(() => expect(workers.isReady()).toBe(true));
		expect((await health.request('/')).status).toBe(200);
	} finally {
		allowBlockingReconnect.resolve();
		await workers.stop();
		readyRef.value = previousReady;
		queueReadyRef.value = previousQueueReady;
	}
});

test('a consumer loop failure withdraws health readiness even while DB and Valkey remain usable', async () => {
	const previousReady = readyRef.value;
	const previousQueueReady = queueReadyRef.value;
	readyRef.value = true;
	const running = Promise.withResolvers<void>();
	const workers = createQueueWorkers(
		{ ...workerDependencies, logger: runtime.loggerService.getLogger('run-failure-test') },
		(ready) => {
			queueReadyRef.value = ready;
		},
	);
	vi.spyOn(workers.inboxQueueWorker, 'run').mockReturnValue(running.promise);
	const health = createHealthApp(runtime);
	try {
		await workers.start();
		expect(workers.isReady()).toBe(true);
		expect((await health.request('/')).status).toBe(200);
		running.reject(new Error('injected permanent consumer failure'));
		await vi.waitFor(() => expect(workers.isReady()).toBe(false));
		expect((await health.request('/')).status).toBe(503);
		const backend = workers.inboxQueueWorker.getBackend();
		backend.connection.emit('ready');
		backend.blockingConnection?.emit('ready');
		expect((await health.request('/')).status).toBe(503);
		expect(await runtime.redis.ping()).toBe('PONG');
	} finally {
		await workers.stop();
		running.resolve();
		readyRef.value = previousReady;
		queueReadyRef.value = previousQueueReady;
	}
});
