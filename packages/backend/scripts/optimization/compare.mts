/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { mkdir, open, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { inspect } from 'node:util';
import policy from './preregistration.json' with { type: 'json' };
import { observer, pending, type ObserverConfig } from './observe.mjs';
import {
	acceptedRecoveryListingFailure,
	scenarios,
	type Peer,
	type RecoveryProbe,
	type RecoverySnapshot,
} from './scenarios.mjs';
import {
	openRunRecording,
	readRunRecording,
	runRecord,
	type Identity,
	type Run,
	type RecordedSample,
	type RunRecord,
} from './recording.mjs';

type Command = { argv: string[]; cwd: string };
type Deployment = {
	reset: Command;
	start: Command;
	stop: Command;
	identity: Command;
	recoverySnapshot: Command;
	peers: [Peer, Peer];
	observer: ObserverConfig;
	expectedRevision: string;
};
type Config = {
	schemaVersion: 1;
	isolation: { disposable: true; markerFile: string; snapshotSha256: string };
	before: Deployment;
	after: Deployment;
};
type Experiment = {
	schemaVersion: 2;
	createdAt: string;
	host: string;
	configSha256: string;
	harnessSha256: string;
	preregistration: typeof policy;
	runs: RunRecord[];
	excludedRuns: 0;
};
const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const json = async <T,>(path: string) => JSON.parse(await readFile(path, 'utf8')) as T;
export const harnessDigest = async () => {
	const entries = await readdir(new URL('.', import.meta.url), { withFileTypes: true });
	const files = entries
		.filter((entry) => entry.isFile() && /\.(mts|json)$/.test(entry.name))
		.map((entry) => entry.name)
		.sort();
	return digest(
		(
			await Promise.all(files.map(async (file) => `${file}:${digest(await readFile(new URL(file, import.meta.url)))}`))
		).join('\n'),
	);
};
export const absoluteLimits = {
	'process.peakRssBytes': policy.adoption.maximumRssBytes,
	'database.peakConnections': policy.adoption.maximumDatabaseConnections,
	'queue.peakBacklog': policy.adoption.maximumBacklog,
	'queue.oldestPendingMs': policy.adoption.maximumOldestPendingMs,
	'shutdown.durationMs': policy.adoption.maximumShutdownMs,
};

export function metricValue(metrics: Record<string, number>, name: string): number {
	const value = metrics[name];
	assert.ok(typeof value === 'number' && Number.isFinite(value) && value >= 0, `Invalid measurement: ${name}`);
	return value;
}
let writeChain = Promise.resolve();
function save(path: string, value: unknown) {
	const data = `${JSON.stringify(value, null, 2)}\n`;
	writeChain = writeChain.then(async () => {
		await writeFile(`${path}.tmp`, data, { mode: 0o600 });
		await rename(`${path}.tmp`, path);
	});
	return writeChain;
}

async function execute(command: Command, kind: string, run: Run, persist: () => Promise<void>) {
	const result: Run['commands'][number] = { kind, code: null, stdout: '', stderr: '', durationMs: 0 };
	run.commands.push(result);
	await persist();
	const start = performance.now();
	assert.ok(Bun, 'The comparison driver requires Bun');
	const child = Bun.spawn(command.argv, {
		cwd: command.cwd,
		env: { ...process.env, OPTIMIZATION_RUN_ID: run.id },
		detached: true,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	let timedOut = false;
	const failures: unknown[] = [];
	const timeout = setTimeout(() => {
		timedOut = true;
		// snapshot などの子孫も同じ process group で終了し、timeout 後の復元継続を防ぐ。
		try {
			process.kill(-child.pid, 'SIGKILL');
		} catch (error) {
			if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) failures.push(error);
		}
	}, policy.commandTimeoutMs);
	try {
		const [stdout, stderr, exited] = await Promise.allSettled([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		if (stdout.status === 'fulfilled') result.stdout = stdout.value;
		else failures.push(stdout.reason);
		if (stderr.status === 'fulfilled') result.stderr = stderr.value;
		else failures.push(stderr.reason);
		if (exited.status === 'fulfilled') result.code = exited.value;
		else failures.push(exited.reason);
		if (timedOut || result.code !== 0)
			failures.push(new Error(`${kind} ${timedOut ? 'timed out' : `failed (${result.code})`}`));
	} catch (error) {
		failures.push(error);
	} finally {
		clearTimeout(timeout);
		result.durationMs = performance.now() - start;
		try {
			await persist();
		} catch (error) {
			failures.push(error);
		}
	}
	if (failures.length > 0)
		throw new AggregateError(failures, `${kind} command or recording failed`, { cause: failures[0] });
	return result;
}

export function validateConfig(config: Config) {
	assert.equal(config.schemaVersion, 1);
	assert.equal(config.isolation.disposable, true);
	assert.match(config.isolation.snapshotSha256, /^[a-f0-9]{64}$/);
	assert.ok(config.isolation.markerFile.startsWith('/'), 'Use an absolute disposable-environment marker path');
	for (const label of ['before', 'after'] as const) {
		const deployment = config[label];
		assert.match(deployment.expectedRevision, /^[a-f0-9]{40}$/);
		for (const command of [
			deployment.reset,
			deployment.start,
			deployment.stop,
			deployment.identity,
			deployment.recoverySnapshot,
		]) {
			assert.ok(
				command && typeof command.cwd === 'string' && Array.isArray(command.argv),
				'Invalid deployment command',
			);
			assert.ok(command.cwd.startsWith('/'));
			assert.ok(
				command.argv.length > 0 &&
					command.argv.every((argument) => typeof argument === 'string' && argument.length > 0),
			);
		}
		assert.equal(deployment.peers.length, 2);
		for (const peer of deployment.peers) {
			assert.ok(['http:', 'https:'].includes(new URL(peer.url).protocol));
			assert.ok(['fork', 'upstream'].includes(peer.kind));
		}
		assert.ok(deployment.observer.queueKeys.length >= 3, 'Observe deliver, inbox and db queues');
	}
	assert.deepEqual(
		config.before.peers,
		config.after.peers,
		'Before and after must use identical host identities and authentication environment variable names',
	);
	assert.deepEqual(config.before.observer, config.after.observer, 'Before and after must use identical observer scope');
	assert.deepEqual(
		config.before.recoverySnapshot,
		config.after.recoverySnapshot,
		'Before and after must use the identical recovery storage observer command',
	);
}

async function assertDisposable(config: Config) {
	assert.equal(
		(await readFile(config.isolation.markerFile, 'utf8')).trim(),
		`optimization-disposable:${config.isolation.snapshotSha256}`,
		'Disposable marker does not match frozen snapshot',
	);
}

async function ready(peers: [Peer, Peer]) {
	const deadline = performance.now() + policy.completionTimeoutMs;
	for (const peer of peers) {
		let lastError: unknown;
		while (performance.now() < deadline) {
			try {
				const response = await fetch(new URL('/api/meta', peer.url), {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: '{}',
					signal: AbortSignal.timeout(2000),
				});
				assert.equal(response.status, 200);
				const body: unknown = await response.json();
				assert.ok(body !== null && typeof body === 'object' && 'version' in body && typeof body.version === 'string');
				lastError = undefined;
				break;
			} catch (error) {
				lastError = error;
				await sleep(250);
			}
		}
		if (lastError || performance.now() >= deadline) throw new Error(`Server readiness failed: ${String(lastError)}`);
	}
}

export function assessCorrectness(run: Run, peer: Peer) {
	assert.ok(Array.isArray(run.workload.correctness), `${run.id}: Invalid correctness checks`);
	for (const check of run.workload.correctness) {
		assert.ok(
			check !== null &&
				typeof check === 'object' &&
				typeof check.name === 'string' &&
				typeof check.passed === 'boolean' &&
				Object.hasOwn(check, 'evidence'),
			`${run.id}: Malformed correctness check`,
		);
	}
	assert.deepEqual(run.workload.correctness.map((check) => check.name).sort(), [...policy.correctness].sort());
	const knownFailures: { runId: string; check: string; missingIds: string[]; count: number }[] = [];
	let passed = true;
	let accepted = true;
	for (const check of run.workload.correctness) {
		if (check.passed === true) continue;
		passed = false;
		const known = acceptedRecoveryListingFailure(check, peer);
		if (known) {
			knownFailures.push({
				runId: run.id,
				check: check.name,
				missingIds: known.missingIds,
				count: known.missingIds.length,
			});
		} else {
			accepted = false;
		}
	}
	return { passed, accepted, knownFailures };
}

export async function runOne(
	config: Config,
	run: Run,
	persist: () => Promise<void>,
	setBuffering: (enabled: boolean) => Promise<void>,
) {
	const deployment = config[run.label];
	run.state = 'running';
	run.startedAt = new Date().toISOString();
	let observed: ReturnType<typeof observer> | undefined;
	let sampling: Promise<void> | undefined;
	let stopSampling = false;
	const samplingFailures: unknown[] = [];
	try {
		await persist();
		run.stage = 'stop-before-reset';
		await execute(config.before.stop, 'stop-before', run, persist);
		await execute(config.after.stop, 'stop-after', run, persist);
		run.stage = 'reset';
		await assertDisposable(config);
		const reset = JSON.parse((await execute(deployment.reset, 'reset', run, persist)).stdout) as {
			snapshotSha256: string;
		};
		assert.equal(reset.snapshotSha256, config.isolation.snapshotSha256);
		run.stage = 'start';
		await execute(deployment.start, 'start', run, persist);
		await ready(deployment.peers);
		const identify = async (kind: string, prior?: Identity) => {
			const identity = JSON.parse((await execute(deployment.identity, kind, run, persist)).stdout) as Identity;
			assert.equal(identity.revision, deployment.expectedRevision);
			for (const field of [identity.lockSha256, identity.configSha256, identity.buildSha256])
				assert.match(field, /^[a-f0-9]{64}$/);
			assert.ok(
				identity.processes.length > 0 &&
					identity.processes.every((item) => Number.isSafeInteger(item.pid) && item.pid > 1 && item.version.length > 0),
			);
			assert.equal(new Set(identity.processes.map((item) => item.pid)).size, identity.processes.length);
			assert.ok(Number.isFinite(identity.clockTicksPerSecond) && identity.clockTicksPerSecond > 0);
			if (prior) {
				for (const field of ['revision', 'lockSha256', 'configSha256', 'buildSha256', 'clockTicksPerSecond'] as const)
					assert.equal(identity[field], prior[field], `Restart changed ${field}`);
				assert.deepEqual(
					identity.processes.map((item) => item.version).sort(),
					prior.processes.map((item) => item.version).sort(),
					'Restart changed runtime versions or process count',
				);
				const previousPids = new Set(prior.processes.map((item) => item.pid));
				assert.ok(
					identity.processes.every((item) => !previousPids.has(item.pid)),
					'Restart reused application PIDs',
				);
			}
			return identity;
		};
		const assertStopped = (pids: number[]) => {
			for (const pid of pids) {
				let alive = true;
				try {
					process.kill(pid, 0);
				} catch (error) {
					if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ESRCH') alive = false;
					else throw error;
				}
				assert.equal(alive, false, `Server PID ${pid} survived stop command`);
			}
		};
		let identity = await identify('identity');
		run.identity = identity;
		const pids = identity.processes.map((item) => item.pid);
		observed = observer(deployment.observer);
		type Timing = NonNullable<RecordedSample['observerTiming']>;
		let activeSample: { promise: Promise<{ value: RecordedSample; observedAt: number }>; timing: Timing } | undefined;
		const sample = (source: Timing['requests'][number]['source'], scheduledMonotonicMs = performance.now()) => {
			const request = { source, scheduledMonotonicMs, requestedMonotonicMs: performance.now(), missedIntervals: 0 };
			if (activeSample) {
				// timer と drain は各一件だけ待機し、同じ進行中の観測を共有する。
				assert.ok(activeSample.timing.requests.length < 2, 'Too many concurrent observation callers');
				activeSample.timing.requests.push(request);
				return activeSample.promise;
			}
			const timing: Timing = {
				startedMonotonicMs: performance.now(),
				completedMonotonicMs: 0,
				requests: [request],
			};
			const promise = (async () => {
				const value: RecordedSample = await observed!.sample(pids);
				const observedAt = performance.now();
				timing.completedMonotonicMs = observedAt;
				for (const entry of timing.requests) {
					entry.missedIntervals = Math.floor(
						Math.max(0, observedAt - entry.scheduledMonotonicMs) / policy.sampleIntervalMs,
					);
				}
				value.observerTiming = timing;
				run.samples.push(value);
				return { value, observedAt };
			})().finally(() => {
				activeSample = undefined;
			});
			activeSample = { promise, timing };
			return promise;
		};
		const drain = async (name: string) => {
			const start = performance.now();
			let nextAt = start;
			let consecutive = 0;
			while (performance.now() - start < policy.completionTimeoutMs) {
				const { value, observedAt } = await sample('drain', nextAt);
				consecutive = pending(value) === 0 ? consecutive + 1 : 0;
				const complete = consecutive >= policy.drainedSamples;
				if (complete) run.workload.completion.push({ name, durationMs: observedAt - start });
				await persist();
				if (complete) return;
				nextAt = performance.now() + policy.sampleIntervalMs;
				await sleep(policy.sampleIntervalMs);
			}
			throw new Error(`${name} did not drain before deadline`);
		};
		const recoveryProbe: RecoveryProbe = async (authorId) => {
			const command = {
				...deployment.recoverySnapshot,
				argv: [...deployment.recoverySnapshot.argv, authorId],
			};
			return JSON.parse((await execute(command, 'receiver-storage', run, persist)).stdout) as RecoverySnapshot;
		};
		const workload = scenarios(deployment.peers, run.workload, persist, recoveryProbe);
		run.stage = 'seed';
		await workload.seed();
		run.stage = 'common-precondition';
		await persist();
		await workload.precondition();
		await drain('seedDrain');
		if (run.condition === 'warm') {
			run.stage = 'warmup';
			await persist();
			await workload.warm();
		} else {
			run.stage = 'cold-preparation-stop';
			await execute(deployment.stop, 'cold-preparation-stop', run, persist);
			assertStopped(pids);
			run.stage = 'cold-preparation-start-without-reset';
			await execute(deployment.start, 'cold-preparation-start', run, persist);
			await ready(deployment.peers);
			identity = await identify('cold-preparation-identity', identity);
			run.identity = identity;
			pids.splice(0, pids.length, ...identity.processes.map((item) => item.pid));
		}
		run.samples = [];
		await sample('baseline');
		await persist();
		const measured = async (stage: string, action: () => Promise<void>) => {
			run.stage = stage;
			await persist();
			const failures: unknown[] = [];
			try {
				await setBuffering(true);
				await action();
			} catch (error) {
				failures.push(error);
			} finally {
				try {
					await setBuffering(false);
				} catch (error) {
					failures.push(error);
				}
			}
			if (failures.length === 1) throw failures[0];
			if (failures.length > 1)
				throw new AggregateError(failures, `${stage} workload and recording failed`, { cause: failures[0] });
		};
		sampling = (async () => {
			let nextAt = performance.now() + policy.sampleIntervalMs;
			while (true) {
				await sleep(Math.max(0, nextAt - performance.now()));
				if (stopSampling) break;
				await sample('timer', nextAt);
				await persist();
				nextAt = performance.now() + policy.sampleIntervalMs;
			}
		})().catch((error) => {
			// 未処理の rejection で finally を飛ばさず、合流時に記録失敗として扱う。
			samplingFailures.push(error);
		});
		await measured('measurement-and-correctness', () => workload.measure());
		if (samplingFailures.length > 0) throw samplingFailures[0];
		await drain('postAndFederationDrain');
		await measured('load', () => workload.load());
		stopSampling = true;
		await sampling;
		if (samplingFailures.length > 0) throw samplingFailures[0];
		await sample('final');
		await persist();
		run.stage = 'shutdown-after-load';
		const shutdown = await execute(deployment.stop, 'shutdown', run, persist);
		run.shutdownMs = shutdown.durationMs;
		assert.ok(run.shutdownMs <= policy.adoption.maximumShutdownMs, 'Shutdown deadline exceeded');
		assertStopped(pids);
		run.stage = 'restart-without-reset';
		await execute(deployment.start, 'restart', run, persist);
		await ready(deployment.peers);
		const restarted = await identify('restart-identity', identity);
		pids.splice(0, pids.length, ...restarted.processes.map((item) => item.pid));
		await drain('recoveryDrain');
		await workload.recovered();
		const correctness = assessCorrectness(run, deployment.peers[1]);
		assert.ok(correctness.accepted, 'Unaccepted correctness failure');
		run.state = correctness.passed ? 'passed' : 'known-failure';
	} catch (error) {
		run.state = 'failed';
		run.error = inspect(error, { depth: null });
	} finally {
		stopSampling = true;
		await sampling;
		if (samplingFailures.length > 0) {
			run.state = 'failed';
			run.error = `${run.error ?? ''}\nSampling: ${inspect(samplingFailures[0], { depth: null })}`;
		}
		try {
			await observed?.close();
		} catch (error) {
			run.state = 'failed';
			run.error = `${run.error ?? ''}\nObserver cleanup: ${inspect(error, { depth: null })}`;
		}
		const cleanupErrors: unknown[] = [];
		try {
			// 記録の保存に失敗しても専用サーバーを停止し、両方の失敗を残す。
			await execute(deployment.stop, 'final-stop', run, async () => {
				try {
					await persist();
				} catch (error) {
					cleanupErrors.push(error);
				}
			});
		} catch (error) {
			cleanupErrors.push(error);
		}
		if (cleanupErrors.length > 0) {
			run.state = 'failed';
			run.error = `${run.error ?? ''}\nCleanup: ${inspect(new AggregateError(cleanupErrors), { depth: null })}`;
		}
		run.endedAt = new Date().toISOString();
		await persist();
	}
}

const quantile = (values: number[], q: number): number => {
	if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0))
		throw new Error('Missing or invalid measurement');
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)]!;
};

