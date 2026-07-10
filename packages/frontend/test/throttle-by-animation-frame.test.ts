/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { throttleByAnimationFrame } from '@/utility/throttle-by-animation-frame.js';

describe('throttleByAnimationFrame', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('runs once per frame with the latest arguments', () => {
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
		const callback = vi.fn();
		const throttled = throttleByAnimationFrame(callback);

		throttled(1, 'first');
		throttled(2, 'latest');
		expect(frames.size).toBe(1);
		expect(callback).not.toHaveBeenCalled();

		const [id, frame] = frames.entries().next().value!;
		frames.delete(id);
		frame(16);
		expect(callback).toHaveBeenCalledOnce();
		expect(callback).toHaveBeenCalledWith(2, 'latest');

		throttled(3, 'next');
		expect(frames.size).toBe(1);
	});

	test('drops pending work when canceled', () => {
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
		const callback = vi.fn();
		const throttled = throttleByAnimationFrame(callback);

		throttled('pending');
		throttled.cancel();
		expect(frames.size).toBe(0);
		expect(callback).not.toHaveBeenCalled();

		throttled('new');
		expect(frames.size).toBe(1);
	});

	test('flushes pending work immediately with the latest arguments', () => {
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
		const callback = vi.fn();
		const throttled = throttleByAnimationFrame(callback);

		throttled('first');
		throttled('latest');
		throttled.flush();
		expect(frames.size).toBe(0);
		expect(callback).toHaveBeenCalledOnce();
		expect(callback).toHaveBeenCalledWith('latest');

		throttled.flush();
		expect(callback).toHaveBeenCalledOnce();
	});
});
