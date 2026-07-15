/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import WidgetActivityChart from '@/widgets/WidgetActivity.chart.vue';
import { createActivityData } from '@/widgets/WidgetActivity.vue';
import { sumChartSeries } from '@/features/charts/components/MkChart.vue';

const activity = Array.from({ length: 200 }, (_, index) => ({
	total: index + 4,
	notes: index + 1,
	replies: 2,
	renotes: 1,
}));

describe('WidgetActivityChart', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	test('renders at most once per frame while dragging and removes every listener afterward', async () => {
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
		const addEventListener = vi.spyOn(window, 'addEventListener');
		const removeEventListener = vi.spyOn(window, 'removeEventListener');

		const result = render(WidgetActivityChart, { props: { activity } });
		const svg = result.container.querySelector('svg');
		const noteLine = result.container.querySelector('polyline');
		assert(svg != null);
		assert(noteLine != null);
		const initialPoints = noteLine.getAttribute('points');

		await fireEvent.mouseDown(svg, { clientX: 0, clientY: 0 });
		await fireEvent.mouseMove(window, { clientX: -5, clientY: -10 });
		await fireEvent.mouseMove(window, { clientX: -10, clientY: -20 });
		expect(frames.size).toBe(1);
		expect(noteLine.getAttribute('points')).toBe(initialPoints);

		const [id, frame] = frames.entries().next().value!;
		frames.delete(id);
		frame(16);
		await nextTick();
		expect(noteLine.getAttribute('points')).not.toBe(initialPoints);

		await fireEvent.mouseMove(window, { clientX: -15, clientY: -30 });
		expect(frames.size).toBe(1);
		await fireEvent.mouseUp(window);
		expect(frames.size).toBe(0);

		for (const eventName of ['mousemove', 'mouseleave', 'mouseup']) {
			const addedHandler = addEventListener.mock.calls.find(([name]) => name === eventName)?.[1];
			expect(addedHandler).toBeDefined();
			expect(
				removeEventListener.mock.calls.some(([name, handler]) => name === eventName && handler === addedHandler),
			).toBe(true);
		}

		await fireEvent.mouseMove(window, { clientX: -20, clientY: -40 });
		expect(frames.size).toBe(0);
	});

	test('cancels pending drag work when unmounted', async () => {
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

		const result = render(WidgetActivityChart, { props: { activity } });
		const svg = result.container.querySelector('svg');
		assert(svg != null);
		await fireEvent.mouseDown(svg, { clientX: 0, clientY: 0 });
		await fireEvent.mouseMove(window, { clientX: -5, clientY: -10 });
		expect(frames.size).toBe(1);

		result.unmount();
		expect(frames.size).toBe(0);
	});

	test('rejects mismatched activity series instead of filling missing values with zero', () => {
		expect(() => createActivityData([1, 2], [3], [4, 5])).toThrow(
			'Activity series length mismatch: normal=2, reply=1, renote=2',
		);
	});

	test('rejects mismatched chart series instead of filling missing values with zero', () => {
		expect(() => sumChartSeries([1, 2], [3])).toThrow(
			'Chart series length mismatch: expected 2, received 1',
		);
	});
});
