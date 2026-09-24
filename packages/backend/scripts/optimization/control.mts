/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { inspect } from 'node:util';
import policy from './preregistration.json' with { type: 'json' };
import {
	absoluteLimits,
	assessCorrectness,
	harnessDigest,
	metricValue,
	runOne,
	summarizeRun,
	validateConfig,
} from './compare.mjs';
import { openRunRecording, readRunRecording, runRecord } from './recording.mjs';
import type { Run, RunRecord } from './recording.mjs';

type Config = Parameters<typeof runOne>[0];
type Control = {
	kind: 'identical-binary-control';
	condition: Run['condition'];
	pairs: number;
	halfWidthLog: number;
	interval: 'minimum-maximum-paired-log-ratios';
	earlyRejection: 'Stop when a failure or out-of-band pair makes the fixed final gate impossible; retain unexecuted planned runs';
	host: string;
	bun: string;
	configSha256: string;
	harnessSha256: string;
	preregistration: typeof policy;
	runs: RunRecord[];
	startedAt?: string;
	endedAt?: string;
	stopReason?: string;
};
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const latencyMetrics = ['posting', 'timeline', 'federationResponse', 'load'].flatMap((name) =>
	['p50', 'p95', 'p99'].map((quantile) => `${name}.${quantile}Ms`),
);
const describeError = (error: unknown) => inspect(error, { depth: null });

export function equivalence(pairs: { before: number; after: number }[], plannedPairs: number, halfWidthLog: number) {
	assert.ok(Number.isSafeInteger(plannedPairs) && plannedPairs >= 6 && pairs.length <= plannedPairs);
	assert.ok(Number.isFinite(halfWidthLog) && halfWidthLog > 0);
	const ratios = pairs.map(({ before, after }) => {
		assert.ok(Number.isFinite(before) && before > 0 && Number.isFinite(after) && after > 0);
		const ratio = after / before;
		assert.ok(Number.isFinite(ratio) && ratio > 0);
		return ratio;
	});
	const complete = pairs.length === plannedPairs;
	const band = [Math.exp(-halfWidthLog), Math.exp(halfWidthLog)] as const;
	const impossible = ratios.some((value) => value < band[0] || value > band[1]);
	return {
		complete,
		impossible,
		passed: complete && !impossible,
		ratios,
		band,
		interval: complete ? [Math.min(...ratios), Math.max(...ratios)] : null,
		// 独立で連続なpaired差を仮定した各指標の周辺被覆。指標間の同時被覆や検出力ではない。
		marginalCoverageUnderIndependentContinuousPairs: complete ? 1 - 2 ** (1 - plannedPairs) : null,
	};
}

