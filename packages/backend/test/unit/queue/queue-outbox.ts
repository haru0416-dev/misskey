/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import * as Bull from 'bullmq';
import { eq, inArray } from 'drizzle-orm';
import { loadConfig } from '@/config.js';
import { memoizeInRequest, runInRequestScope } from '@/misc/request-scope.js';
import { clearQueue, removeQueueJob, retryQueueJob, retryQueueOutboxDeadLetter } from '@/core/queue/QueueAdminLogic.js';
import { createNotePostProcessing, NotePostProcessingUnavailableError } from '@/core/note/NotePostProcessing.js';
import {
	dispatchQueueOutbox,
	enqueueAccountDeleteCoordinatorInOutbox,
	enqueueDbJobInOutbox,
	enqueueDeliverJobInOutbox,
	enqueueInlineDbJobInOutbox,
	enqueueInlineDbJobsInOutbox,
	getQueueOutboxStats,
	publishDbOutboxRowEagerly,
	releaseDbOutboxJobs,
	runInlineDbOutboxJobs,
	runQueuedDbOutboxJob,
	waitForDbOutboxJob,
} from '@/core/queue/QueueOutboxStore.js';
import { queueOutbox } from '@/db/schema/queue-outbox.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
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
		const running = runInlineDbOutboxJobs(runtime.db, [inlineJob], async () => {
			taskStarted();
			await taskFinished;
		});

		await started;
		expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(0);
		expect(await runtime.dbQueue.getJob(`outbox-${inlineJob.outboxId}`)).toBeUndefined();
		finishTask();
		await expect(running).resolves.toEqual(new Set([inlineJob.outboxId]));
		expect(await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, inlineJob.outboxId))).toHaveLength(0);
	});

	test('a stale inline owner cannot execute or release a replacement lease', async () => {
		const original = await enqueueInlineDbJobInOutbox(
			runtime.db,
			'deleteAccount',
			{ user: { id: 'queue-outbox-stale-owner' }, soft: true },
			{ removeOnComplete: true },
		);
		const replacement = { ...original, leaseToken: genId() };
		await runtime.db
			.update(queueOutbox)
			.set({
				leaseToken: replacement.leaseToken,
				leaseExpiresAt: new Date(0),
			})
			.where(eq(queueOutbox.id, original.outboxId));
		let executions = 0;
		try {
			expect(
				await runInlineDbOutboxJobs(runtime.db, [original], async () => {
					executions++;
				}),
			).toEqual(new Set());
			await releaseDbOutboxJobs(runtime.db, [original], new Error('stale failure'));
			const [owned] = await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, original.outboxId));
			expect(owned).toMatchObject({ state: 'publishing', leaseToken: replacement.leaseToken, lastError: null });
			expect(
				await runInlineDbOutboxJobs(runtime.db, [replacement], async () => {
					executions++;
				}),
			).toEqual(new Set([replacement.outboxId]));
			expect(executions).toBe(1);
		} finally {
			await runtime.db.delete(queueOutbox).where(eq(queueOutbox.id, original.outboxId));
		}
	});

	test('later inline failure rolls back earlier SQL and releases every owned job for recovery', async () => {
		const jobs = await enqueueInlineDbJobsInOutbox(
			runtime.db,
			'deleteAccount',
			[
				{ user: { id: 'queue-outbox-inline-failure-first' }, soft: true },
				{ user: { id: 'queue-outbox-inline-failure-second' }, soft: true },
			],
			{ removeOnComplete: true },
		);
		let childId: string | undefined;
		try {
			await expect(
				runInlineDbOutboxJobs(runtime.db, jobs, async (db, ownedIds) => {
					for (const job of jobs) {
						if (!ownedIds.has(job.outboxId)) continue;
						if (childId != null) throw new Error('expected inline failure');
						childId = await enqueueDbJobInOutbox(
							db,
							'deleteAccount',
							{ user: { id: 'queue-outbox-rolled-back-child' }, soft: true },
							{ removeOnComplete: true },
						);
					}
				}),
			).rejects.toThrow('expected inline failure');
			expect(await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, childId!))).toEqual([]);
			for (const job of jobs) {
				const [released] = await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, job.outboxId));
				expect(released).toMatchObject({
					state: 'ready',
					leaseToken: null,
					leaseExpiresAt: null,
					lastError: { message: 'expected inline failure' },
					revision: 1,
				});
			}
			expect(await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue)).toBe(2);
			for (const [index, job] of jobs.entries()) {
				expect((await runtime.dbQueue.getJob(`outbox-${job.outboxId}`))?.data).toEqual({
					user: { id: `queue-outbox-inline-failure-${index === 0 ? 'first' : 'second'}` },
					soft: true,
				});
			}
		} finally {
			for (const job of jobs) await (await runtime.dbQueue.getJob(`outbox-${job.outboxId}`))?.remove();
			await runtime.db.delete(queueOutbox).where(
				inArray(
					queueOutbox.id,
					jobs.map((job) => job.outboxId),
				),
			);
		}
	});

	test('a mixed-owner batch executes only owned inputs in their requested order', async () => {
		const jobs = await Promise.all(
			['first', 'second', 'third'].map(
				async (suffix) =>
					await enqueueInlineDbJobInOutbox(
						runtime.db,
						'deleteAccount',
						{ user: { id: `queue-outbox-mixed-${suffix}` }, soft: true },
						{ removeOnComplete: true },
					),
			),
		);
		const replacement = { ...jobs[1]!, leaseToken: jobs[0]!.leaseToken };
		await runtime.db
			.update(queueOutbox)
			.set({ leaseToken: replacement.leaseToken })
			.where(eq(queueOutbox.id, replacement.outboxId));
		const inputs = [jobs[2]!, jobs[1]!, jobs[0]!];
		const executions: string[] = [];
		try {
			const owned = await runInlineDbOutboxJobs(runtime.db, inputs, async (_db, ownedIds) => {
				for (const job of inputs) {
					if (ownedIds.has(job.outboxId)) executions.push(job.outboxId);
				}
			});
			expect(executions).toEqual([jobs[2]!.outboxId, jobs[0]!.outboxId]);
			expect(owned).toEqual(new Set(executions));
			await releaseDbOutboxJobs(runtime.db, jobs, new Error('stale batch failure'));
			const remaining = await runtime.db
				.select()
				.from(queueOutbox)
				.where(
					inArray(
						queueOutbox.id,
						jobs.map((job) => job.outboxId),
					),
				);
			expect(remaining).toMatchObject([
				{ id: replacement.outboxId, state: 'publishing', leaseToken: replacement.leaseToken, lastError: null },
			]);
		} finally {
			await runtime.db.delete(queueOutbox).where(
				inArray(
					queueOutbox.id,
					jobs.map((job) => job.outboxId),
				),
			);
		}
	});

	test('inline execution and release failures both survive while SQL deletion rolls back', async () => {
		const job = await enqueueInlineDbJobInOutbox(
			runtime.db,
			'deleteAccount',
			{ user: { id: 'queue-outbox-release-failure' }, soft: true },
			{ removeOnComplete: true },
		);
		const executionError = new Error('inline callback failed');
		const releaseError = new Error('release connection failed');
		const release = vi.spyOn(runtime.db, 'update').mockImplementationOnce(() => {
			throw releaseError;
		});
		try {
			const error = await runInlineDbOutboxJobs(runtime.db, [job], async () => {
				throw executionError;
			}).catch((error: unknown) => error);
			expect(error).toBeInstanceOf(AggregateError);
			expect((error as AggregateError).errors).toEqual([executionError, releaseError]);
			expect((error as AggregateError).cause).toBe(releaseError);
			const [remaining] = await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, job.outboxId));
			expect(remaining).toMatchObject({ state: 'publishing', leaseToken: job.leaseToken, lastError: null });
		} finally {
			release.mockRestore();
			await runtime.db.delete(queueOutbox).where(eq(queueOutbox.id, job.outboxId));
		}
	});

	test('removed accepted fanout is recovered, and a waiter only succeeds after execution', async () => {
		const data = {
			noteId: genId(),
			stage: 'fanout' as const,
			silent: false,
			mentionedUserIds: [],
			reply: null,
			renote: null,
		};
		const outboxId = await enqueueDbJobInOutbox(runtime.db, 'notePostCreate', data, { removeOnComplete: true });
		const marker = `outbox-executed:${outboxId}`;
		let worker: Bull.Worker | undefined;
		try {
			await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue);
			await removeQueueJob(runtime, 'db', `outbox-${outboxId}`);
			let settled = false;
			const waiting = waitForDbOutboxJob(runtime.db, runtime.dbQueue, outboxId).finally(() => {
				settled = true;
			});
			await delay(75);
			expect(settled).toBe(false);
			expect(await runtime.redis.get(marker)).toBeNull();
			await runtime.db
				.update(queueOutbox)
				.set({ availableAt: new Date(0) })
				.where(eq(queueOutbox.id, outboxId));
			await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue);
			worker = new Bull.Worker(
				QUEUE.DB,
				async (job) => {
					await runQueuedDbOutboxJob(
						runtime.db,
						job.id!,
						async () => {
							await runtime.redis.set(marker, 'executed');
						},
						true,
					);
				},
				baseWorkerOptions(runtime.config, QUEUE.DB),
			);
			await waiting;
			expect(await runtime.redis.get(marker)).toBe('executed');
		} finally {
			await worker?.close();
			await (await runtime.dbQueue.getJob(`outbox-${outboxId}`))?.remove();
			await runtime.db.delete(queueOutbox).where(eq(queueOutbox.id, outboxId));
			await runtime.redis.del(marker);
		}
	});

	test('failed retention and admin clean cannot erase the failure or its retry payload', async () => {
		const data = {
			noteId: genId(),
			stage: 'antennas' as const,
			silent: false,
			mentionedUserIds: [],
			reply: null,
			renote: null,
		};
		const outboxId = await enqueueDbJobInOutbox(runtime.db, 'notePostCreate', data, {
			removeOnComplete: true,
			removeOnFail: true,
		});
		let worker = new Bull.Worker(
			QUEUE.DB,
			async (job) => {
				await runQueuedDbOutboxJob(
					runtime.db,
					job.id!,
					async () => {
						throw new Error('antenna execution failed');
					},
					true,
				);
			},
			baseWorkerOptions(runtime.config, QUEUE.DB),
		);
		try {
			await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue);
			await vi.waitFor(async () => {
				const [row] = await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, outboxId));
				expect(row?.state).toBe('deadLetter');
			});
			await worker.close();
			await clearQueue(runtime, 'db', 'failed');
			await expect(waitForDbOutboxJob(runtime.db, runtime.dbQueue, outboxId)).rejects.toThrow(
				'antenna execution failed',
			);
			const [failed] = await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.id, outboxId));
			expect(failed?.data).toEqual(data);
			expect(await retryQueueOutboxDeadLetter(runtime, outboxId, failed!.revision)).toBe(true);
			let executedNote: string | undefined;
			worker = new Bull.Worker(
				QUEUE.DB,
				async (job) => {
					await runQueuedDbOutboxJob(
						runtime.db,
						job.id!,
						async () => {
							executedNote = job.data.noteId;
						},
						true,
					);
				},
				baseWorkerOptions(runtime.config, QUEUE.DB),
			);
			await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue);
			await waitForDbOutboxJob(runtime.db, runtime.dbQueue, outboxId);
			expect(executedNote).toBe(data.noteId);
		} finally {
			await worker.close();
			await (await runtime.dbQueue.getJob(`outbox-${outboxId}`))?.remove();
			await runtime.db.delete(queueOutbox).where(eq(queueOutbox.id, outboxId));
		}
	});

	test('a missing or expired execution outcome is never acknowledged as success', async () => {
		await expect(waitForDbOutboxJob(runtime.db, runtime.dbQueue, genId())).rejects.toThrow(
			'execution outcome is unavailable',
		);
		const outboxId = await enqueueDbJobInOutbox(
			runtime.db,
			'notePostCreate',
			{ noteId: genId(), stage: 'fanout', silent: false, mentionedUserIds: [], reply: null, renote: null },
			{ removeOnComplete: true },
		);
		try {
			await runQueuedDbOutboxJob(runtime.db, `outbox-${outboxId}`, async () => {}, true);
			await runtime.db
				.update(queueOutbox)
				.set({ availableAt: new Date(0) })
				.where(eq(queueOutbox.id, outboxId));
			await dispatchQueueOutbox(runtime.db, runtime.dbQueue, runtime.deliverQueue);
			await expect(waitForDbOutboxJob(runtime.db, runtime.dbQueue, outboxId)).rejects.toThrow(
				'execution outcome is unavailable',
			);
		} finally {
			await runtime.db.delete(queueOutbox).where(eq(queueOutbox.id, outboxId));
		}
	});

	test('bounded reservations cancel waiting producers and drain accepted work after failure', async () => {
		const blocked = Promise.withResolvers<void>();
		const started = Promise.withResolvers<void>();
		const abort = new AbortController();
		const errors: unknown[] = [];
		const lifecycle = createNotePostProcessing((error) => errors.push(error));
		const completed: number[] = [];
		const failure = new Error('accepted task failed');
		let active = 0;
		let peakActive = 0;
		let closed = false;
		let cancelledProducerRan = false;
		try {
			for (let index = 0; index < 64; index++) {
				await lifecycle.runProducer(async (reservation) => {
					reservation.submit(async () => {
						active++;
						peakActive = Math.max(peakActive, active);
						if (index < 2) {
							await memoizeInRequest('parallel-post-scope', async () => index);
							if (index === 1) started.resolve();
							await blocked.promise;
							expect(await memoizeInRequest('parallel-post-scope', async () => -1)).toBe(index);
						}
						completed.push(index);
						active--;
						if (index === 0) throw failure;
					});
				});
			}
			await started.promise;
			const waiting = Array.from({ length: 64 }, () =>
				lifecycle.runProducer(async () => {
					cancelledProducerRan = true;
				}, abort.signal),
			);
			const cancelled = Promise.allSettled(waiting);
			await expect(
				lifecycle.runProducer(async () => {
					cancelledProducerRan = true;
				}),
			).rejects.toMatchObject({ reason: 'overloaded' });
			expect(completed).toEqual([]);
			expect(cancelledProducerRan).toBe(false);
			const cancellation = new Error('caller cancelled');
			abort.abort(cancellation);
			expect(await cancelled).toEqual(Array.from({ length: 64 }, () => ({ status: 'rejected', reason: cancellation })));
			const closing = lifecycle.close().then(() => {
				closed = true;
			});
			await Promise.resolve();
			expect(closed).toBe(false);
			await expect(
				lifecycle.runProducer(async () => {
					cancelledProducerRan = true;
				}),
			).rejects.toBeInstanceOf(NotePostProcessingUnavailableError);
			blocked.resolve();
			await closing;
			expect(completed.toSorted((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, index) => index));
			expect(peakActive).toBe(2);
			expect(errors).toEqual([failure]);
			expect(cancelledProducerRan).toBe(false);
		} finally {
			abort.abort();
			blocked.resolve();
			await lifecycle.close();
		}
	});

	test('shutdown waits for a reserved producer to submit or fail before releasing dependencies', async () => {
		const entered = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const lifecycle = createNotePostProcessing(() => {});
		let completed = false;
		let closed = false;
		const producer = lifecycle.runProducer(async (reservation) => {
			entered.resolve();
			await release.promise;
			reservation.submit(async () => {
				completed = true;
			});
		});
		await entered.promise;
		const closing = lifecycle.close().then(() => {
			closed = true;
		});
		try {
			await Promise.resolve();
			expect(closed).toBe(false);
		} finally {
			release.resolve();
			await producer;
			await closing;
		}
		expect(completed).toBe(true);
		const failed = createNotePostProcessing(() => {});
		const validationError = new Error('producer validation failed');
		await expect(
			failed.runProducer(async () => {
				throw validationError;
			}),
		).rejects.toBe(validationError);
		await failed.close();
	});

	test('error-reporting failure stops admission but still drains accepted work', async () => {
		const taskError = new Error('task failed');
		const reportError = new Error('reporting failed');
		let reportedScope: Promise<string> | undefined;
		const lifecycle = createNotePostProcessing(() => {
			reportedScope = memoizeInRequest('post-processing-error-scope', async () => 'runtime-context');
			throw reportError;
		});
		let completed = false;
		await runInRequestScope(async () => {
			await memoizeInRequest('post-processing-error-scope', async () => 'http-context');
			await Promise.all([
				lifecycle.runProducer(async (reservation) => {
					reservation.submit(async () => {
						throw taskError;
					});
				}),
				lifecycle.runProducer(async (reservation) => {
					reservation.submit(async () => {
						completed = true;
					});
				}),
			]);
		});
		const error = await lifecycle.close().catch((error: unknown) => error);
		expect(completed).toBe(true);
		expect(await reportedScope).toBe('runtime-context');
		expect(error).toBeInstanceOf(AggregateError);
		expect(((error as AggregateError).errors[0] as AggregateError).errors).toEqual([taskError, reportError]);
		await expect(lifecycle.runProducer(async () => {})).rejects.toBeInstanceOf(NotePostProcessingUnavailableError);
	});

	test('retains delivery until queue completion is reconciled', async () => {
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

		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(Date.now() - 1000);
		try {
			await publishDbOutboxRowEagerly(runtime.db, runtime.dbQueue, outboxId);
		} finally {
			vi.useRealTimers();
		}

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
		// 500 件を超える backlog でも、1 周の発行件数を上限内に保つ。
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
