/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { DeferredTaskScheduler } from '@/utility/deferred-task-scheduler.js';

describe('DeferredTaskScheduler', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('coalesces requests, pauses while hidden, and reschedules changes made during a task', async () => {
		let hidden = false;
		vi.spyOn(window.document, 'hidden', 'get').mockImplementation(() => hidden);
		let nextTimerId = 0;
		const timers = new Map<number, TimerHandler>();
		vi.spyOn(window, 'setTimeout').mockImplementation((callback) => {
			const id = ++nextTimerId;
			timers.set(id, callback);
			return id as unknown as ReturnType<typeof window.setTimeout>;
		});
		vi.spyOn(window, 'clearTimeout').mockImplementation((id) => {
			timers.delete(id as unknown as number);
		});
		let finishTask: (() => void) | null = null;
		const task = vi.fn(() => new Promise<void>((resolve) => {
			finishTask = resolve;
		}));
		const scheduler = new DeferredTaskScheduler(task, 180_000);

		scheduler.request();
		scheduler.request();
		expect(timers.size).toBe(1);

		hidden = true;
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(timers.size).toBe(0);

		hidden = false;
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(timers.size).toBe(1);

		const timer = timers.entries().next().value!;
		timers.delete(timer[0]);
		if (typeof timer[1] === 'function') timer[1]();
		expect(task).toHaveBeenCalledOnce();

		scheduler.request();
		expect(timers.size).toBe(0);
		expect(finishTask).not.toBeNull();
		finishTask!();
		await Promise.resolve();
		await Promise.resolve();
		expect(timers.size).toBe(1);

		scheduler.dispose();
		expect(timers.size).toBe(0);
		scheduler.request();
		expect(timers.size).toBe(0);
	});
});