async function report(control: Control, config: Config, directory: string) {
	const errors: string[] = [];
	const measurements: { id: string; round: number; label: Run['label']; metrics: Record<string, number> }[] = [];
	const correctness: { id: string; result: ReturnType<typeof assessCorrectness> }[] = [];
	const limits: { id: string; metric: string; observed: number; maximum: number; passed: boolean }[] = [];
	let identity: string | undefined;
	let versions: string | undefined;
	for (const record of control.runs) {
		if (record.state === 'pending') continue;
		try {
			const run = await readRunRecording(join(directory, 'runs', `${record.id}.jsonl`), record);
			const checked = assessCorrectness(run, config[run.label].peers[1]);
			correctness.push({ id: record.id, result: checked });
			const metrics = summarizeRun(run, checked);
			assert.ok(
				latencyMetrics.every((metric) => metricValue(metrics, metric) > 0),
				'A/A requires positive finite HTTP durations',
			);
			assert.ok(run.identity);
			const currentIdentity = JSON.stringify({
				revision: run.identity.revision,
				lock: run.identity.lockSha256,
				build: run.identity.buildSha256,
				config: run.identity.configSha256,
				versions: run.identity.processes.map((process) => process.version),
			});
			if (identity !== undefined) assert.equal(currentIdentity, identity, 'A/A artifact/config identity drift');
			identity = currentIdentity;
			for (const sample of run.samples) {
				assert.ok(sample.database.available && sample.queues.available);
				const currentVersions = JSON.stringify([sample.database.value.identity.version, sample.queues.value.version]);
				if (versions !== undefined) assert.equal(currentVersions, versions, 'A/A database/Valkey version drift');
				versions = currentVersions;
			}
			for (const [metric, maximum] of Object.entries(absoluteLimits)) {
				const observed = metricValue(metrics, metric);
				const passed = observed <= maximum;
				limits.push({ id: record.id, metric, observed, maximum, passed });
				if (!passed) errors.push(`${record.id}: ${metric} exceeds its unchanged absolute gate`);
			}
			measurements.push({ id: record.id, round: record.round, label: record.label, metrics });
		} catch (error) {
			errors.push(`${record.id}: ${describeError(error)}`);
		}
	}
	const comparisons = latencyMetrics.map((metric) => {
		const pairs: { before: number; after: number }[] = [];
		for (let round = 1; round <= control.pairs; round++) {
			const before = measurements.find((item) => item.round === round && item.label === 'before');
			const after = measurements.find((item) => item.round === round && item.label === 'after');
			if (before && after)
				pairs.push({ before: metricValue(before.metrics, metric), after: metricValue(after.metrics, metric) });
		}
		return { metric, pairs, ...equivalence(pairs, control.pairs, control.halfWidthLog) };
	});
	const complete = measurements.length === control.runs.length;
	const rejected = errors.length > 0 || comparisons.some((item) => item.impossible);
	const result = {
		kind: control.kind,
		condition: control.condition,
		eligible: false,
		planned: control.runs.length,
		executed: control.runs.filter((run) => run.state !== 'pending').length,
		notExecuted: control.runs.filter((run) => run.state === 'pending').length,
		excluded: 0,
		complete,
		rejected,
		repeatabilitySupportedForCondition: complete && !rejected && comparisons.every((item) => item.passed),
		interpretation:
			'Identical-binary diagnostic, not a candidate adoption prerequisite or verdict. Marginal intervals assume independent continuous paired differences; no simultaneous-coverage or effect-detection power guarantee. Report measurement uncertainty separately from the user-approved adoption limits.',
		identity,
		versions,
		correctness,
		limits,
		measurements,
		comparisons,
		errors,
	};
	await writeFile(join(directory, 'report.json'), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
	return result;
}

async function main() {
	assert.ok(Bun, 'The control driver requires Bun');
	const [mode, configArgument, directoryArgument, conditionArgument, ...extra] = Bun.argv.slice(2);
	assert.ok(
		mode && ['init', 'run', 'report'].includes(mode) && configArgument && directoryArgument && extra.length === 0,
	);
	assert.ok(
		mode === 'init' ? conditionArgument === 'cold' || conditionArgument === 'warm' : conditionArgument === undefined,
	);
	const directory = resolve(directoryArgument);
	const configBytes = await readFile(resolve(configArgument));
	const config: Config = JSON.parse(configBytes.toString());
	validateConfig(config);
	assert.deepEqual(
		config.before,
		config.after,
		'A/A requires identical deployments, not merely equal revision strings',
	);
	assert.equal(policy.rounds, 6, 'This minimum-maximum control is registered for six balanced pairs');
	const planned: Pick<RunRecord, 'id' | 'round' | 'label'>[] = [];
	for (let round = 1; round <= policy.rounds; round++) {
		const order: Run['label'][] = round % 2 ? ['before', 'after'] : ['after', 'before'];
		for (const label of order) planned.push({ id: `${round}-${label}`, round, label });
	}
	const path = join(directory, 'control.json');
	if (mode === 'init') {
		assert.ok(conditionArgument === 'cold' || conditionArgument === 'warm');
		const runs: RunRecord[] = planned.map((item) => ({
			...item,
			condition: conditionArgument,
			state: 'pending',
			stage: 'planned',
		}));
		await mkdir(directory, { mode: 0o700 });
		await mkdir(join(directory, 'runs'), { mode: 0o700 });
		const control: Control = {
			kind: 'identical-binary-control',
			condition: conditionArgument,
			pairs: policy.rounds,
			halfWidthLog: 0.5 * Math.log(1 + policy.adoption.maximumLatencyRegressionFraction),
			interval: 'minimum-maximum-paired-log-ratios',
			earlyRejection:
				'Stop when a failure or out-of-band pair makes the fixed final gate impossible; retain unexecuted planned runs',
			host: hostname(),
			bun: Bun.version,
			configSha256: hash(configBytes),
			harnessSha256: await harnessDigest(),
			preregistration: policy,
			runs,
		};
		await writeFile(path, `${JSON.stringify(control, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
		console.log(JSON.stringify({ registered: true, planned: runs.length, condition: conditionArgument, path }));
		return;
	}
	const control: Control = JSON.parse(await readFile(path, 'utf8'));
	assert.equal(control.kind, 'identical-binary-control');
	assert.equal(control.host, hostname());
	assert.equal(control.bun, Bun.version);
	assert.equal(control.configSha256, hash(configBytes));
	assert.equal(control.harnessSha256, await harnessDigest(), 'Registered harness changed');
	assert.deepEqual(control.preregistration, policy);
	assert.equal(control.pairs, policy.rounds);
	assert.ok(['cold', 'warm'].includes(control.condition));
	assert.deepEqual(
		control.runs.map(({ id, round, label }) => ({ id, round, label })),
		planned,
	);
	assert.ok(control.runs.every((run) => run.condition === control.condition));
	assert.equal(control.halfWidthLog, 0.5 * Math.log(1 + policy.adoption.maximumLatencyRegressionFraction));
	if (mode === 'run') {
		assert.ok(
			!control.startedAt && control.runs.every((run) => run.state === 'pending'),
			'Interrupted or completed controls cannot be extended or resumed',
		);
		const lockPath = '/tmp/misskey-optimization-host.lock';
		const lock = await open(lockPath, 'wx', 0o600);
		let writes = Promise.resolve();
		const save = () => {
			const text = `${JSON.stringify(control, null, 2)}\n`;
			writes = writes.then(async () => {
				await writeFile(`${path}.tmp`, text, { mode: 0o600 });
				await rename(`${path}.tmp`, path);
			});
			return writes;
		};
		try {
			await lock.writeFile(JSON.stringify({ pid: process.pid, host: hostname(), directory }));
			control.startedAt = new Date().toISOString();
			await save();
			console.log('optimization-control-ready');
			for (let index = 0; index < control.runs.length; index++) {
				const run: Run = {
					...control.runs[index]!,
					workload: { requests: {}, correctness: [], completion: [] },
					samples: [],
					commands: [],
				};
				let openedRecording: Awaited<ReturnType<typeof openRunRecording>> | undefined;
				let buffering = false;
				let lastStage = '';
				try {
					run.stage = 'open-recording';
					const recording = await openRunRecording(join(directory, 'runs', `${run.id}.jsonl`), run);
					openedRecording = recording;
					await runOne(
						config,
						run,
						async () => {
							const metadata = await recording.persist();
							if (metadata) {
								control.runs[index] = metadata;
								if (!buffering) await save();
							}
							if (run.stage !== lastStage) {
								lastStage = run.stage;
								console.log(JSON.stringify({ id: run.id, stage: run.stage, at: new Date().toISOString() }));
							}
						},
						async (enabled) => {
							if (enabled) {
								buffering = true;
								await writes;
								await recording.setBuffering(true);
							} else {
								try {
									await recording.setBuffering(false);
								} finally {
									buffering = false;
								}
								await save();
							}
						},
					);
				} catch (error) {
					run.state = 'failed';
					run.error = `${run.error ?? ''}\nControl runner: ${describeError(error)}`;
					run.endedAt = new Date().toISOString();
				} finally {
					let journalSha256: string | undefined;
					try {
						if (openedRecording) journalSha256 = await openedRecording.close();
					} catch (error) {
						run.state = 'failed';
						run.error = `${run.error ?? ''}\nRecording: ${describeError(error)}`;
					}
					control.runs[index] = { ...runRecord(run), ...(journalSha256 === undefined ? {} : { journalSha256 }) };
					await save();
				}
				const result = await report(control, config, directory);
				console.log(
					JSON.stringify({
						completed: run.id,
						state: run.state,
						rejected: result.rejected,
						executed: result.executed,
						planned: result.planned,
					}),
				);
				if (result.rejected) {
					control.stopReason =
						'The fixed final equivalence or validity gate is already impossible; remaining planned runs were not executed or excluded.';
					break;
				}
			}
			control.endedAt = new Date().toISOString();
			await save();
		} finally {
			await lock.close();
			await unlink(lockPath);
		}
	}
	const result = await report(control, config, directory);
	console.log(
		JSON.stringify({
			complete: result.complete,
			rejected: result.rejected,
			repeatabilitySupportedForCondition: result.repeatabilitySupportedForCondition,
			executed: result.executed,
			planned: result.planned,
			excluded: result.excluded,
		}),
	);
	process.exitCode = result.repeatabilitySupportedForCondition ? 0 : 1;
}

if (import.meta.main)
	await main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
