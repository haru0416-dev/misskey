/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import policy from './preregistration.json' with { type: 'json' };
import type { Workload } from './scenarios.mjs';
import type { Sample } from './observe.mjs';

export type Identity = {
	processes: { pid: number; version: string }[];
	revision: string;
	lockSha256: string;
	configSha256: string;
	buildSha256: string;
	clockTicksPerSecond: number;
};
export type RecordedSample = Sample & {
	observerTiming?: {
		startedMonotonicMs: number;
		completedMonotonicMs: number;
		requests: {
			source: 'timer' | 'drain' | 'baseline' | 'final';
			scheduledMonotonicMs: number;
			requestedMonotonicMs: number;
			missedIntervals: number;
		}[];
	};
};
export type Run = {
	id: string;
	round: number;
	label: 'before' | 'after';
	condition: 'cold' | 'warm';
	state: 'pending' | 'running' | 'passed' | 'known-failure' | 'failed';
	stage: string;
	workload: Workload;
	samples: RecordedSample[];
	commands: { kind: string; code: number | null; stdout: string; stderr: string; durationMs: number }[];
	identity?: Identity;
	error?: string;
	shutdownMs?: number;
	startedAt?: string;
	endedAt?: string;
};
export type RunRecord = Omit<Run, 'workload' | 'samples' | 'commands'> & { journalSha256?: string };

type Append<T> = { start: number; values: T[] };
type Checkpoint = {
	type: 'checkpoint';
	metadata?: RunRecord;
	requests?: (Append<Workload['requests'][string][number]> & { name: string })[];
	correctness?: Append<Workload['correctness'][number]>;
	completion?: Append<Workload['completion'][number]>;
	samples?: Append<RecordedSample> & { reset: boolean };
	commands?: { index: number; value: Run['commands'][number] }[];
};

export function runRecord(run: Run): RunRecord {
	const { workload, samples, commands, ...record } = run;
	return record;
}

