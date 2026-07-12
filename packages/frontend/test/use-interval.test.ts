/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, h } from 'vue';
import { useInterval } from '@shared/utility/use-interval.js';

function createTimers() {
	let timerId = 0;
	type TimerId = ReturnType<typeof window.setTimeout>;
	const timers = new Map<TimerId, { callback: Parameters<typeof window.setTimeout>[0]; delay: number | undefined }>();
	vi.spyOn(window, 'setTimeout').mockImplementation((callback, delay) => {
		const id = ++timerId as unknown as TimerId;
		timers.set(id, { callback, delay });
		return id;
	});
	vi.spyOn(window, 'clearTimeout').mockImplementation((id) => {
		if (id != null) timers.delete(id as TimerId);
	});
	const scheduledCount = (delay: number) => [...timers.values()].filter((timer) => timer.delay === delay).length;
	const runNext = (delay: number) => {
		const [id, timer] = timers.entries().find(([, value]) => value.delay === delay)!;
		timers.delete(id);
		timer.callback();
	};
	return { timers, scheduledCount, runNext };
}

describe('useInterval', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	test('waits for async work and pauses while the document is hidden', async () => {
		let hidden = false;
		vi.spyOn(window.document, 'hidden', 'get').mockImplementation(() => hidden);
		const { scheduledCount, runNext } = createTimers();
		let resolveTask: (() => void) | null = null;
		const task = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveTask = resolve;
				}),
		);
		const Component = defineComponent({
			setup() {
				useInterval(task, 1000, { immediate: false, afterMounted: true });
				return () => h('div');
			},
		});

		const result = render(Component);
		expect(scheduledCount(1000)).toBe(1);
		runNext(1000);
		expect(task).toHaveBeenCalledOnce();
		expect(scheduledCount(1000)).toBe(0);

		resolveTask!();
		await Promise.resolve();
		await Promise.resolve();
		expect(scheduledCount(1000)).toBe(1);

		hidden = true;
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(scheduledCount(1000)).toBe(0);
		hidden = false;
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(scheduledCount(1000)).toBe(1);

		result.unmount();
		expect(scheduledCount(1000)).toBe(0);
	});

	test('runs immediately once and returned clear permanently disposes the timer', async () => {
		vi.spyOn(window.document, 'hidden', 'get').mockReturnValue(false);
		const { scheduledCount } = createTimers();
		const task = vi.fn();
		let clear: (() => void) | undefined;
		const Component = defineComponent({
			setup() {
				clear = useInterval(task, 1000, { immediate: true, afterMounted: true });
				return () => h('div');
			},
		});

		render(Component);
		expect(task).toHaveBeenCalledOnce();
		await Promise.resolve();
		await Promise.resolve();
		expect(scheduledCount(1000)).toBe(1);

		clear!();
		expect(scheduledCount(1000)).toBe(0);
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(scheduledCount(1000)).toBe(0);
	});
});
