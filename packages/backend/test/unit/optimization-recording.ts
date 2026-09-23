/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { openRunRecording, readRunRecording, runRecord, type Run } from '../../scripts/optimization/recording.mjs';
import policy from '../../scripts/optimization/preregistration.json' with { type: 'json' };

function sample(at: string): Run['samples'][number] {
	return {
		at,
		processes: { available: false, reason: 'Process exited' },
		database: { available: false, reason: 'Database disconnected' },
		outbox: { available: false, reason: 'Outbox unavailable' },
		queues: { available: false, reason: 'Queue disconnected' },
	};
}

function createRun(): Run {
	return {
		id: 'round-1-before-cold',
		round: 1,
		label: 'before',
		condition: 'cold',
		state: 'pending',
		stage: 'seed',
		workload: { requests: {}, correctness: [], completion: [] },
		samples: [sample('2026-09-09T00:00:00.000Z')],
		commands: [],
	};
}

describe('optimization run recording', () => {
	let directory: string;
	let path: string;
	let closeRecording: (() => Promise<string>) | undefined;

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), 'optimization-recording-'));
		path = join(directory, 'run.jsonl');
	});

	afterEach(async () => {
		try {
			await closeRecording?.();
		} finally {
			closeRecording = undefined;
			await rm(directory, { recursive: true, force: true });
		}
	});

	test('replays overlapping checkpoints and a later failure without losing earlier evidence', async () => {
		const run = createRun();
		const recording = await openRunRecording(path, run);
		closeRecording = () => recording.close();
		await recording.persist();
		const seedCheckpoint = await readFile(path);
		const outcome = (index: number) => ({
			endpoint: 'notes/timeline',
			startedAt: `2026-09-09T00:00:0${index}.000Z`,
			startedMonotonicMs: index * 1000,
			durationMs: index * 11,
			status: 200,
			ok: true,
			body: [{ id: `note-${index}`, text: `本文 ${index}\n"quoted"`, reactions: { like: index } }],
		});
		const command = { kind: 'start', code: null as number | null, stdout: '', stderr: '', durationMs: 0 };
		run.state = 'running';
		run.stage = 'measure';
		run.startedAt = '2026-09-09T00:00:01.000Z';
		run.commands.push(command);
		run.samples = [sample('2026-09-09T00:00:01.000Z')];
		const timeline = [outcome(1)];
		run.workload.requests['timeline'] = timeline;
		const first = recording.persist();

		// 前の書き込みを待たずに次の観測を追加しても、各境界で取得した内容を失わない。
		command.code = 0;
		command.stdout = 'ready\n';
		command.stderr = 'diagnostic\n';
		command.durationMs = 47;
		timeline.push(outcome(2));
		run.samples.push(sample('2026-09-09T00:00:02.000Z'));
		run.workload.correctness.push({ name: 'timeline order', passed: true, evidence: ['note-2', 'note-1'] });
		run.stage = 'checks';
		const second = recording.persist();

		timeline.push(outcome(3));
		run.workload.requests['create'] = [
			{
				endpoint: 'notes/create',
				startedAt: '2026-09-09T00:00:03.500Z',
				startedMonotonicMs: 3500,
				durationMs: 53,
				status: null,
				ok: false,
				body: null,
				error: 'Connection closed',
			},
		];
		run.workload.correctness.push({ name: 'delivery', passed: false, evidence: { pending: ['note-3'] } });
		run.workload.completion.push({ name: 'timeline', durationMs: 99 });
		run.stage = 'finish-workload';
		const third = recording.persist();
		const checkpoints = await Promise.all([first, second, third]);
		expect(checkpoints.map((record) => record?.stage)).toEqual(['measure', 'checks', 'finish-workload']);
		const measuredCheckpoint = await readFile(path);

		run.state = 'failed';
		run.stage = 'shutdown';
		run.error = 'Delivery did not complete';
		run.endedAt = '2026-09-09T00:00:04.000Z';
		run.shutdownMs = 17;
		const journalSha256 = await recording.close();
		closeRecording = undefined;

		const bytes = await readFile(path);
		expect(bytes.subarray(0, seedCheckpoint.length)).toEqual(seedCheckpoint);
		expect(bytes.subarray(0, measuredCheckpoint.length)).toEqual(measuredCheckpoint);
		expect(journalSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
		expect(await readRunRecording(path, { ...runRecord(run), journalSha256 })).toEqual(run);
	});

	test('drains prior writes before buffering and flushes encoded deltas on disable and close', async () => {
		const run = createRun();
		const recording = await openRunRecording(path, run);
		closeRecording = () => recording.close();
		const initial = recording.persist();
		await recording.setBuffering(true);
		await initial;
		const initialBytes = await readFile(path);
		expect(initialBytes.toString()).toContain('"stage":"seed"');

		run.stage = 'measurement';
		run.workload.correctness.push({ name: 'body', passed: true, evidence: { text: '計測した本文' } });
		const first = recording.persist();
		run.samples.push(sample('2026-09-09T00:00:01.000Z'));
		const second = recording.persist();
		await Promise.all([first, second]);
		expect(await readFile(path)).toEqual(initialBytes);
		await expect(
			readRunRecording(path, {
				...runRecord(run),
				journalSha256: createHash('sha256').update(initialBytes).digest('hex'),
			}),
		).rejects.toThrow('Unclosed run journal');

		await recording.setBuffering(false);
		const flushed = await readFile(path);
		expect(flushed.toString()).toContain('計測した本文');
		expect(flushed.subarray(0, initialBytes.length)).toEqual(initialBytes);
		await recording.setBuffering(true);
		run.stage = 'load';
		run.workload.completion.push({ name: 'load', durationMs: 17 });
		await recording.persist();
		expect(await readFile(path)).toEqual(flushed);

		// 最後の状態変更を persist しなくても、close が差分とバッファを確定する。
		run.state = 'failed';
		run.error = 'Load stopped';
		const closing = recording.close();
		expect(recording.close()).toBe(closing);
		const journalSha256 = await closing;
		closeRecording = undefined;
		const bytes = await readFile(path);
		expect(journalSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
		expect(await readRunRecording(path, { ...runRecord(run), journalSha256 })).toEqual(run);
		await expect(recording.persist()).rejects.toThrow('closing or closed');
		await expect(recording.setBuffering(true)).rejects.toThrow('closing or closed');
	});

	test.each(['capacity', 'encoding'] as const)(
		'keeps accepted buffered evidence but refuses successful finalization after %s failure',
		async (kind) => {
			const run = createRun();
			const recording = await openRunRecording(path, run);
			closeRecording = () => recording.close();
			await recording.persist();
			const initial = await readFile(path);
			await recording.setBuffering(true);
			run.workload.correctness.push({ name: 'accepted', passed: true, evidence: 'retained before failure' });
			await recording.persist();
			run.workload.correctness.push({
				name: 'unrecordable',
				passed: false,
				evidence: kind === 'capacity' ? 'x'.repeat(policy.maximumBufferedJournalBytes) : 1n,
			});
			await expect(recording.persist()).rejects.toThrow();
			expect(await readFile(path)).toEqual(initial);

			await expect(recording.setBuffering(false)).rejects.toThrow();
			const flushed = await readFile(path);
			expect(flushed.toString()).toContain('retained before failure');
			// 後から入力を直しても、既に発生した記録失敗を成功へ変更しない。
			run.workload.correctness.at(-1)!.evidence = 'repaired';
			run.state = 'passed';
			await expect(recording.persist()).rejects.toThrow();
			await expect(recording.close()).rejects.toThrow();
			closeRecording = undefined;
			const bytes = await readFile(path);
			expect(bytes.toString()).not.toContain('"type":"end"');
			await expect(
				readRunRecording(path, {
					...runRecord(run),
					journalSha256: createHash('sha256').update(bytes).digest('hex'),
				}),
			).rejects.toThrow('Unclosed run journal');
		},
	);

	test.each(['passed', 'known-failure'] as const)(
		'refuses unfinalized evidence even when the run already says %s',
		async (state) => {
			const run = createRun();
			run.state = state;
			run.workload.correctness.push({
				name: 'upstream-recovery-listing',
				passed: state === 'passed',
				evidence: { missingIds: ['note-1'] },
			});
			run.stage = 'complete';
			const recording = await openRunRecording(path, run);
			closeRecording = () => recording.close();
			await recording.persist();

			await expect(readRunRecording(path, runRecord(run))).rejects.toThrow();

			const journalSha256 = await recording.close();
			closeRecording = undefined;
			expect(await readRunRecording(path, { ...runRecord(run), journalSha256 })).toEqual(run);
		},
	);

	test('rejects truncated, corrupted and malformed evidence after successful finalization', async () => {
		const run = createRun();
		run.state = 'passed';
		run.stage = 'complete';
		run.workload.correctness.push({ name: 'response body', passed: true, evidence: { text: 'retained body' } });
		const recording = await openRunRecording(path, run);
		closeRecording = () => recording.close();
		const journalSha256 = await recording.close();
		closeRecording = undefined;
		const record = { ...runRecord(run), journalSha256 };
		expect(await readRunRecording(path, record)).toEqual(run);
		const bytes = await readFile(path);

		await writeFile(path, bytes.subarray(0, Math.floor(bytes.length / 2)));
		await expect(readRunRecording(path, record)).rejects.toThrow();

		const corrupted = Buffer.from(bytes);
		const bodyOffset = corrupted.indexOf('retained body');
		expect(bodyOffset).toBeGreaterThanOrEqual(0);
		corrupted.set(Buffer.from('tampered body'), bodyOffset);
		await writeFile(path, corrupted);
		await expect(readRunRecording(path, record)).rejects.toThrow();

		const invalidState = 'accepted' as Run['state'];
		const malformed = Buffer.from(bytes.toString('utf8').replace('"state":"passed"', `"state":"${invalidState}"`));
		await writeFile(path, malformed);
		await expect(
			readRunRecording(path, {
				...record,
				state: invalidState,
				journalSha256: createHash('sha256').update(malformed).digest('hex'),
			}),
		).rejects.toThrow('Invalid journal run state');
	});
});
