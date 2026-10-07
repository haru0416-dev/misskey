/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick } from 'vue';

const { idleAdd, idleDelete } = vi.hoisted(() => ({
	idleAdd: vi.fn(),
	idleDelete: vi.fn(),
}));

vi.mock('@/utility/idle-render.js', () => ({
	defaultIdlingRenderScheduler: {
		add: idleAdd,
		delete: idleDelete,
	},
}));

vi.mock('@/theme.js', () => ({
	themeManager: {
		currentCompiledTheme: { bg: '#fff', fg: '#333', accent: '#123' },
		on: vi.fn(),
		off: vi.fn(),
	},
}));

import MkDigitalClock from '@/components/display/MkDigitalClock.vue';
import MkAnalogClock from '@/components/display/MkAnalogClock.vue';

describe('clock component scheduling', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		idleAdd.mockClear();
		idleDelete.mockClear();
	});

	test('uses a second-boundary timer unless milliseconds are shown', async () => {
		let nextTimerId = 0;
		const setTimeout = vi.spyOn(window, 'setTimeout').mockImplementation(() => {
			return ++nextTimerId as unknown as ReturnType<typeof window.setTimeout>;
		});
		vi.spyOn(window, 'clearTimeout').mockImplementation(() => {});
		const now = () => new Date('2024-01-01T00:00:00.250Z');

		const result = render(MkDigitalClock, {
			props: {
				showMs: false,
				now,
			},
		});
		await nextTick();
		expect(setTimeout.mock.calls.some((call) => call[1] === 750)).toBe(true);
		expect(idleAdd).not.toHaveBeenCalled();

		await result.rerender({ showMs: true, now });
		expect(idleAdd).toHaveBeenCalledOnce();

		await result.rerender({ showMs: false, now });
		expect(idleDelete).toHaveBeenCalled();
		expect(setTimeout.mock.calls.filter((call) => call[1] === 750)).toHaveLength(2);

		result.unmount();
	});

	test.each([
		{ cancelBy: 'setting', rolloverSecond: 0, currentSecond: 2 },
		{ cancelBy: 'cancel', rolloverSecond: 0, currentSecond: 2 },
		{ cancelBy: 'cancel', rolloverSecond: 5, currentSecond: 5 },
	] as const)(
		'recovers after $cancelBy cancellation with rollover at second $rolloverSecond',
		async ({ cancelBy, rolloverSecond, currentSecond }) => {
			vi.useFakeTimers();
			const frames = new Map<number, FrameRequestCallback>();
			let nextFrame = 0;
			vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
				frames.set(++nextFrame, callback);
				return nextFrame;
			});
			vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id));
			let time = new Date('2024-01-01T00:00:59.950Z');
			const now = () => new Date(time);
			const view = render(MkAnalogClock, { props: { now, offset: 0, sAnimation: 'easeOut' } });
			try {
				time = new Date('2024-01-01T00:01:00.010Z');
				time.setSeconds(rolloverSecond);
				await vi.advanceTimersByTimeAsync(50);
				const secondHand = view.container.querySelector<SVGLineElement>('line[style*="rotateZ"]')!;
				expect(Number.parseFloat(secondHand.style.transform.slice('rotateZ('.length))).toBeCloseTo(Math.PI * 2);
				if (cancelBy === 'setting') await view.rerender({ now, offset: 0, sAnimation: 'none' });
				else secondHand.dispatchEvent(new TransitionEvent('transitioncancel', { propertyName: 'transform' }));
				time = new Date('2024-01-01T00:01:00.010Z');
				time.setSeconds(currentSecond);
				while (frames.size > 0) {
					const [id, callback] = frames.entries().next().value!;
					frames.delete(id);
					callback(0);
					await nextTick();
				}
				expect(Number.parseFloat(secondHand.style.transform.slice('rotateZ('.length))).toBeCloseTo(
					(Math.PI * currentSecond) / 30,
				);
			} finally {
				view.unmount();
				vi.useRealTimers();
			}
		},
	);

	test.each(['transition', 'frames'] as const)('unmount releases pending rollover %s', async (pending) => {
		vi.useFakeTimers();
		const frames = new Map<number, FrameRequestCallback>();
		let nextFrame = 0;
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			frames.set(++nextFrame, callback);
			return nextFrame;
		});
		vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id));
		let time = new Date('2024-01-01T00:00:59.950Z');
		const view = render(MkAnalogClock, { props: { now: () => new Date(time), offset: 0, sAnimation: 'easeOut' } });
		time = new Date('2024-01-01T00:01:00.010Z');
		try {
			await vi.advanceTimersByTimeAsync(50);
			const secondHand = view.container.querySelector<SVGLineElement>('line[style*="rotateZ"]')!;
			if (pending === 'frames')
				secondHand.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'transform' }));
			view.unmount();
			expect(frames.size).toBe(0);
			secondHand.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'transform' }));
			expect(frames.size).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});
