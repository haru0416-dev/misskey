/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import './init';

import MkPullToRefresh from '@/components/layout/MkPullToRefresh.vue';

describe('MkPullToRefresh', () => {
	afterEach(() => {
		cleanup();
		document.body.replaceChildren();
		vi.restoreAllMocks();
	});

	test('coalesces movement and releases with animation frames instead of an interval', async () => {
		vi.spyOn(window.performance, 'now').mockReturnValue(0);
		const setInterval = vi.spyOn(window, 'setInterval');
		let nextFrameId = 0;
		const frames = new Map<number, FrameRequestCallback>();
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			const id = ++nextFrameId;
			frames.set(id, callback);
			return id;
		});
		vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
			frames.delete(id);
		});
		const scrollContainer = document.createElement('div');
		scrollContainer.style.overflowY = 'auto';
		document.body.append(scrollContainer);
		const result = render(MkPullToRefresh, {
			container: scrollContainer,
			props: {
				refresher: vi.fn(() => Promise.resolve()),
			},
		});
		await nextTick();
		const root = result.container.firstElementChild!;

		root.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 1, screenY: 0 }));
		window.dispatchEvent(new MouseEvent('mousemove', { screenY: 80 }));
		window.dispatchEvent(new MouseEvent('mousemove', { screenY: 100 }));
		expect(frames.size).toBe(1);

		window.dispatchEvent(new MouseEvent('mouseup', { screenY: 100 }));
		expect(frames.size).toBe(1);
		expect(setInterval).not.toHaveBeenCalled();

		let frame = frames.entries().next().value!;
		frames.delete(frame[0]);
		frame[1](100);
		expect(frames.size).toBe(1);
		frame = frames.entries().next().value!;
		frames.delete(frame[0]);
		frame[1](200);
		await Promise.resolve();
		expect(frames.size).toBe(0);

		result.unmount();
		window.dispatchEvent(new MouseEvent('mousemove', { screenY: 200 }));
		expect(frames.size).toBe(0);
	});
});