export function compareMetric(metric: string, beforeValues: number[], afterValues: number[]) {
	assert.equal(beforeValues.length, policy.rounds);
	assert.equal(afterValues.length, policy.rounds);
	const before = quantile(beforeValues, 0.5);
	const after = quantile(afterValues, 0.5);
	const pairs = beforeValues.map((value, index) => ({
		round: index + 1,
		before: value,
		after: afterValues[index]!,
		ratio: value === 0 ? null : afterValues[index]! / value,
	}));
	const ratios = pairs.flatMap((pair) => (pair.ratio === null ? [] : [pair.ratio]));
	const medianPairedRatio = ratios.length === policy.rounds ? quantile(ratios, 0.5) : null;
	const allowed =
		1 +
		(metric.endsWith('Ms') && !metric.startsWith('process.')
			? policy.adoption.maximumLatencyRegressionFraction
			: policy.adoption.maximumResourceRegressionFraction);
	const passed =
		medianPairedRatio === null
			? pairs.every((pair) => pair.after <= pair.before * allowed)
			: medianPairedRatio <= allowed;
	return { metric, before, after, medianPairedRatio, pairs, passed };
}

export function summarizeRun(run: Run, correctness: ReturnType<typeof assessCorrectness>) {
	assert.equal(
		run.state,
		correctness.passed ? 'passed' : 'known-failure',
		`${run.id}: ${run.state} ${run.error ?? ''}`,
	);
	assert.equal(run.error, undefined, `${run.id}: Run contains an error`);
	assert.ok(correctness.accepted, `${run.id}: Unaccepted correctness failure`);
	const metrics: Record<string, number> = {};
	for (const [name, count] of Object.entries({
		posting: policy.postRequests,
		timeline: policy.timelineRequests,
		federationResponse: 1,
		load: policy.loadRequests,
	})) {
		const requests = run.workload.requests[name];
		assert.equal(requests?.length, count, `${name} outcome count`);
		assert.ok(requests.every((request) => request.ok && request.status === 200 && request.body !== null));
		metrics[`${name}.successCount`] = requests.length;
		for (const [label, q] of [
			['p50', 0.5],
			['p95', 0.95],
			['p99', 0.99],
		] as const)
			metrics[`${name}.${label}Ms`] = quantile(
				requests.map((request) => request.durationMs),
				q,
			);
	}
	for (const name of ['federationPush', 'postAndFederationDrain', 'recoveryDrain']) {
		const value = run.workload.completion.find((item) => item.name === name)?.durationMs;
		assert.ok(value !== undefined && Number.isFinite(value));
		metrics[`${name}.durationMs`] = value;
	}
	assert.ok(run.samples.length >= 2 && run.identity && run.shutdownMs !== undefined);
	let cpuTicks = 0;
	let ioBytes = 0;
	const previous = new Map<
		number,
		{ startTicks: string | undefined; cpuTicks: number; readBytes: number; writeBytes: number }
	>();
	let peakRss = 0;
	let peakConnections = 0;
	let peakBacklog = 0;
	let oldestPending = 0;
	const queueEvents = new Map<string, Map<string, string[]>>();
	for (const sample of run.samples) {
		assert.ok(
			sample.processes.available && sample.database.available && sample.outbox.available && sample.queues.available,
			'Required resource observation unavailable',
		);
		assert.ok(sample.database.value.statements.available, 'pg_stat_statements unavailable');
		const processes = sample.processes.value;
		assert.ok(processes.length > 0);
		peakRss = Math.max(
			peakRss,
			processes.reduce((sum, item) => sum + item.rssBytes, 0),
		);
		for (const item of processes) {
			const prior = previous.get(item.pid);
			if (prior && prior.startTicks === item.startTicks) {
				assert.ok(
					item.cpuTicks >= prior.cpuTicks && item.readBytes >= prior.readBytes && item.writeBytes >= prior.writeBytes,
				);
				cpuTicks += item.cpuTicks - prior.cpuTicks;
				ioBytes += item.readBytes - prior.readBytes + item.writeBytes - prior.writeBytes;
			}
			previous.set(item.pid, item);
		}
		peakConnections = Math.max(peakConnections, sample.database.value.connections.total);
		peakBacklog = Math.max(peakBacklog, pending(sample));
		for (const row of sample.outbox.value) {
			if (row.state !== 'completed') oldestPending = Math.max(oldestPending, row.oldest_ms);
		}
		for (const queue of sample.queues.value.queues)
			for (const job of queue.jobs) {
				if (!job.available) continue;
				if (job.pending && job.timestamp !== null)
					oldestPending = Math.max(oldestPending, new Date(sample.at).getTime() - job.timestamp);
			}
		for (const queue of sample.queues.value.queues) {
			const events = queueEvents.get(queue.key) ?? new Map<string, string[]>();
			for (const [id, fields] of queue.events) events.set(id, fields);
			queueEvents.set(queue.key, events);
		}
	}
	const firstDb = run.samples[0]!.database;
	const lastDb = run.samples.at(-1)!.database;
	assert.ok(
		firstDb.available && lastDb.available && firstDb.value.statements.available && lastDb.value.statements.available,
	);
	assert.deepEqual(
		firstDb.value.statements.value.info,
		lastDb.value.statements.value.info,
		'Statistics reset/eviction during run',
	);
	assert.deepEqual(
		firstDb.value.stats.stats_reset,
		lastDb.value.stats.stats_reset,
		'Database statistics reset during run',
	);
	for (const key of ['calls', 'total_exec_time', 'shared_blks_read', 'temp_blks_written']) {
		const first: number = firstDb.value.statements.value.rows.reduce((sum, row) => sum + Number(row[key]), 0);
		const last: number = lastDb.value.statements.value.rows.reduce((sum, row) => sum + Number(row[key]), 0);
		assert.ok(last >= first && Number.isFinite(last));
		metrics[`database.${key}`] = last - first;
	}
	for (const key of [
		'xact_commit',
		'xact_rollback',
		'blks_read',
		'blks_hit',
		'blk_read_time',
		'blk_write_time',
		'deadlocks',
	]) {
		const delta: number = Number(lastDb.value.stats[key]) - Number(firstDb.value.stats[key]);
		assert.ok(Number.isFinite(delta) && delta >= 0);
		metrics[`database.${key}`] = delta;
	}
	const queueWaits: number[] = [];
	let retries = 0;
	const initialQueues = run.samples[0]!.queues;
	assert.ok(initialQueues.available);
	for (const [key, events] of queueEvents) {
		const initialIds: Set<string> = new Set(
			initialQueues.value.queues.find((queue) => queue.key === key)?.events.map(([id]) => id),
		);
		const firstId: string | undefined = initialIds.values().next().value;
		if (firstId)
			for (const sample of run.samples) {
				assert.ok(sample.queues.available);
				assert.ok(
					sample.queues.value.queues.find((queue) => queue.key === key)?.events.some(([id]) => id === firstId),
					'Queue event history was trimmed during the run',
				);
			}
		const waiting = new Map<string, number>();
		const activations = new Map<string, number>();
		for (const [id, fields] of [...events].sort(
			([a], [b]) =>
				Number(a.split('-')[0]) - Number(b.split('-')[0]) || Number(a.split('-')[1]) - Number(b.split('-')[1]),
		)) {
			if (initialIds.has(id)) continue;
			const event = Object.fromEntries(
				Array.from({ length: fields.length / 2 }, (_, index) => [fields[index * 2], fields[index * 2 + 1]]),
			);
			const time = Number(id.split('-')[0]);
			if (event.event === 'waiting') waiting.set(event.jobId, time);
			if (event.event === 'active') {
				const queued = waiting.get(event.jobId);
				assert.ok(
					queued !== undefined,
					'Active queue event has no observed waiting transition; event history may have been trimmed',
				);
				queueWaits.push(time - queued);
				activations.set(event.jobId, (activations.get(event.jobId) ?? 0) + 1);
			}
		}
		retries += [...activations.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
	}
	metrics['queue.waitP95Ms'] = quantile(queueWaits, 0.95);
	metrics['queue.recordedRetries'] = retries;
	assert.ok(metricValue(metrics, 'database.calls') > 0, 'No application SQL observed');
	metrics['process.cpuMs'] = (cpuTicks * 1000) / run.identity.clockTicksPerSecond;
	metrics['process.ioBytes'] = ioBytes;
	metrics['process.peakRssBytes'] = peakRss;
	metrics['database.peakConnections'] = peakConnections;
	metrics['queue.peakBacklog'] = peakBacklog;
	metrics['queue.oldestPendingMs'] = oldestPending;
	metrics['shutdown.durationMs'] = run.shutdownMs;
	assert.ok(peakRss > 0, 'No process RSS observed');
	return metrics;
}

async function main() {
	assert.ok(Bun, 'The comparison driver requires Bun');
	const [mode, configArgument, directoryArgument] = Bun.argv.slice(2);
	if (!mode || !['prepare', 'run', 'report'].includes(mode) || !configArgument || !directoryArgument)
		throw new Error(
			'Usage: bun packages/backend/scripts/optimization/compare.mts prepare|run|report CONFIG.json EXPERIMENT_DIR',
		);
	const configPath = resolve(configArgument);
	const directory = resolve(directoryArgument);
	const configBytes = await readFile(configPath);
	const config = JSON.parse(configBytes.toString()) as Config;
	validateConfig(config);
	const path = join(directory, 'experiment.json');
	const planned: RunRecord[] = [];
	for (let round = 1; round <= policy.rounds; round++)
		for (const condition of (round % 2 ? policy.conditions : [...policy.conditions].reverse()) as ('cold' | 'warm')[])
			for (const label of (round % 2 ? ['before', 'after'] : ['after', 'before']) as ('before' | 'after')[])
				planned.push({
					id: `${round}-${condition}-${label}`,
					round,
					label,
					condition,
					state: 'pending',
					stage: 'planned',
				});
	if (mode === 'prepare') {
		await mkdir(directory, { recursive: false, mode: 0o700 });
		await mkdir(join(directory, 'runs'), { mode: 0o700 });
		const experiment: Experiment = {
			schemaVersion: 2,
			createdAt: new Date().toISOString(),
			host: hostname(),
			configSha256: digest(configBytes),
			harnessSha256: await harnessDigest(),
			preregistration: policy,
			runs: planned,
			excludedRuns: 0,
		};
		await save(path, experiment);
		console.log(`Preregistered ${planned.length} runs in ${path}`);
		return;
	}
	const experiment = await json<Experiment>(path);
	assert.equal(experiment.schemaVersion, 2);
	assert.equal(experiment.configSha256, digest(configBytes), 'Config changed after preregistration');
	assert.equal(experiment.harnessSha256, await harnessDigest(), 'Harness changed after preregistration');
	assert.deepEqual(experiment.preregistration, policy);
	assert.equal(experiment.host, hostname());
	assert.deepEqual(
		experiment.runs.map(({ id, round, label, condition }) => ({ id, round, label, condition })),
		planned.map(({ id, round, label, condition }) => ({ id, round, label, condition })),
		'Run identities and order must match the complete preregistered schedule',
	);
	if (mode === 'run') {
		await assertDisposable(config);
		assert.ok(
			experiment.runs.every((run) => run.state === 'pending'),
			'Never resume or overwrite failed/partial comparisons; preserve this directory and preregister a new one',
		);
		const lockPath = '/tmp/misskey-optimization-host.lock';
		const lock = await open(lockPath, 'wx', 0o600);
		try {
			await lock.writeFile(JSON.stringify({ pid: process.pid, host: hostname(), directory }));
			for (let index = 0; index < experiment.runs.length; index++) {
				const run: Run = {
					...experiment.runs[index]!,
					workload: { requests: {}, correctness: [], completion: [] },
					samples: [],
					commands: [],
				};
				const recording = await openRunRecording(join(directory, 'runs', `${run.id}.jsonl`), run);
				let buffering = false;
				try {
					await runOne(
						config,
						run,
						async () => {
							const metadata = await recording.persist();
							if (metadata) {
								experiment.runs[index] = metadata;
								if (!buffering) await save(path, experiment);
							}
						},
						async (enabled) => {
							if (enabled) {
								buffering = true;
								await writeChain;
								await recording.setBuffering(true);
							} else {
								try {
									await recording.setBuffering(false);
								} finally {
									buffering = false;
								}
								await save(path, experiment);
							}
						},
					);
				} catch (error) {
					run.state = 'failed';
					run.error = `${run.error ?? ''}\nRunner: ${inspect(error, { depth: null })}`;
				} finally {
					let journalSha256: string | undefined;
					try {
						journalSha256 = await recording.close();
					} catch (error) {
						run.state = 'failed';
						run.error = `${run.error ?? ''}\nRecording: ${inspect(error, { depth: null })}`;
					}
					experiment.runs[index] = { ...runRecord(run), ...(journalSha256 === undefined ? {} : { journalSha256 }) };
					await save(path, experiment);
				}
			}
		} finally {
			await lock.close();
			await unlink(lockPath);
		}
		if (experiment.runs.some((run) => run.state !== 'passed' && run.state !== 'known-failure')) process.exitCode = 1;
		return;
	}
	const result = {
		eligible: false,
		correctness: {
			passed: false,
			accepted: false,
			knownFailures: [] as { runId: string; check: string; missingIds: string[]; count: number }[],
			planned: experiment.runs.length,
			failed: experiment.runs
				.filter((run) => run.state !== 'passed')
				.map((run) => ({ id: run.id, state: run.state, error: run.error })),
			excludedRuns: experiment.excludedRuns,
		},
		measurements: [] as { id: string; metrics: Record<string, number> }[],
		limits: [] as { id: string; metric: string; observed: number; maximum: number; passed: boolean }[],
		comparisons: [] as {
			condition: string;
			metric: string;
			before: number;
			after: number;
			medianPairedRatio: number | null;
			pairs: { round: number; before: number; after: number; ratio: number | null }[];
			passed: boolean;
		}[],
		rejection: '',
	};
	try {
		const runs: Run[] = [];
		const failures: unknown[] = [];
		let rawPassed = true;
		let accepted = true;
		for (const record of experiment.runs) {
			let run: Run;
			let correctness: ReturnType<typeof assessCorrectness>;
			try {
				run = await readRunRecording(join(directory, 'runs', `${record.id}.jsonl`), record);
				runs.push(run);
				correctness = assessCorrectness(run, config[run.label].peers[1]);
				result.correctness.knownFailures.push(...correctness.knownFailures);
				rawPassed &&= correctness.passed && run.state === 'passed' && run.error === undefined;
				accepted &&=
					correctness.accepted &&
					run.state === (correctness.passed ? 'passed' : 'known-failure') &&
					run.error === undefined;
			} catch (error) {
				rawPassed = false;
				accepted = false;
				failures.push(error);
				continue;
			}
			try {
				result.measurements.push({ id: run.id, metrics: summarizeRun(run, correctness) });
			} catch (error) {
				failures.push(error);
			}
		}
		result.correctness.passed = rawPassed;
		result.correctness.accepted = accepted;
		if (failures.length > 0)
			throw new AggregateError(failures, inspect(failures, { depth: null }), { cause: failures[0] });
		assert.equal(
			new Set(runs.map((run) => run.identity!.processes.map((item) => item.version).join(','))).size,
			1,
			'Runtime versions differ',
		);
		assert.equal(new Set(runs.map((run) => run.identity!.configSha256)).size, 1, 'Application configurations differ');
		for (const label of ['before', 'after'])
			for (const field of ['buildSha256', 'lockSha256'] as const) {
				assert.equal(
					new Set(runs.filter((run) => run.label === label).map((run) => run.identity![field])).size,
					1,
					`${label} ${field} changed between repetitions`,
				);
			}
		const databaseVersions = new Set<string>();
		const valkeyVersions = new Set<string>();
		for (const run of runs)
			for (const sample of run.samples) {
				assert.ok(sample.database.available && sample.queues.available);
				databaseVersions.add(sample.database.value.identity.version);
				valkeyVersions.add(sample.queues.value.version);
			}
		assert.equal(databaseVersions.size, 1, 'PostgreSQL versions differ');
		assert.equal(valkeyVersions.size, 1, 'Valkey versions differ');
		for (const [metric, maximum] of Object.entries(absoluteLimits)) {
			for (const { id, metrics } of result.measurements) {
				const observed = metricValue(metrics, metric);
				result.limits.push({ id, metric, observed, maximum, passed: observed <= maximum });
			}
		}
		for (const condition of policy.conditions) {
			const values = (label: string, metric: string) =>
				experiment.runs
					.filter((run) => run.label === label && run.condition === condition)
					.map((run) => metricValue(result.measurements.find((item) => item.id === run.id)!.metrics, metric));
			for (const metric of Object.keys(result.measurements[0]!.metrics).filter(
				(key) => !key.endsWith('successCount'),
			)) {
				result.comparisons.push({
					condition,
					...compareMetric(metric, values('before', metric), values('after', metric)),
				});
			}
		}
		result.eligible =
			result.correctness.accepted &&
			result.limits.every((limit) => limit.passed) &&
			result.comparisons.every((comparison) => comparison.passed);
	} catch (error) {
		result.rejection = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
	}
	await save(join(directory, 'report.json'), result);
	console.log(JSON.stringify(result, null, 2));
	if (!result.eligible) process.exitCode = 1;
}

if (import.meta.main) {
	await main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
