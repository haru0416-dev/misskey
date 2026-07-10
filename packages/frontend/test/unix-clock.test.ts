/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import './init';

const { widgetProps } = vi.hoisted(() => ({
	widgetProps: {
		transparent: false,
		fontSize: 1.5,
		showMs: true,
		showLabel: true,
	},
}));

vi.mock('@/widgets/widget.js', () => ({
	useWidgetPropsManager: () => ({
		widgetProps,
		configure: vi.fn(),
	}),
}));

import WidgetUnixClock from '@/widgets/WidgetUnixClock.vue';

describe('WidgetUnixClock', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		widgetProps.showMs = true;
	});

	test('updates millisecond display at most once per animation frame and pauses while hidden', () => {
		let visibilityState: DocumentVisibilityState = 'visible';
		vi.spyOn(window.document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
		vi.spyOn(window.document, 'hidden', 'get').mockImplementation(() => visibilityState === 'hidden');
		const setInterval = vi.spyOn(window, 'setInterval');
		let frameId = 0;
		const frames = new Map<number, FrameRequestCallback>();
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			const id = ++frameId;
			frames.set(id, callback);
			return id;
		});
		vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
			frames.delete(id);
		});

		const result = render(WidgetUnixClock);
		expect(setInterval).not.toHaveBeenCalled();
		expect(frames.size).toBe(1);

		const [id, frame] = frames.entries().next().value!;
		frames.delete(id);
		frame(16);
		expect(frames.size).toBe(1);

		visibilityState = 'hidden';
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(frames.size).toBe(0);

		visibilityState = 'visible';
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(frames.size).toBe(1);

		result.unmount();
		expect(frames.size).toBe(0);
	});

	test('aligns second-only updates to the next second and clears them while hidden', () => {
		widgetProps.showMs = false;
		let visibilityState: DocumentVisibilityState = 'visible';
		vi.spyOn(window.document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
		vi.spyOn(window.document, 'hidden', 'get').mockImplementation(() => visibilityState === 'hidden');
		vi.spyOn(Date, 'now').mockReturnValue(1234);
		const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame');
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

		const result = render(WidgetUnixClock);
		expect(requestAnimationFrame).not.toHaveBeenCalled();
		expect([...timers.values()].some(timer => timer.delay === 766)).toBe(true);

		visibilityState = 'hidden';
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(timers.size).toBe(0);

		result.unmount();
		expect(timers.size).toBe(0);
	});
});
