/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createBackgroundExecutionScope, runInRequestScope } from '@/misc/request-scope.js';

export interface NotePostProcessingReservation {
	submit(task: () => Promise<void>): void;
}

export interface NotePostProcessing {
	runProducer<T>(
		producer: (reservation: NotePostProcessingReservation) => Promise<T>,
		signal?: AbortSignal,
	): Promise<T>;
	close(): Promise<void>;
}

export class NotePostProcessingUnavailableError extends Error {
	constructor(readonly reason: 'closing' | 'overloaded') {
		super(`Post-create admission is ${reason}`);
	}
}

const MAX_RETAINED_POSTS = 64;
const MAX_WAITING_PRODUCERS = 64;
const MAX_ACTIVE_POSTS = 2;
type Reservation = NotePostProcessingReservation & { release(): void; waited: boolean };
type WaitingProducer = {
	resolve: (reservation: Reservation) => void;
	reject: (error: unknown) => void;
	signal: AbortSignal | undefined;
	abort: () => void;
};

/** 受付予約・待機・実行を分け、保存前の待機中には DB 資源を保持しない。 */
export function createNotePostProcessing(onError: (error: unknown) => void): NotePostProcessing {
	const runTask = createBackgroundExecutionScope();
	const tasks = new Array<(() => Promise<void>) | undefined>(MAX_RETAINED_POSTS);
	const waiting = new Set<WaitingProducer>();
	const reportingFailures: unknown[] = [];
	let accepting = true;
	let retained = 0;
	let queued = 0;
	let first = 0;
	let next = 0;
	let running = 0;
	let closing: ReturnType<typeof Promise.withResolvers<void>> | undefined;

	function finishClose(): void {
		if (closing == null || retained !== 0 || running !== 0) return;
		if (reportingFailures.length > 0) {
			closing.reject(
				new AggregateError(reportingFailures, 'Post-create error reporting failed', {
					cause: reportingFailures[0],
				}),
			);
		} else {
			closing.resolve();
		}
	}

	function stopAdmission(): void {
		accepting = false;
		for (const producer of waiting) {
			producer.signal?.removeEventListener('abort', producer.abort);
			producer.reject(new NotePostProcessingUnavailableError('closing'));
		}
		waiting.clear();
	}

	function reservation(waited: boolean): Reservation {
		retained++;
		let submitted = false;
		let released = false;
		return {
			waited,
			submit(task) {
				if (submitted || released) throw new Error('Post-create reservation is already settled');
				submitted = true;
				tasks[next] = task;
				next = (next + 1) % MAX_RETAINED_POSTS;
				queued++;
				startWorkers();
			},
			release() {
				if (submitted || released) return;
				released = true;
				retained--;
				admitWaiting();
				finishClose();
			},
		};
	}

	function admitWaiting(): void {
		if (!accepting) return;
		while (retained < MAX_RETAINED_POSTS && waiting.size > 0) {
			const producer = waiting.values().next().value!;
			waiting.delete(producer);
			producer.signal?.removeEventListener('abort', producer.abort);
			if (producer.signal?.aborted) producer.reject(producer.signal.reason);
			else producer.resolve(reservation(true));
		}
	}

	function reserve(signal?: AbortSignal): Promise<Reservation> {
		if (signal?.aborted) return Promise.reject(signal.reason);
		if (!accepting) return Promise.reject(new NotePostProcessingUnavailableError('closing'));
		if (retained < MAX_RETAINED_POSTS && waiting.size === 0) return Promise.resolve(reservation(false));
		if (waiting.size === MAX_WAITING_PRODUCERS)
			return Promise.reject(new NotePostProcessingUnavailableError('overloaded'));
		const { promise, resolve, reject } = Promise.withResolvers<Reservation>();
		const producer: WaitingProducer = {
			resolve,
			reject,
			signal,
			abort() {
				if (waiting.delete(producer)) {
					signal?.removeEventListener('abort', producer.abort);
					reject(signal!.reason);
				}
			},
		};
		waiting.add(producer);
		signal?.addEventListener('abort', producer.abort, { once: true });
		if (signal?.aborted) producer.abort();
		return promise;
	}

	function takeTask(): () => Promise<void> {
		const task = tasks[first]!;
		tasks[first] = undefined;
		first = (first + 1) % MAX_RETAINED_POSTS;
		queued--;
		return task;
	}

	function startWorkers(): void {
		while (running < MAX_ACTIVE_POSTS && queued > 0) {
			const task = takeTask();
			running++;
			void runTask(() => Promise.resolve().then(() => drain(task)));
		}
	}

	async function drain(task: () => Promise<void>): Promise<void> {
		try {
			for (;;) {
				try {
					await runTask(task);
				} catch (error) {
					try {
						onError(error);
					} catch (reportError) {
						stopAdmission();
						reportingFailures.push(
							new AggregateError([error, reportError], 'Post-create execution and error reporting failed', {
								cause: reportError,
							}),
						);
					}
				} finally {
					retained--;
					admitWaiting();
				}
				if (queued === 0) break;
				task = takeTask();
			}
		} finally {
			running--;
			finishClose();
		}
	}

	return {
		async runProducer(producer, signal) {
			const slot = await reserve(signal);
			try {
				signal?.throwIfAborted();
				// 受付待機で古くなった request memo を、その後の検査へ持ち越さない。
				return await (slot.waited ? runInRequestScope(() => producer(slot)) : producer(slot));
			} finally {
				slot.release();
			}
		},
		close() {
			if (closing != null) return closing.promise;
			closing = Promise.withResolvers<void>();
			stopAdmission();
			finishClose();
			return closing.promise;
		},
	};
}
