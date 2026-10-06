/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { SnowfallAnimationScheduler } from '@/utility/snowfall-effect.js';

describe('SnowfallAnimationScheduler', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('pauses while hidden and excludes hidden time after resuming', () => {
		let hidden = false;
		vi.spyOn(window.document, 'hidden', 'get').mockImplementation(() => hidden);
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
		const onFrame = vi.fn();
		const scheduler = new SnowfallAnimationScheduler(onFrame);

		scheduler.start();
		expect(frames.size).toBe(1);
		let frame = frames.entries().next().value!;
		frames.delete(frame[0]);
		frame[1](100);
		expect(onFrame).toHaveBeenLastCalledWith(0, 0);

		frame = frames.entries().next().value!;
		frames.delete(frame[0]);
		frame[1](116);
		expect(onFrame).toHaveBeenLastCalledWith(16, 16);

		hidden = true;
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(frames.size).toBe(0);

		hidden = false;
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(frames.size).toBe(1);
		frame = frames.entries().next().value!;
		frames.delete(frame[0]);
		frame[1](1000);
		expect(onFrame).toHaveBeenLastCalledWith(16, 0);

		scheduler.dispose();
		expect(frames.size).toBe(0);
	});
});