export async function openRunRecording(
	path: string,
	run: Run,
): Promise<{
	persist(): Promise<RunRecord | undefined>;
	setBuffering(enabled: boolean): Promise<void>;
	close(): Promise<string>;
}> {
	assert.ok(
		Number.isSafeInteger(policy.maximumBufferedJournalBytes) && policy.maximumBufferedJournalBytes > 0,
		'Invalid journal buffer capacity',
	);
	const file = await open(path, 'ax', 0o600);
	const hash = createHash('sha256');
	let chain = Promise.resolve();
	let closing: Promise<string> | undefined;
	let buffering = false;
	let bufferedBytes = 0;
	let buffered: Buffer[] = [];
	let failure: { cause: unknown } | undefined;
	let metadataJson: string | undefined;
	const requests = new Map<string, number>();
	let correctness = 0;
	let completion = 0;
	let samples: RecordedSample[] | undefined;
	let sampleCount = 0;
	let lastSample: RecordedSample | undefined;
	let commandCount = 0;
	let lastCommand: Run['commands'][number] | undefined;

	function failed(error: unknown) {
		failure ??= { cause: error };
		return failure.cause;
	}

	function writeFrame(bytes: Buffer): Promise<void> {
		chain = chain.then(async () => {
			try {
				await file.writeFile(bytes);
				hash.update(bytes);
			} catch (error) {
				throw failed(error);
			}
		});
		return chain;
	}

	function enqueue(bytes: Buffer): Promise<void> {
		if (!buffering) return writeFrame(bytes);
		assert.ok(
			bytes.byteLength <= policy.maximumBufferedJournalBytes - bufferedBytes,
			'Run journal buffer capacity exceeded',
		);
		buffered.push(bytes);
		bufferedBytes += bytes.byteLength;
		return chain;
	}

	async function flush() {
		const frames = buffered;
		buffered = [];
		bufferedBytes = 0;
		// 既に受理したフレームは、後続の符号化失敗・容量超過があっても順序通り保存する。
		chain = chain.then(async () => {
			try {
				for (const bytes of frames) {
					await file.writeFile(bytes);
					hash.update(bytes);
				}
			} catch (error) {
				throw failed(error);
			}
		});
		await chain;
	}

	function checkpoint(): Promise<RunRecord | undefined> {
		try {
			if (failure) throw failure.cause;
			const event: Checkpoint = { type: 'checkpoint' };
			const record = runRecord(run);
			metadata(record);
			const nextMetadataJson = JSON.stringify(record);
			if (nextMetadataJson !== metadataJson) event.metadata = JSON.parse(nextMetadataJson) as RunRecord;
			for (const [name, values] of Object.entries(run.workload.requests)) {
				const start = requests.get(name) ?? 0;
				assert.ok(values.length >= start, 'Request evidence is append-only');
				if (!requests.has(name) || values.length > start) {
					(event.requests ??= []).push({ name, start, values: values.slice(start) });
				}
			}
			for (const name of requests.keys()) {
				assert.ok(Object.hasOwn(run.workload.requests, name), 'Request evidence cannot be removed');
			}
			assert.ok(run.workload.correctness.length >= correctness, 'Correctness evidence is append-only');
			assert.ok(run.workload.completion.length >= completion, 'Completion evidence is append-only');
			if (run.workload.correctness.length > correctness) {
				event.correctness = { start: correctness, values: run.workload.correctness.slice(correctness) };
			}
			if (run.workload.completion.length > completion) {
				event.completion = { start: completion, values: run.workload.completion.slice(completion) };
			}
			// 計測開始時の配列交換・空配列化は、seed の観測値を測定区間から外す。
			const reset =
				samples !== run.samples ||
				run.samples.length < sampleCount ||
				(sampleCount > 0 && run.samples[sampleCount - 1] !== lastSample);
			const sampleStart = reset ? 0 : sampleCount;
			if (reset || run.samples.length > sampleStart) {
				event.samples = { reset, start: sampleStart, values: run.samples.slice(sampleStart) };
			}
			assert.ok(run.commands.length >= commandCount, 'Commands cannot be removed');
			// 直前の command は完了時に同じオブジェクトが更新される。古い stdout は再直列化しない。
			for (let index = Math.max(0, commandCount - 1); index < run.commands.length; index++) {
				const value = run.commands[index];
				assert.ok(value, 'Missing command evidence');
				if (
					index >= commandCount ||
					!lastCommand ||
					value.kind !== lastCommand.kind ||
					value.code !== lastCommand.code ||
					value.stdout !== lastCommand.stdout ||
					value.stderr !== lastCommand.stderr ||
					value.durationMs !== lastCommand.durationMs
				) {
					(event.commands ??= []).push({ index, value });
				}
			}
			if (Object.keys(event).length === 1) return chain.then(() => undefined);
			// await より前に本文とカーソルを確定し、重なる checkpoint に同じ証拠を渡さない。
			const written = enqueue(Buffer.from(`${JSON.stringify(event)}\n`));
			metadataJson = nextMetadataJson;
			for (const entry of event.requests ?? []) requests.set(entry.name, entry.start + entry.values.length);
			correctness = run.workload.correctness.length;
			completion = run.workload.completion.length;
			samples = run.samples;
			sampleCount = samples.length;
			lastSample = samples[sampleCount - 1];
			commandCount = run.commands.length;
			if (event.commands) {
				const value = run.commands.at(-1);
				assert.ok(value, 'Missing command evidence');
				lastCommand = { ...value };
			}
			return written.then(() => event.metadata);
		} catch (error) {
			// 失敗は固定するが、既に受理したフレームの保存経路は切断しない。
			return Promise.reject(failed(error));
		}
	}

	return {
		persist() {
			if (closing) return Promise.reject(new Error('Run recording is closing or closed'));
			return checkpoint();
		},
		async setBuffering(enabled) {
			if (closing) throw new Error('Run recording is closing or closed');
			buffering = enabled;
			if (enabled) await chain;
			else await flush();
			if (failure) throw failure.cause;
		},
		close() {
			closing ??= (async () => {
				const failures: unknown[] = [];
				const capture = (error: unknown) => {
					if (!failures.includes(error)) failures.push(error);
				};
				try {
					await checkpoint();
				} catch (error) {
					capture(error);
				}
				buffering = false;
				try {
					await flush();
					if (failures.length === 0) await writeFrame(Buffer.from('{"type":"end"}\n'));
					await file.sync();
				} catch (error) {
					capture(error);
				}
				try {
					await file.close();
				} catch (error) {
					capture(error);
				}
				if (failures.length === 1) throw failures[0];
				if (failures.length > 1)
					throw new AggregateError(failures, 'Run recording flush and close failed', { cause: failures[0] });
				return hash.digest('hex');
			})();
			return closing;
		},
	};
}

function object(value: unknown): asserts value is Record<string, unknown> {
	assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected journal object');
}

function keys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
	assert.ok(
		required.every((key) => Object.hasOwn(value, key)),
		'Missing journal field',
	);
	assert.ok(
		Object.keys(value).every((key) => required.includes(key) || optional.includes(key)),
		'Unknown journal field',
	);
}

