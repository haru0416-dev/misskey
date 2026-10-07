/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { physics } from '@/utility/physics.js';

describe('physics', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('stops native input capture and frame work, and remains stopped on resume', () => {
		const frames = new Map<number, FrameRequestCallback>();
		let nextFrame = 0;
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			frames.set(++nextFrame, callback);
			return nextFrame;
		});
		vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
			frames.delete(id);
		});
		const container = document.createElement('div');
		container.style.cssText = 'width: 300px; height: 300px';
		container.innerHTML = '<div style="width: 20px; height: 20px">object</div>';
		document.body.append(container);
		const controller = physics(container);
		try {
			const captured = new WheelEvent('wheel', { cancelable: true });
			container.dispatchEvent(captured);
			expect(captured.defaultPrevented).toBe(true);

			controller.pause();
			const paused = new WheelEvent('wheel', { cancelable: true });
			container.dispatchEvent(paused);
			expect(paused.defaultPrevented).toBe(false);
			expect(frames.size).toBe(0);

			controller.resume();
			const resumed = new WheelEvent('wheel', { cancelable: true });
			container.dispatchEvent(resumed);
			expect(resumed.defaultPrevented).toBe(true);

			controller.stop();
			controller.stop();
			controller.resume();
			const stopped = new WheelEvent('wheel', { cancelable: true });
			container.dispatchEvent(stopped);
			expect(stopped.defaultPrevented).toBe(false);
			expect(frames.size).toBe(0);
		} finally {
			controller.stop();
			container.remove();
		}
	});
});
