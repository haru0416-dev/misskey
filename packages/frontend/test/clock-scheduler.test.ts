/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { ClockScheduler } from '@/utility/clock-scheduler.js';

describe('ClockScheduler', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('schedules only while visible and supports an explicit transition pause', () => {
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
		const tick = vi.fn(() => 1000);
		const scheduler = new ClockScheduler(tick);

		scheduler.start();
		expect(tick).toHaveBeenCalledOnce();
		expect(timers.size).toBe(1);

		hidden = true;
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(timers.size).toBe(0);

		hidden = false;
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(tick).toHaveBeenCalledTimes(2);
		expect(timers.size).toBe(1);

		scheduler.pause();
		expect(timers.size).toBe(0);
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(tick).toHaveBeenCalledTimes(2);

		scheduler.resume();
		expect(tick).toHaveBeenCalledTimes(3);
		expect(timers.size).toBe(1);

		scheduler.stop();
		expect(timers.size).toBe(0);
	});
});
