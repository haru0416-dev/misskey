/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { createQueueWorkers } from '@/queue/worker.js';
import { enqueueDbJobInOutbox, waitForDbOutboxJob } from '@/core/queue/QueueOutboxStore.js';
import { queueOutbox } from '@/db/schema/queue-outbox.js';
import { genId } from '@/misc/id/gen-id.js';

const handler = vi.hoisted(() => ({ run: async (): Promise<void> => {} }));
vi.mock('@/queue/handlers/post-scheduled-note.js', () => ({
	handleQueuePostScheduledNote: () => handler.run(),
}));

let runtime: RuntimeDependencies;
beforeAll(async () => {
	const config = loadConfig();
	config.valkey.jobQueue = { ...config.valkey.jobQueue, prefix: `worker-shutdown-${process.pid}` };
	runtime = await createRuntimeDependencies(config);
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
	const workers = createQueueWorkers({ ...runtime, logger: runtime.loggerService.getLogger('shutdown-test') });
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

test('stop racing initial publication does not start consumers after they close', async () => {
	const workers = createQueueWorkers({ ...runtime, logger: runtime.loggerService.getLogger('shutdown-race-test') });
	const running = workers.start();
	const stopping = workers.stop();
	expect(workers.stop()).toBe(stopping);
	await stopping;
	await running;
	expect(workers.dbQueueWorker.isRunning()).toBe(false);
});
