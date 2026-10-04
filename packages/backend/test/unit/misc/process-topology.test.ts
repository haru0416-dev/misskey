/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, expect, test, vi } from 'vitest';
import type { Config } from '@/config.js';
import { resolveDatabasePoolSize } from '@/misc/process-topology.js';

const envOption = vi.hoisted(() => ({ disableClustering: false, onlyServer: false, onlyQueue: false }));
vi.mock('@/env.js', () => ({ envOption }));
vi.mock('node:os', () => ({ cpus: () => Array.from({ length: 4 }, () => ({})) }));

beforeEach(() => {
	envOption.disableClustering = false;
	envOption.onlyServer = false;
	envOption.onlyQueue = false;
});

function config(httpWorkers: number, queueWorkers: number, budget: number): Config {
	return {
		server: { process: { httpWorkers, queueWorkers } },
		database: { pool: { maximumConnectionsPerHost: budget } },
	} as Config;
}

test('rejects a budget below the DB process count instead of exceeding it', () => {
	expect(() => resolveDatabasePoolSize(config(2, 1, 2))).toThrow('DB-using processes (3)');
	expect(resolveDatabasePoolSize(config(2, 1, 3))).toBe(1);
});

test('excludes the fork-only master and leaves division remainders unallocated', () => {
	expect(resolveDatabasePoolSize(config(2, 1, 10))).toBe(3);
});

test('uses the effective CPU-limited counts rather than the requested counts', () => {
	expect(resolveDatabasePoolSize(config(10, 0, 4))).toBe(1);
	expect(() => resolveDatabasePoolSize(config(10, 0, 3))).toThrow('DB-using processes (4)');
});

test('allocates the budget only to the roles hosted locally', () => {
	envOption.onlyServer = true;
	expect(resolveDatabasePoolSize(config(2, 3, 6))).toBe(3);
	envOption.onlyServer = false;
	envOption.onlyQueue = true;
	expect(resolveDatabasePoolSize(config(2, 3, 6))).toBe(2);
});

test('shares one pool when clustering is disabled', () => {
	envOption.disableClustering = true;
	expect(resolveDatabasePoolSize(config(4, 4, 1))).toBe(1);
});

test('reserves a connection for the fallback HTTP process', () => {
	expect(resolveDatabasePoolSize(config(0, 0, 1))).toBe(1);
});
