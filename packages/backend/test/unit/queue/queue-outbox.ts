/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { loadConfig } from '@/config.js';
import { dispatchQueueOutbox, enqueueDbJobInOutbox, getQueueOutboxStats } from '@/core/QueueOutboxStore.js';
import { queueOutbox } from '@/db/schema/queue-outbox.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { genId } from '@/misc/id/gen-id.js';
import { QUEUE } from '@/queue/const.js';

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
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue)).toBe(1);
		expect(await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, outboxId))).toHaveLength(0);

		const job = await runtime.dbQueue.getJob(`outbox-${outboxId}`);
		expect(job?.name).toBe('deleteAccount');
		expect(job?.data).toEqual({ user: { id: 'queue-outbox-test-user' }, soft: true });
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue)).toBe(0);
		expect(await getQueueOutboxStats(runtime.db)).toEqual({ pending: 0, oldestPendingAgeMs: null });
		await job?.remove();
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

		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue)).toBe(100);
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue)).toBe(100);
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue)).toBe(50);
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

			expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue)).toBe(1);
			expect(await runtime.db.select().from(queueOutbox).where(inArray(queueOutbox.id, [invalidNameId, invalidDataId, invalidOptionsId, validId]))).toHaveLength(0);
			const job = await runtime.dbQueue.getJob(`outbox-${validId}`);
			expect(job?.data).toEqual({ user: { id: 'queue-outbox-after-malformed-user' }, soft: true });
			await job?.remove();
		} finally {
			await runtime.db.delete(queueOutbox).where(inArray(queueOutbox.id, [invalidNameId, invalidDataId, invalidOptionsId]));
		}
	});
});
