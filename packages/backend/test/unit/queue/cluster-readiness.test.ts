/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { masterMain, spawnWorker } from '@/boot/master.js';
import { assignmentByWorkerId } from '@/boot/cluster-roles.js';
import { queueReadyRef, readyRef } from '@/boot/ready.js';
import { createHealthApp } from '@/server/health.js';
import type { Config } from '@/config.js';
import type { HealthDependencies } from '@/server/health.js';

const state = vi.hoisted(() => ({
	counts: { http: 2, queue: 2, total: 5 },
	fork: vi.fn(),
	workers: {} as Record<number, FakeWorker>,
}));
vi.mock('node:cluster', () => ({ default: state }));
vi.mock('@/env.js', () => ({
	envOption: { quiet: true, disableClustering: false, onlyServer: false, onlyQueue: false },
}));
vi.mock('@/misc/process-topology.js', () => ({ resolveHostProcessCounts: () => state.counts }));
vi.mock('@/misc/show-machine-info.js', () => ({ showMachineInfo: async () => {} }));
vi.mock('@/boot/common.js', () => ({ initExtraThreadPool: () => {} }));

let id = 0;
let readyBefore: boolean;
let queueReadyBefore: boolean;
class FakeWorker extends EventEmitter {
	id = ++id;
	dead = false;
	messages: { type: string; ready: boolean }[] = [];
	process = {
		kill: () => {
			queueMicrotask(() => this.exit());
		},
	};
	isDead() {
		return this.dead;
	}
	isConnected() {
		return !this.dead;
	}
	send(message: { type: string; ready: boolean }, callback: (error: null) => void) {
		this.messages.push(message);
		callback(null);
	}
	exit() {
		this.dead = true;
		delete state.workers[this.id];
		this.emit('exit', 1, null);
	}
}
const config = {
	runtime: { version: 'test' },
	instance: { url: 'https://example.test' },
	server: { process: {}, listen: { tcp: { address: '127.0.0.1', port: 3000 } } },
} as unknown as Config;
const redis = { ping: async () => 'PONG' };
const healthDeps = {
	redis,
	redisForPub: redis,
	redisForSub: redis,
	redisForTimelines: redis,
	db: { execute: async () => [] },
} as unknown as HealthDependencies;

beforeEach(() => {
	readyBefore = readyRef.value;
	queueReadyBefore = queueReadyRef.value;
	readyRef.value = true;
	state.counts = { http: 2, queue: 2, total: 5 };
	state.fork.mockImplementation(() => {
		const worker = new FakeWorker();
		state.workers[worker.id] = worker;
		return worker;
	});
});
afterEach(() => {
	readyRef.value = readyBefore;
	queueReadyRef.value = queueReadyBefore;
	assignmentByWorkerId.clear();
});

function markReady(worker: FakeWorker) {
	if (assignmentByWorkerId.get(worker.id)?.role === 'queue') {
		worker.emit('message', { type: 'queueReadiness', ready: true });
	}
	worker.emit('message', 'ready');
}

test('health and HTTP workers lose readiness when any required queue fails or exits, then recover on replacement readiness', async () => {
	const starting = masterMain(config);
	await vi.waitFor(() => expect(Object.values(state.workers)).toHaveLength(4));
	const health = createHealthApp(healthDeps);
	const workers = Object.values(state.workers);
	const queues = workers.filter((worker) => assignmentByWorkerId.get(worker.id)?.role === 'queue');
	const http = workers.filter((worker) => assignmentByWorkerId.get(worker.id)?.role === 'server');
	const queue = queues[0]!;
	markReady(queues[1]!);
	expect((await health.request('/')).status).toBe(503);
	for (const worker of workers) markReady(worker);
	const dispose = await starting;
	try {
		expect((await health.request('/')).status).toBe(200);
		queue.emit('message', { type: 'queueReadiness', ready: false });
		expect((await health.request('/')).status).toBe(503);
		for (const worker of http) expect(worker.messages.at(-1)?.ready).toBe(false);
		queue.exit();
		expect((await health.request('/')).status).toBe(503);
		const restarting = spawnWorker({ role: 'queue', ownsDaemons: false });
		const replacement = Object.values(state.workers).find((worker) => !workers.includes(worker))!;
		expect((await health.request('/')).status).toBe(503);
		markReady(replacement);
		await restarting;
		expect((await health.request('/')).status).toBe(200);
		for (const worker of http) expect(worker.messages.at(-1)?.ready).toBe(true);
	} finally {
		await dispose();
	}
});

test('HTTP-only topology needs no unowned queue consumer to report healthy', async () => {
	state.counts = { http: 2, queue: 0, total: 3 };
	const starting = masterMain(config);
	await vi.waitFor(() => expect(Object.values(state.workers)).toHaveLength(2));
	for (const worker of Object.values(state.workers)) markReady(worker);
	const dispose = await starting;
	try {
		expect((await createHealthApp(healthDeps).request('/')).status).toBe(200);
	} finally {
		await dispose();
	}
});

test('queue death before ready rejects startup and stops already spawned siblings', async () => {
	state.counts = { http: 2, queue: 1, total: 4 };
	const starting = masterMain(config);
	const started = starting.then(
		() => true,
		() => false,
	);
	await vi.waitFor(() => expect(Object.values(state.workers)).toHaveLength(3));
	const workers = Object.values(state.workers);
	workers.find((worker) => assignmentByWorkerId.get(worker.id)?.role === 'queue')!.exit();
	expect(await started).toBe(false);
	expect(workers.every((worker) => worker.isDead())).toBe(true);
});

test('queue death after individual ready but before sibling readiness rejects the whole startup', async () => {
	state.counts = { http: 2, queue: 1, total: 4 };
	readyRef.value = false;
	const starting = masterMain(config);
	const started = starting.then(
		() => true,
		() => false,
	);
	await vi.waitFor(() => expect(Object.values(state.workers)).toHaveLength(3));
	const workers = Object.values(state.workers);
	const queue = workers.find((worker) => assignmentByWorkerId.get(worker.id)?.role === 'queue')!;
	markReady(queue);
	queue.exit();
	for (const worker of workers) {
		if (worker !== queue) markReady(worker);
	}
	expect(await started).toBe(false);
	expect(workers.every((worker) => worker.isDead())).toBe(true);
});
