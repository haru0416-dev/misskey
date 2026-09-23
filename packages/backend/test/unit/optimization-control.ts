/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { equivalence } from '../../scripts/optimization/control.mjs';
import { compareMetric } from '../../scripts/optimization/compare.mjs';
import policy from '../../scripts/optimization/preregistration.json' with { type: 'json' };

describe('identical-binary equivalence control', () => {
	test('requires every planned pair and accepts the exact registered boundaries', () => {
		const width = Math.log(1.05) / 2;
		const pairs = [Math.exp(-width), 1, 1, 1, 1, Math.exp(width)].map((after) => ({ before: 1, after }));
		const incomplete = equivalence(pairs.slice(0, 5), 6, width);
		expect(incomplete.passed).toBe(false);
		expect(incomplete.interval).toBeNull();
		expect(incomplete.marginalCoverageUnderIndependentContinuousPairs).toBeNull();
		const complete = equivalence(pairs, 6, width);
		expect(complete.passed).toBe(true);
		expect(complete.interval).toEqual(complete.band);
	});

	test('an out-of-band pair cannot be repaired by adding favorable pairs or reversing labels', () => {
		const width = Math.log(1.05) / 2;
		for (const first of [
			{ before: 1, after: 1.1 },
			{ before: 1.1, after: 1 },
		]) {
			expect(equivalence([first], 6, width).impossible).toBe(true);
			const result = equivalence([first, ...Array.from({ length: 5 }, () => ({ before: 1, after: 1 }))], 6, width);
			expect(result.passed).toBe(false);
		}
		expect(() => equivalence([{ before: 0, after: 1 }], 6, width)).toThrow();
	});
});

describe('user-approved performance allowance', () => {
	const values = (value: number) => Array.from({ length: policy.rounds }, () => value);

	test('accepts an unchanged or slightly slower posting p95 without requiring improvement', () => {
		for (const after of [100, 108, 110]) {
			expect(compareMetric('posting.p95Ms', values(100), values(after)).passed).toBe(true);
		}
		expect(compareMetric('posting.p95Ms', values(100), values(110.01)).passed).toBe(false);
	});

	test('retains latency, completion and resource limits for every metric', () => {
		for (const metric of ['timeline.p99Ms', 'shutdown.durationMs', 'process.cpuMs', 'process.ioBytes']) {
			expect(compareMetric(metric, values(100), values(110)).passed).toBe(true);
			expect(compareMetric(metric, values(100), values(111)).passed).toBe(false);
		}
	});

	test('does not discard zero baselines or incomplete pairs', () => {
		expect(compareMetric('queue.peakBacklog', values(0), values(0)).passed).toBe(true);
		expect(compareMetric('queue.peakBacklog', values(0), [1, ...values(0).slice(1)]).passed).toBe(false);
		expect(() => compareMetric('posting.p95Ms', values(100), values(100).slice(1))).toThrow();
	});
});