function metadata(value: unknown): asserts value is RunRecord {
	object(value);
	keys(
		value,
		['id', 'round', 'label', 'condition', 'state', 'stage'],
		['identity', 'error', 'shutdownMs', 'startedAt', 'endedAt'],
	);
	assert.ok(
		typeof value['state'] === 'string' &&
			['pending', 'running', 'passed', 'known-failure', 'failed'].includes(value['state']),
		'Invalid journal run state',
	);
	if (Object.hasOwn(value, 'identity')) object(value['identity']);
}

function append<T>(target: T[], value: unknown, extra: string[] = []) {
	object(value);
	keys(value, ['start', 'values', ...extra]);
	assert.equal(value['start'], target.length, 'Noncontiguous journal evidence');
	const values = value['values'];
	assert.ok(Array.isArray(values), 'Invalid journal evidence array');
	for (const entry of values) {
		object(entry);
		target.push(entry as T);
	}
}

export async function readRunRecording(path: string, record: RunRecord): Promise<Run> {
	const { journalSha256, ...expected } = record;
	assert.ok(
		typeof journalSha256 === 'string' && /^[a-f0-9]{64}$/.test(journalSha256),
		'Missing or invalid journal digest',
	);
	const bytes = await readFile(path);
	assert.equal(createHash('sha256').update(bytes).digest('hex'), journalSha256, 'Run journal digest mismatch');
	metadata(expected);
	const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	assert.ok(text.endsWith('\n'), 'Truncated run journal');
	const workload: Workload = { requests: {}, correctness: [], completion: [] };
	let samples: RecordedSample[] = [];
	const commands: Run['commands'] = [];
	let latest: RunRecord | undefined;
	let ended = false;
	for (const line of text.slice(0, -1).split('\n')) {
		const event: unknown = JSON.parse(line);
		object(event);
		assert.ok(!ended, 'Evidence after journal end');
		if (event['type'] === 'end') {
			keys(event, ['type']);
			assert.ok(latest, 'Missing journal metadata');
			ended = true;
			continue;
		}
		assert.equal(event['type'], 'checkpoint', 'Unknown journal event');
		keys(event, ['type'], ['metadata', 'requests', 'correctness', 'completion', 'samples', 'commands']);
		assert.ok(Object.keys(event).length > 1, 'Empty checkpoint');
		if (Object.hasOwn(event, 'metadata')) {
			const updated = event['metadata'];
			metadata(updated);
			if (latest) {
				for (const field of ['id', 'round', 'label', 'condition'] as const) {
					assert.equal(updated[field], latest[field], 'Journal run identity changed');
				}
			}
			latest = updated;
		}
		assert.ok(latest, 'Evidence before journal metadata');
		if (Object.hasOwn(event, 'requests')) {
			const groups = event['requests'];
			assert.ok(Array.isArray(groups), 'Invalid request groups');
			for (const group of groups) {
				object(group);
				assert.equal(typeof group['name'], 'string', 'Invalid request group name');
				const name = group['name'] as string;
				let outcomes = workload.requests[name];
				if (!Object.hasOwn(workload.requests, name)) {
					outcomes = [];
					Object.defineProperty(workload.requests, name, {
						value: outcomes,
						enumerable: true,
						writable: true,
						configurable: true,
					});
				}
				assert.ok(outcomes);
				append(outcomes, group, ['name']);
			}
		}
		if (Object.hasOwn(event, 'correctness')) append(workload.correctness, event['correctness']);
		if (Object.hasOwn(event, 'completion')) append(workload.completion, event['completion']);
		if (Object.hasOwn(event, 'samples')) {
			const observed = event['samples'];
			object(observed);
			assert.equal(typeof observed['reset'], 'boolean', 'Invalid samples reset');
			if (observed['reset']) samples = [];
			append(samples, observed, ['reset']);
		}
		if (Object.hasOwn(event, 'commands')) {
			const updates = event['commands'];
			assert.ok(Array.isArray(updates), 'Invalid commands');
			for (const update of updates) {
				object(update);
				keys(update, ['index', 'value']);
				const index = update['index'] as number;
				assert.ok(
					Number.isSafeInteger(index) && index >= Math.max(0, commands.length - 1) && index <= commands.length,
					'Invalid command update index',
				);
				object(update['value']);
				commands[index] = update['value'] as Run['commands'][number];
			}
		}
	}
	assert.ok(ended && latest, 'Unclosed run journal');
	assert.deepEqual(latest, expected, 'Run journal metadata mismatch');
	return { ...latest, workload, samples, commands };
}
