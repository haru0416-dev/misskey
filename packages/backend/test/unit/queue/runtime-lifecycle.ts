/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, expect, test, vi } from 'vitest';
import { jobQueue } from '@/boot/common.js';
import type { Config } from '@/config.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';

const state = vi.hoisted(() => ({
	failure: undefined as 'scheduler' | 'start' | 'stop' | undefined,
	resourceOpen: true,
	consumerOpen: false,
}));
vi.mock('slacc', () => ({ init: () => {} }));
vi.mock('@/core/events.js', () => ({ createEventPublishers: () => ({}) }));
vi.mock('@/queue/system-job-schedulers.js', () => ({
	syncSystemJobSchedulers: async () => {
		if (state.failure === 'scheduler') throw new Error('scheduler failed');
	},
}));
vi.mock('@/queue/worker.js', () => ({
	createQueueWorkers: (_deps: unknown, changed: (ready: boolean) => void) => ({
		start: async () => {
			state.consumerOpen = true;
			if (state.failure === 'start') throw new Error('consumer start failed');
			changed(true);
		},
		stop: async () => {
			state.consumerOpen = false;
			changed(false);
			if (state.failure === 'stop') throw new Error('consumer stop failed');
		},
	}),
}));
vi.mock('@/runtime-dependencies.js', () => ({
	createRuntimeDependencies: async () => ({
		config: {},
		loggerService: { getLogger: () => ({ error: () => {} }) },
		dispose: async () => {
			state.resourceOpen = false;
		},
	}),
}));

const config = {} as Config;
const shared = {
	config,
	loggerService: { getLogger: () => ({ error: () => {} }) },
	dispose: async () => {
		state.resourceOpen = false;
	},
} as unknown as RuntimeDependencies;
function useResource() {
	if (!state.resourceOpen) throw new Error('resource is closed');
	return 'usable';
}

beforeEach(() => {
	state.failure = undefined;
	state.resourceOpen = true;
	state.consumerOpen = false;
});

for (const failure of ['scheduler', 'start'] as const) {
	test(`${failure} failure releases owned resources and partially started consumers`, async () => {
		state.failure = failure;
		await expect(jobQueue(config)).rejects.toThrow();
		expect(() => useResource()).toThrow('resource is closed');
		expect(state.consumerOpen).toBe(false);
	});

	test(`${failure} failure leaves shared resources usable`, async () => {
		state.failure = failure;
		await expect(jobQueue(config, shared)).rejects.toThrow();
		expect(useResource()).toBe('usable');
		expect(state.consumerOpen).toBe(false);
	});
}

for (const owned of [true, false]) {
	test(`stop failure still releases consumers, preserves ownership, and close is idempotent (owned=${owned})`, async () => {
		const runtime = await jobQueue(config, owned ? undefined : shared);
		expect(runtime.isReady()).toBe(true);
		state.failure = 'stop';
		const stopping = runtime.close();
		expect(runtime.close()).toBe(stopping);
		await expect(stopping).rejects.toThrow();
		expect(runtime.isReady()).toBe(false);
		expect(state.consumerOpen).toBe(false);
		if (owned) expect(() => useResource()).toThrow('resource is closed');
		else expect(useResource()).toBe('usable');
	});
}
