/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { PollingScheduler } from '@shared/utility/polling-scheduler.js';

function createTimers() {
	let timerId = 0;
	type TimerId = ReturnType<typeof window.setTimeout>;
	const timers = new Map<TimerId, Parameters<typeof window.setTimeout>[0]>();
	vi.spyOn(window, 'setTimeout').mockImplementation((callback) => {
		const id = ++timerId as unknown as TimerId;
		timers.set(id, callback);
		return id;
	});
	vi.spyOn(window, 'clearTimeout').mockImplementation((id) => {
		if (id != null) timers.delete(id as TimerId);
	});
	const runNext = () => {
		const [id, callback] = timers.entries().next().value!;
		timers.delete(id);
		callback();
	};
	return { timers, runNext };
}

describe('PollingScheduler', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('runs only while active and visible without overlapping requests', async () => {
		let hidden = false;
		vi.spyOn(window.document, 'hidden', 'get').mockImplementation(() => hidden);
		const { timers, runNext } = createTimers();
		let resolveTask: (() => void) | null = null;
		const task = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveTask = resolve;
				}),
		);
		const scheduler = new PollingScheduler(task, 10_000);

		expect(timers.size).toBe(0);
		scheduler.start();
		scheduler.start();
		expect(timers.size).toBe(1);

		runNext();
		expect(task).toHaveBeenCalledOnce();
		expect(timers.size).toBe(0);
		scheduler.start();
		expect(timers.size).toBe(0);

		resolveTask!();
		await Promise.resolve();
		await Promise.resolve();
		expect(timers.size).toBe(1);

		hidden = true;
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(timers.size).toBe(0);

		hidden = false;
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(timers.size).toBe(1);

		scheduler.stop();
		expect(timers.size).toBe(0);
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(timers.size).toBe(0);
	});

	test('can stop itself after a poll and becomes inert after disposal', async () => {
		vi.spyOn(window.document, 'hidden', 'get').mockReturnValue(false);
		const { timers, runNext } = createTimers();
		let scheduler: PollingScheduler;
		const task = vi.fn(() => {
			scheduler.stop();
		});
		scheduler = new PollingScheduler(task, 10_000);

		scheduler.start();
		runNext();
		await Promise.resolve();
		expect(task).toHaveBeenCalledOnce();
		expect(timers.size).toBe(0);

		scheduler.dispose();
		scheduler.start();
		expect(timers.size).toBe(0);
	});
});
